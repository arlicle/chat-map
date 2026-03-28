(function initContentScript() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const NAVIGATION_EVENT = "qnav:navigation";
  if (root.appStarted) {
    return;
  }

  root.appStarted = true;

  const storage = root.storage;
  const i18n = root.i18n;
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
    favorites: [],
    questionsSignature: "",
    searchQuery: "",
    searchResults: [],
    languagePreference: storage ? storage.DEFAULT_LANGUAGE_PREFERENCE : "auto"
  };

  let panel = null;
  let adapter = null;
  let mutationObserver = null;
  let observationRoot = null;
  let virtualizer = null;
  let outline = null;
  let favoriteDialogEl = null;
  let favoriteDialogState = null;
  let favoritesChangeListenerInstalled = false;
  let syncScheduled = false;
  let layoutRefreshFrame = null;

  function t(key, params) {
    return i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;
  }

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

  function getConversationId(url) {
    const sourceUrl = String(url || window.location.href || "");
    const matchedConversation = sourceUrl.match(/\/c\/([^/?#]+)/) || sourceUrl.match(/\/conversation\/([^/?#]+)/);
    if (matchedConversation) {
      return matchedConversation[1];
    }

    const matchedGemini = sourceUrl.match(/\/app\/([^/?#]+)/);
    if (matchedGemini) {
      return matchedGemini[1];
    }

    return sourceUrl;
  }

  function isValidConversationUrl(url) {
    const sourceUrl = String(url || window.location.href || "");
    // ChatGPT conversation URLs: /c/xxx or /conversation/xxx
    if (/\/c\/[^/?#]+/.test(sourceUrl) || /\/conversation\/[^/?#]+/.test(sourceUrl)) {
      return true;
    }
    // Gemini conversation URLs: /app/xxx
    if (/\/app\/[^/?#]+/.test(sourceUrl)) {
      return true;
    }
    return false;
  }

  function getConversationTitle() {
    const title = normalizeSearchText(document.title);
    if (!title) {
      return t("common.untitledConversation");
    }

    return title
      .replace(/\s*-\s*ChatGPT$/i, "")
      .replace(/\s*-\s*Gemini$/i, "")
      .trim() || title;
  }

  function normalizeSnapshotText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stripSpeakerPrefix(text) {
    return String(text || "")
      .replace(/^\s*(?:你说|你|you said|you|ChatGPT说|ChatGPT 说|ChatGPT said|ChatGPT|Gemini说|Gemini 说|Gemini said|Gemini)\s*[:：]\s*/i, "")
      .trimStart();
  }

  function stripSpeakerMarkers(containerEl) {
    if (!(containerEl instanceof HTMLElement)) {
      return;
    }

    containerEl.querySelectorAll(
      ".sr-only, [class*='sr-only'], .visually-hidden, [class*='visually-hidden'], [class*='screen-reader']"
    ).forEach((node) => {
      node.remove();
    });
  }

  function extractFavoriteSnapshotHtml(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return "";
    }

    stripSpeakerMarkers(clone);

    clone.querySelectorAll("[data-qnav-managed='true']").forEach((managedEl) => {
      managedEl.remove();
    });

    clone.querySelectorAll("button, textarea, input, select").forEach((controlEl) => {
      controlEl.remove();
    });

    return String(clone.innerHTML || "").trim();
  }

  function extractFavoriteSnapshotText(element, fallbackText) {
    if (element instanceof HTMLElement) {
      const sourceText = element.innerText || element.textContent || "";
      const normalized = stripSpeakerPrefix(normalizeSnapshotText(sourceText));
      if (normalized) {
        return normalized;
      }
    }

    return stripSpeakerPrefix(normalizeSnapshotText(fallbackText || ""));
  }

  function buildFavoriteId(question) {
    if (!question || !storage || typeof storage.makeFavoriteId !== "function") {
      return "";
    }

    return storage.makeFavoriteId({
      conversationId: getConversationId(appState.currentUrl),
      questionId: question.id
    });
  }

  function getFavoriteRecord(question) {
    const favoriteId = buildFavoriteId(question);
    if (!favoriteId) {
      return null;
    }

    return appState.favorites.find((favorite) => favorite.favoriteId === favoriteId) || null;
  }

  function buildFavoritePayload(question, note, existingFavorite) {
    if (!question) {
      return null;
    }

    const questionSnapshot = extractFavoriteSnapshotText(
      question.messageEl,
      question.questionText || question.text || ""
    );
    const answerSnapshot = extractFavoriteSnapshotText(
      question.answerEl,
      question.answerText || ""
    );
    const questionHtmlSnapshot = String(
      question.questionHtml ||
      extractFavoriteSnapshotHtml(question.messageEl)
    ).trim();
    const answerHtmlSnapshot = String(
      question.answerHtml ||
      extractFavoriteSnapshotHtml(question.answerEl)
    ).trim();

    return {
      favoriteId: buildFavoriteId(question),
      conversationId: getConversationId(appState.currentUrl),
      conversationUrl: appState.currentUrl,
      conversationTitle: getConversationTitle(),
      questionId: question.id,
      questionIndex: question.index,
      questionText: questionSnapshot,
      answerText: answerSnapshot,
      questionHtml: questionHtmlSnapshot,
      answerHtml: answerHtmlSnapshot,
      note: String(note || "").trim(),
      createdAt: existingFavorite ? existingFavorite.createdAt : Date.now(),
      updatedAt: Date.now()
    };
  }

  function refreshFavoriteUI() {
    if (panel && typeof panel.setFavoritesCount === "function") {
      panel.setFavoritesCount(appState.favorites.length);
    }
    if (panel && typeof panel.setCurrentFavorite === "function") {
      panel.setCurrentFavorite(getFavoriteRecord(getQuestionById(appState.activeQuestionId)));
    }

    if (virtualizer && appState.activeQuestionId) {
      virtualizer.showQuestion(appState.activeQuestionId);
    }
  }

  async function reloadFavorites() {
    appState.favorites = storage && typeof storage.loadFavorites === "function"
      ? await storage.loadFavorites()
      : [];
    refreshFavoriteUI();
    return appState.favorites;
  }

  async function openFavoritesPage() {
    if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
      try {
        await chrome.runtime.sendMessage({
          type: "OPEN_FAVORITES_PAGE"
        });
        return;
      } catch (error) {
        // Fall back to direct window.open below.
      }
    }

    if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function") {
      window.open(chrome.runtime.getURL("favorites.html"), "_blank", "noopener");
    }
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

  function closeFavoriteDialog() {
    if (!favoriteDialogEl) {
      favoriteDialogState = null;
      return;
    }

    favoriteDialogEl.hidden = true;
    favoriteDialogState = null;
  }

  function ensureFavoriteDialog() {
    if (favoriteDialogEl) {
      return favoriteDialogEl;
    }

    favoriteDialogEl = document.createElement("div");
    favoriteDialogEl.className = "qnav-favorite-dialog";
    favoriteDialogEl.hidden = true;
    favoriteDialogEl.innerHTML = [
      "<div class='qnav-favorite-dialog-backdrop' data-action='backdrop'></div>",
      "<div class='qnav-favorite-dialog-sheet' role='dialog' aria-modal='true' aria-label='" + escapeHtml(t("favoriteDialog.ariaLabel")) + "'>",
      "  <div class='qnav-favorite-dialog-head'>",
      "    <div>",
      "      <div class='qnav-favorite-dialog-kicker'>" + escapeHtml(t("favoriteDialog.kicker")) + "</div>",
      "      <div class='qnav-favorite-dialog-title'></div>",
      "    </div>",
      "    <button class='qnav-favorite-dialog-close' type='button' aria-label='" + escapeHtml(t("favoriteDialog.closeAria")) + "'>×</button>",
      "  </div>",
      "  <div class='qnav-favorite-dialog-body'>",
      "    <div class='qnav-favorite-dialog-preview'></div>",
      "    <label class='qnav-favorite-dialog-field'>",
      "      <span>" + escapeHtml(t("favoriteDialog.noteLabel")) + "</span>",
      "      <textarea class='qnav-favorite-dialog-input' placeholder='" + escapeHtml(t("favoriteDialog.notePlaceholder")) + "'></textarea>",
      "    </label>",
      "  </div>",
      "  <div class='qnav-favorite-dialog-actions'>",
      "    <button class='qnav-favorite-dialog-button' data-action='cancel' type='button'>" + escapeHtml(t("favoriteDialog.cancel")) + "</button>",
      "    <button class='qnav-favorite-dialog-button is-danger' data-action='remove' type='button'>" + escapeHtml(t("favoriteDialog.remove")) + "</button>",
      "    <button class='qnav-favorite-dialog-button is-primary' data-action='save' type='button'>" + escapeHtml(t("favoriteDialog.save")) + "</button>",
      "  </div>",
      "</div>"
    ].join("");

    favoriteDialogEl.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const action = target.dataset.action;
      if (action === "backdrop" || action === "cancel") {
        closeFavoriteDialog();
        return;
      }

      if (!favoriteDialogState || !favoriteDialogState.question) {
        return;
      }

      if (action === "remove") {
        if (favoriteDialogState.favorite && storage && typeof storage.removeFavorite === "function") {
          appState.favorites = await storage.removeFavorite(favoriteDialogState.favorite.favoriteId);
        }
        closeFavoriteDialog();
        refreshFavoriteUI();
        return;
      }

      if (action === "save") {
        const noteInputEl = favoriteDialogEl.querySelector(".qnav-favorite-dialog-input");
        const note = noteInputEl instanceof HTMLTextAreaElement ? noteInputEl.value : "";
        const payload = buildFavoritePayload(
          favoriteDialogState.question,
          note,
          favoriteDialogState.favorite
        );
        if (payload && storage && typeof storage.saveFavorite === "function") {
          appState.favorites = await storage.saveFavorite(payload);
        }
        closeFavoriteDialog();
        refreshFavoriteUI();
      }
    });

    const closeButtonEl = favoriteDialogEl.querySelector(".qnav-favorite-dialog-close");
    if (closeButtonEl) {
      closeButtonEl.addEventListener("click", closeFavoriteDialog);
    }

    document.body.appendChild(favoriteDialogEl);
    return favoriteDialogEl;
  }

  function openFavoriteDialog(question, favoriteRecord) {
    if (!question) {
      return;
    }

    const dialogEl = ensureFavoriteDialog();
    const titleEl = dialogEl.querySelector(".qnav-favorite-dialog-title");
    const previewEl = dialogEl.querySelector(".qnav-favorite-dialog-preview");
    const inputEl = dialogEl.querySelector(".qnav-favorite-dialog-input");
    const removeButtonEl = dialogEl.querySelector("[data-action='remove']");

    favoriteDialogState = {
      question,
      favorite: favoriteRecord || null
    };

    if (titleEl) {
      titleEl.textContent = truncateText(question.questionText || question.text || "", 120);
    }
    if (previewEl) {
      previewEl.textContent = truncateText(question.answerText || t("common.noAnswer"), 220);
    }
    if (inputEl instanceof HTMLTextAreaElement) {
      inputEl.value = favoriteRecord && favoriteRecord.note ? favoriteRecord.note : "";
      window.requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      });
    }
    if (removeButtonEl instanceof HTMLElement) {
      removeButtonEl.hidden = !favoriteRecord;
    }

    dialogEl.hidden = false;
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

  function refreshReaderChrome(questionId) {
    if (!virtualizer || !questionId) {
      return;
    }

    virtualizer.showQuestion(questionId);
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
      if (typeof panel.setCurrentFavorite === "function") {
        panel.setCurrentFavorite(getFavoriteRecord(question));
      }
    }
    if (virtualizer) {
      virtualizer.showQuestion(questionId);
    }
    syncAnswerOutline(question);
    refreshReaderChrome(questionId);
    if (config.resetPosition !== false) {
      scheduleQuestionPositionReset(questionId);
    }

    return true;
  }

  function renderPanel() {
    if (!panel) {
      return;
    }

    if (typeof panel.setFavoritesCount === "function") {
      panel.setFavoritesCount(appState.favorites.length);
    }
    if (typeof panel.setCurrentFavorite === "function") {
      panel.setCurrentFavorite(getFavoriteRecord(getQuestionById(appState.activeQuestionId)));
    }
    panel.renderQuestions(appState.questions, appState.activeQuestionId, {
      query: appState.searchQuery,
      results: appState.searchResults
    });
    panel.setActiveQuestion(appState.activeQuestionId);
  }

  function applyLanguagePreference(nextPreference) {
    const normalizedPreference = storage && typeof storage.normalizeLanguagePreference === "function"
      ? storage.normalizeLanguagePreference(nextPreference)
      : String(nextPreference || "auto");

    if (appState.languagePreference === normalizedPreference && i18n && i18n.getLanguagePreference() === normalizedPreference) {
      return;
    }

    appState.languagePreference = normalizedPreference;
    if (i18n && typeof i18n.setLanguagePreference === "function") {
      i18n.setLanguagePreference(normalizedPreference);
    }

    if (panel && typeof panel.setLanguagePreference === "function") {
      panel.setLanguagePreference(normalizedPreference);
    }
    if (virtualizer && typeof virtualizer.setLanguage === "function") {
      virtualizer.setLanguage();
    }
    if (outline && typeof outline.setLanguage === "function") {
      outline.setLanguage();
    }

    if (favoriteDialogEl) {
      const dialogState = favoriteDialogState
        ? { question: favoriteDialogState.question, favorite: favoriteDialogState.favorite }
        : null;
      favoriteDialogEl.remove();
      favoriteDialogEl = null;
      favoriteDialogState = null;
      if (dialogState && dialogState.question) {
        openFavoriteDialog(dialogState.question, dialogState.favorite);
      }
    }

    renderPanel();
  }

  async function persistLanguagePreference(nextPreference) {
    const normalizedPreference = storage && typeof storage.saveLanguagePreference === "function"
      ? await storage.saveLanguagePreference(nextPreference)
      : String(nextPreference || "auto");
    applyLanguagePreference(normalizedPreference);
  }

  function ensurePanel() {
    if (panel) {
      return;
    }

    panel = panelModule.createPanel({
      state: appState.panelState,
      languagePreference: appState.languagePreference,
      onOpenFavorites: openFavoritesPage,
      onToggleCurrentFavorite: () => {
        const activeQuestion = getQuestionById(appState.activeQuestionId);
        if (!activeQuestion) {
          return;
        }

        openFavoriteDialog(activeQuestion, getFavoriteRecord(activeQuestion));
      },
      onSelectQuestion,
      onSearchChange,
      onLanguageChange: persistLanguagePreference,
      onLayoutChange: applyResponsiveLayout,
      onStateChange: persistPanelState
    });
    refreshFavoriteUI();
  }

  function destroyPanel() {
    if (!panel) {
      return;
    }

    panel.destroy();
    panel = null;
    closeFavoriteDialog();
    clearResponsiveLayout();
  }

  function installFavoritesChangeListener() {
    if (favoritesChangeListenerInstalled) {
      return;
    }

    if (!(typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged)) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !storage) {
        return;
      }

      if (changes[storage.FAVORITES_KEY]) {
        reloadFavorites().catch(() => {});
      }

      if (changes[storage.LANGUAGE_KEY]) {
        applyLanguagePreference(changes[storage.LANGUAGE_KEY].newValue);
      }
    });
    favoritesChangeListenerInstalled = true;
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
      closeFavoriteDialog();
      appState.currentUrl = window.location.href;

      // If URL is not a valid conversation format, destroy panel immediately
      if (!isValidConversationUrl(appState.currentUrl)) {
        appState.questions = [];
        appState.questionsSignature = "";
        appState.activeQuestionId = null;
        destroyPanel();
        return;
      }
    }

    adapter = extractor.resolveConversationAdapter();
    ensureMutationObserver(adapter);

    if (!extractor.isConversationSupported(adapter)) {
      appState.questions = [];
      appState.questionsSignature = "";
      appState.activeQuestionId = null;
      closeFavoriteDialog();
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
    refreshReaderChrome(appState.activeQuestionId);

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
    const bootstrapResults = await Promise.all([
      storage.loadPanelState(),
      typeof storage.loadFavorites === "function" ? storage.loadFavorites() : Promise.resolve([]),
      typeof storage.loadLanguagePreference === "function"
        ? storage.loadLanguagePreference()
        : Promise.resolve(storage.DEFAULT_LANGUAGE_PREFERENCE)
    ]);
    appState.panelState = bootstrapResults[0];
    appState.favorites = bootstrapResults[1];
    applyLanguagePreference(bootstrapResults[2]);
    applyResponsiveLayout(appState.panelState);

    virtualizer = virtualizerModule.createConversationVirtualizer({
      getAdjacentQuestion,
      onSelectQuestion
    });
    outline = outlineModule && typeof outlineModule.createAnswerOutline === "function"
      ? outlineModule.createAnswerOutline()
      : null;
    installFavoritesChangeListener();
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
