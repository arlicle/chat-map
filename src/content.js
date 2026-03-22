(function initContentScript() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const NAVIGATION_EVENT = "qnav:navigation";
  if (root.appStarted) {
    return;
  }

  root.appStarted = true;

  const storage = root.storage;
  const extractor = root.extractor;
  const navigator = root.navigator;
  const outlineModule = root.outline;
  const panelModule = root.panel;
  const observerModule = root.observer;
  const virtualizerModule = root.virtualizer;

  const appState = {
    panelState: storage ? storage.DEFAULT_PANEL_STATE : { collapsed: false, width: 320 },
    questions: [],
    activeQuestionId: null,
    currentUrl: window.location.href,
    questionsSignature: "",
    searchQuery: "",
    searchResults: []
  };

  let panel = null;
  let adapter = null;
  let mutationObserver = null;
  let observationRoot = null;
  let virtualizer = null;
  let outline = null;
  let syncScheduled = false;
  let layoutRefreshFrame = null;

  function applyResponsiveLayout(state) {
    const panelState = storage && typeof storage.normalizePanelState === "function"
      ? storage.normalizePanelState(state || appState.panelState)
      : Object.assign({ collapsed: false, width: 320 }, state || appState.panelState || {});
    const reservedWidth = panelState.collapsed ? 40 : panelState.width + 40;

    appState.panelState = panelState;
    document.documentElement.style.setProperty("--qnav-panel-reserve", reservedWidth + "px");
    document.documentElement.dataset.qnavPanelCollapsed = panelState.collapsed ? "true" : "false";

    if (layoutRefreshFrame !== null) {
      window.cancelAnimationFrame(layoutRefreshFrame);
    }

    layoutRefreshFrame = window.requestAnimationFrame(() => {
      layoutRefreshFrame = null;
      if (outline && typeof outline.refreshLayout === "function") {
        outline.refreshLayout();
      }
    });
  }

  function clearResponsiveLayout() {
    document.documentElement.style.removeProperty("--qnav-panel-reserve");
    delete document.documentElement.dataset.qnavPanelCollapsed;
  }

  function getQuestionById(questionId) {
    return appState.questions.find((item) => item.id === questionId) || null;
  }

  function normalizeSearchText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function getHighlightTerms(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return [];
    }

    const seen = new Set();
    return normalizedQuery
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .filter((term) => {
        const key = term.toLowerCase();
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function escapeForPreview(text) {
    return normalizeSearchText(text);
  }

  function buildSearchPreview(text, query) {
    const normalizedText = escapeForPreview(text);
    const normalizedQuery = normalizeSearchText(query).toLowerCase();
    if (!normalizedText || !normalizedQuery) {
      return normalizedText;
    }

    const haystack = normalizedText.toLowerCase();
    const matchIndex = haystack.indexOf(normalizedQuery);
    if (matchIndex === -1) {
      return normalizedText.slice(0, 72);
    }

    const previewStart = Math.max(0, matchIndex - 24);
    const previewEnd = Math.min(normalizedText.length, matchIndex + normalizedQuery.length + 36);
    let preview = normalizedText.slice(previewStart, previewEnd).trim();
    if (previewStart > 0) {
      preview = "…" + preview;
    }
    if (previewEnd < normalizedText.length) {
      preview += "…";
    }

    return preview;
  }

  function buildSearchResults(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return [];
    }

    const needle = normalizedQuery.toLowerCase();
    const results = [];

    appState.questions.forEach((question) => {
      const questionText = normalizeSearchText(question.questionText || question.text);
      const answerText = normalizeSearchText(question.answerText);

      if (questionText && questionText.toLowerCase().indexOf(needle) !== -1) {
        results.push({
          questionId: question.id,
          index: question.index,
          matchType: "question",
          title: question.shortTitle || truncateText(questionText, 72),
          preview: buildSearchPreview(questionText, normalizedQuery)
        });
      }

      if (answerText && answerText.toLowerCase().indexOf(needle) !== -1) {
        results.push({
          questionId: question.id,
          index: question.index,
          matchType: "answer",
          title: question.shortTitle || truncateText(questionText, 72),
          preview: buildSearchPreview(answerText, normalizedQuery)
        });
      }
    });

    return results;
  }

  function truncateText(text, limit) {
    const normalized = normalizeSearchText(text);
    if (!normalized) {
      return "";
    }

    if (normalized.length <= limit) {
      return normalized;
    }

    return normalized.slice(0, Math.max(0, limit - 1)).trimEnd() + "\u2026";
  }

  function flashElement(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.classList.add("qnav-flash");
    window.clearTimeout(element.__qnavSearchFlashTimer);
    element.__qnavSearchFlashTimer = window.setTimeout(() => {
      element.classList.remove("qnav-flash");
    }, 1500);
  }

  function clearSearchHighlights(scopeEl) {
    const rootEl = scopeEl instanceof HTMLElement ? scopeEl : document;
    rootEl.querySelectorAll(".qnav-search-hit").forEach((markEl) => {
      if (!(markEl instanceof HTMLElement) || !markEl.parentNode) {
        return;
      }

      const parentNode = markEl.parentNode;
      markEl.replaceWith(document.createTextNode(markEl.textContent || ""));
      if (typeof parentNode.normalize === "function") {
        parentNode.normalize();
      }
    });
  }

  function collectHighlightTextNodes(element) {
    if (!(element instanceof HTMLElement)) {
      return [];
    }

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.textContent || !node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          const parentEl = node.parentElement;
          if (!parentEl) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parentEl.closest(".qnav-search-hit")) {
            return NodeFilter.FILTER_REJECT;
          }

          const tagName = parentEl.tagName;
          if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT" || tagName === "TEXTAREA") {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      nodes.push(currentNode);
      currentNode = walker.nextNode();
    }
    return nodes;
  }

  function buildTextMatches(text, terms) {
    const sourceText = String(text || "");
    const lowerText = sourceText.toLowerCase();
    const rawMatches = [];

    terms.forEach((term) => {
      const lowerTerm = term.toLowerCase();
      let fromIndex = 0;

      while (fromIndex < lowerText.length) {
        const matchIndex = lowerText.indexOf(lowerTerm, fromIndex);
        if (matchIndex === -1) {
          break;
        }

        rawMatches.push({
          start: matchIndex,
          end: matchIndex + lowerTerm.length
        });
        fromIndex = matchIndex + lowerTerm.length;
      }
    });

    rawMatches.sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }

      return right.end - left.end;
    });

    const mergedMatches = [];
    rawMatches.forEach((match) => {
      const previousMatch = mergedMatches[mergedMatches.length - 1];
      if (previousMatch && match.start < previousMatch.end) {
        return;
      }

      mergedMatches.push(match);
    });

    return mergedMatches;
  }

  function highlightSearchTerms(element, query) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const terms = getHighlightTerms(query);
    if (!terms.length) {
      return false;
    }

    let hasHighlight = false;
    collectHighlightTextNodes(element).forEach((textNode) => {
      const textContent = textNode.textContent || "";
      const matches = buildTextMatches(textContent, terms);
      if (!matches.length) {
        return;
      }

      const fragment = document.createDocumentFragment();
      let cursor = 0;

      matches.forEach((match) => {
        if (match.start > cursor) {
          fragment.appendChild(document.createTextNode(textContent.slice(cursor, match.start)));
        }

        const markEl = document.createElement("mark");
        markEl.className = "qnav-search-hit";
        markEl.textContent = textContent.slice(match.start, match.end);
        fragment.appendChild(markEl);
        cursor = match.end;
      });

      if (cursor < textContent.length) {
        fragment.appendChild(document.createTextNode(textContent.slice(cursor)));
      }

      textNode.parentNode.replaceChild(fragment, textNode);
      hasHighlight = true;
    });

    return hasHighlight;
  }

  function getQuestionIndex(questionId) {
    return appState.questions.findIndex((item) => item.id === questionId);
  }

  function getQuestionAnchorElement(question) {
    if (!question) {
      return null;
    }

    if (question.answerEl instanceof HTMLElement) {
      return question.answerEl;
    }

    if (question.messageEl instanceof HTMLElement) {
      return question.messageEl;
    }

    return null;
  }

  function getAdjacentQuestion(direction) {
    const currentIndex = getQuestionIndex(appState.activeQuestionId);
    if (currentIndex === -1) {
      return null;
    }

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= appState.questions.length) {
      return null;
    }

    return appState.questions[nextIndex];
  }

  function scheduleQuestionPositionReset(questionId) {
    if (!questionId || !navigator) {
      return;
    }

    window.requestAnimationFrame(() => {
      const question = getQuestionById(questionId);
      const anchorEl = getQuestionAnchorElement(question);
      if (!(anchorEl instanceof HTMLElement)) {
        return;
      }

      const container = navigator.findScrollContainer(anchorEl);
      navigator.scrollElementIntoViewWithOffset(anchorEl, container, navigator.TOP_OFFSET, "auto");
    });
  }

  function syncAnswerOutline(question) {
    if (!outline) {
      return;
    }

    const answerEl = question && question.answerEl instanceof HTMLElement ? question.answerEl : null;
    if (!answerEl) {
      outline.reset();
      return;
    }

    outline.applyAnswer(answerEl);
  }

  function showQuestionById(questionId, options) {
    const config = options || {};
    const question = getQuestionById(questionId);
    if (!question) {
      return false;
    }

    appState.activeQuestionId = questionId;
    if (panel) {
      panel.setActiveQuestion(questionId);
    }
    if (virtualizer) {
      virtualizer.showQuestion(questionId);
    }
    syncAnswerOutline(question);
    if (config.resetPosition !== false) {
      scheduleQuestionPositionReset(questionId);
    }

    return true;
  }

  function renderPanel() {
    if (!panel) {
      return;
    }

    panel.renderQuestions(appState.questions, appState.activeQuestionId, {
      query: appState.searchQuery,
      results: appState.searchResults
    });
    panel.setActiveQuestion(appState.activeQuestionId);
  }

  function ensurePanel() {
    if (panel) {
      return;
    }

    panel = panelModule.createPanel({
      state: appState.panelState,
      onSelectQuestion,
      onSearchChange,
      onLayoutChange: applyResponsiveLayout,
      onStateChange: persistPanelState
    });
  }

  function destroyPanel() {
    if (!panel) {
      return;
    }

    panel.destroy();
    panel = null;
    clearResponsiveLayout();
  }

  function buildQuestionsSignature(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
      return [item.id, item.index, item.shortTitle].join(":");
    }).join("|");
  }

  function ensureMutationObserver(currentAdapter) {
    const nextObservationRoot = extractor.getObservationRoot(currentAdapter);
    if (mutationObserver && nextObservationRoot === observationRoot) {
      return;
    }

    observationRoot = nextObservationRoot;
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = observerModule.createConversationMutationObserver(
      observationRoot,
      onConversationMutation
    );
  }

  function dispatchNavigationEvent() {
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  }

  function installHistoryChangeListener() {
    if (!root.historyChangeListenerInstalled) {
      const historyMethods = ["pushState", "replaceState"];

      historyMethods.forEach((methodName) => {
        const originalMethod = window.history[methodName];
        if (typeof originalMethod !== "function") {
          return;
        }

        window.history[methodName] = function patchedHistoryMethod() {
          const result = originalMethod.apply(this, arguments);
          dispatchNavigationEvent();
          return result;
        };
      });

      root.historyChangeListenerInstalled = true;
    }

    window.addEventListener(NAVIGATION_EVENT, scheduleSync);
    window.addEventListener("popstate", scheduleSync);
    window.addEventListener("hashchange", scheduleSync);
  }

  function syncQuestions() {
    syncScheduled = false;
    const previousActiveQuestionId = appState.activeQuestionId;

    if (window.location.href !== appState.currentUrl) {
      if (virtualizer) {
        virtualizer.reset();
      }
      if (outline) {
        outline.reset();
      }
      appState.currentUrl = window.location.href;
    }

    adapter = extractor.resolveConversationAdapter();
    ensureMutationObserver(adapter);

    if (!extractor.isConversationSupported(adapter)) {
      appState.questions = [];
      appState.questionsSignature = "";
      appState.activeQuestionId = null;
      if (virtualizer) {
        virtualizer.reset();
      }
      if (outline) {
        outline.reset();
      }
      destroyPanel();
      return;
    }

    const previousQuestionCount = appState.questions.length;
    const previousLatestQuestionId = previousQuestionCount
      ? appState.questions[previousQuestionCount - 1].id
      : null;
    const extractedQuestions = extractor.extractQuestions(adapter);
    const nextQuestions = virtualizer
      ? virtualizer.reconcileQuestions(extractedQuestions)
      : extractedQuestions;
    const nextSignature = buildQuestionsSignature(nextQuestions);
    const questionsChanged = nextSignature !== appState.questionsSignature;

    ensurePanel();
    appState.questions = nextQuestions;
    appState.questionsSignature = nextSignature;
    const latestQuestionId = appState.questions.length
      ? appState.questions[appState.questions.length - 1].id
      : null;

    if (!appState.activeQuestionId) {
      appState.activeQuestionId = latestQuestionId;
    } else if (!getQuestionById(appState.activeQuestionId)) {
      appState.activeQuestionId = latestQuestionId;
    } else if (
      latestQuestionId &&
      (appState.questions.length > previousQuestionCount || latestQuestionId !== previousLatestQuestionId)
    ) {
      appState.activeQuestionId = latestQuestionId;
    }

    if (virtualizer) {
      virtualizer.applyQuestions(appState.questions);
      if (appState.activeQuestionId) {
        virtualizer.showQuestion(appState.activeQuestionId);
      }
    }
    syncAnswerOutline(getQuestionById(appState.activeQuestionId));

    appState.searchResults = buildSearchResults(appState.searchQuery);

    if (questionsChanged) {
      renderPanel();
    } else if (panel) {
      panel.renderQuestions(appState.questions, appState.activeQuestionId, {
        query: appState.searchQuery,
        results: appState.searchResults
      });
    }

    if (appState.activeQuestionId && appState.activeQuestionId !== previousActiveQuestionId) {
      scheduleQuestionPositionReset(appState.activeQuestionId);
    }
  }

  function scheduleSync() {
    if (syncScheduled) {
      return;
    }

    syncScheduled = true;
    window.requestAnimationFrame(syncQuestions);
  }

  function onConversationMutation(mutations) {
    scheduleSync();
  }

  async function persistPanelState(nextState) {
    const normalized = await storage.savePanelState(nextState);
    applyResponsiveLayout(normalized);
  }

  function onSearchChange(query) {
    appState.searchQuery = normalizeSearchText(query);
    appState.searchResults = buildSearchResults(appState.searchQuery);
    if (!appState.searchQuery) {
      clearSearchHighlights();
    }
    renderPanel();
  }

  function onSelectQuestion(questionId, matchType) {
    const didShow = showQuestionById(questionId, {
      resetPosition: true
    });
    if (!didShow) {
      return;
    }

    const question = getQuestionById(questionId);
    if (!question) {
      return;
    }

    window.requestAnimationFrame(() => {
      const targetEl = matchType === "answer" && question.answerEl instanceof HTMLElement
        ? question.answerEl
        : question.messageEl instanceof HTMLElement
          ? question.messageEl
          : null;

      clearSearchHighlights();
      if (targetEl && appState.searchQuery && (matchType === "answer" || matchType === "question")) {
        highlightSearchTerms(targetEl, appState.searchQuery);
      }

      if (matchType === "answer" && question.answerEl instanceof HTMLElement) {
        flashElement(targetEl);
        return;
      }

      if (question.messageEl instanceof HTMLElement) {
        flashElement(targetEl);
      }
    });
  }

  async function bootstrap() {
    appState.panelState = await storage.loadPanelState();
    applyResponsiveLayout(appState.panelState);

    virtualizer = virtualizerModule.createConversationVirtualizer({
      getAdjacentQuestion,
      onSelectQuestion
    });
    outline = outlineModule && typeof outlineModule.createAnswerOutline === "function"
      ? outlineModule.createAnswerOutline()
      : null;
    installHistoryChangeListener();
    ensureMutationObserver(extractor.resolveConversationAdapter());

    syncQuestions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
}());
