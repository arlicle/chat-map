(function initVirtualizerModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const navigatorModule = root.navigator;
  const DEFAULT_WINDOW_RADIUS = 3;
  const DEFAULT_SUSPEND_MS = 1800;
  const DEFAULT_MUTATION_SUSPEND_MS = 900;
  const MANAGED_ATTR = "data-qnav-managed";
  const MANAGED_VALUE = "true";
  const COLLAPSED_ATTR = "data-qnav-collapsed";
  const CONTENT_VISIBILITY_SIZE = "800px";
  const ORDER_SELECTOR = "[data-qnav-id], .qnav-conversation-placeholder[data-qnav-placeholder-for]";

  function getManagedElements(question) {
    const elements = [];
    if (question && question.messageEl instanceof HTMLElement) {
      elements.push(question.messageEl);
    }

    if (question && question.answerEl instanceof HTMLElement && question.answerEl !== question.messageEl) {
      elements.push(question.answerEl);
    }

    return elements;
  }

  function setCollapsedState(element, collapsed) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.hidden = false;
    element.setAttribute(COLLAPSED_ATTR, collapsed ? "true" : "false");
  }

  function applyRenderOptimization(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.style.contentVisibility = "auto";
    element.style.containIntrinsicSize = CONTENT_VISIBILITY_SIZE;
  }

  function createConversationVirtualizer(options) {
    const config = options || {};
    const windowRadius = Math.max(1, Number(config.windowRadius) || DEFAULT_WINDOW_RADIUS);
    let placeholderObserver = null;
    let orderedQuestions = [];
    let questionsById = new Map();
    let collapsedById = new Map();
    let activeQuestionId = null;
    let suspendUntil = 0;

    function now() {
      return Date.now();
    }

    function isSuspended() {
      return now() < suspendUntil;
    }

    function suspend(durationMs) {
      const nextDuration = Math.max(0, Number(durationMs) || DEFAULT_SUSPEND_MS);
      suspendUntil = Math.max(suspendUntil, now() + nextDuration);
      return suspendUntil;
    }

    function ensureObserver() {
      if (placeholderObserver) {
        return;
      }

      placeholderObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const placeholderEl = entry.target;
          const questionId = placeholderEl.getAttribute("data-qnav-placeholder-for");
          if (!questionId) {
            return;
          }

          setActiveQuestion(questionId, { force: true });
        });
      }, {
        root: null,
        rootMargin: "220px 0px 220px 0px",
        threshold: 0
      });
    }

    function createPlaceholder(question) {
      const placeholderEl = document.createElement("div");
      placeholderEl.className = "qnav-conversation-placeholder";
      placeholderEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
      placeholderEl.setAttribute("data-qnav-placeholder-for", question.id);
      placeholderEl.textContent = "Prompt Q" + question.index + " hidden. Scroll nearby to load it.";
      return placeholderEl;
    }

    function cleanupDetachedState(questionId) {
      const state = collapsedById.get(questionId);
      if (!state) {
        return;
      }

      if (placeholderObserver && state.placeholderEl) {
        placeholderObserver.unobserve(state.placeholderEl);
      }

      if (state.placeholderEl && typeof state.placeholderEl.remove === "function") {
        state.placeholderEl.remove();
      }

      collapsedById.delete(questionId);
    }

    function collapseQuestion(question) {
      if (!question || collapsedById.has(question.id)) {
        return;
      }

      const messageEl = question.messageEl instanceof HTMLElement ? question.messageEl : null;
      if (!messageEl || !(messageEl.parentNode instanceof Node)) {
        return;
      }

      const placeholderEl = createPlaceholder(question);
      const parentNode = messageEl.parentNode;
      parentNode.replaceChild(placeholderEl, messageEl);

      const answerEl = question.answerEl instanceof HTMLElement ? question.answerEl : null;
      if (answerEl && answerEl.parentNode instanceof Node) {
        answerEl.parentNode.removeChild(answerEl);
      }

      getManagedElements(question).forEach((element) => {
        setCollapsedState(element, true);
      });

      ensureObserver();
      placeholderObserver.observe(placeholderEl);
      collapsedById.set(question.id, {
        placeholderEl,
        messageEl,
        answerEl
      });
    }

    function expandQuestionById(questionId) {
      const state = collapsedById.get(questionId);
      const question = questionsById.get(questionId);
      if (!state || !question || !(state.placeholderEl instanceof HTMLElement)) {
        return;
      }

      const placeholderEl = state.placeholderEl;
      const parentNode = placeholderEl.parentNode;
      if (!(parentNode instanceof Node)) {
        cleanupDetachedState(questionId);
        return;
      }

      parentNode.replaceChild(state.messageEl, placeholderEl);
      if (state.answerEl instanceof HTMLElement) {
        if (state.messageEl.parentNode instanceof Node) {
          state.messageEl.parentNode.insertBefore(state.answerEl, state.messageEl.nextSibling);
        }
      }

      getManagedElements(question).forEach((element) => {
        setCollapsedState(element, false);
        applyRenderOptimization(element);
      });

      cleanupDetachedState(questionId);
    }

    function cleanupStaleQuestions() {
      Array.from(collapsedById.keys()).forEach((questionId) => {
        if (questionsById.has(questionId)) {
          return;
        }

        cleanupDetachedState(questionId);
      });
    }

    function getQuestionIndex(questionId) {
      return orderedQuestions.findIndex((question) => question.id === questionId);
    }

    function getWindowRange() {
      if (!orderedQuestions.length) {
        return { startIndex: 0, endIndex: -1, activeIndex: -1 };
      }

      let activeIndex = orderedQuestions.length - 1;
      if (activeQuestionId && questionsById.has(activeQuestionId)) {
        const nextIndex = getQuestionIndex(activeQuestionId);
        if (nextIndex !== -1) {
          activeIndex = nextIndex;
        }
      }

      return {
        activeIndex,
        startIndex: Math.max(0, activeIndex - windowRadius),
        endIndex: Math.min(orderedQuestions.length - 1, activeIndex + windowRadius)
      };
    }

    function getAnchorCandidate(startIndex, endIndex) {
      const preferredIds = [];
      if (activeQuestionId) {
        preferredIds.push(activeQuestionId);
      }

      for (let index = startIndex; index <= endIndex; index += 1) {
        const question = orderedQuestions[index];
        if (question && preferredIds.indexOf(question.id) === -1) {
          preferredIds.push(question.id);
        }
      }

      for (let index = 0; index < preferredIds.length; index += 1) {
        const question = questionsById.get(preferredIds[index]);
        if (question && question.messageEl instanceof HTMLElement && question.messageEl.isConnected) {
          return question;
        }
      }

      for (let index = startIndex; index <= endIndex; index += 1) {
        const question = orderedQuestions[index];
        if (!question) {
          continue;
        }

        const collapsedState = collapsedById.get(question.id);
        if (collapsedState && collapsedState.placeholderEl instanceof HTMLElement && collapsedState.placeholderEl.isConnected) {
          return {
            id: question.id,
            messageEl: collapsedState.placeholderEl
          };
        }
      }

      return null;
    }

    function getElementTopWithinContainer(element, container) {
      if (!(element instanceof HTMLElement)) {
        return 0;
      }

      const elementRect = element.getBoundingClientRect();
      if (!container || container === window) {
        return window.scrollY + elementRect.top;
      }

      const containerRect = container.getBoundingClientRect();
      return container.scrollTop + (elementRect.top - containerRect.top);
    }

    function compensateScroll(anchorQuestion, container, beforeTop) {
      if (!anchorQuestion || !anchorQuestion.messageEl || typeof beforeTop !== "number") {
        return;
      }

      const afterTop = getElementTopWithinContainer(anchorQuestion.messageEl, container);
      const delta = afterTop - beforeTop;
      if (Math.abs(delta) <= 1) {
        return;
      }

      if (!container || container === window) {
        window.scrollTo({
          top: window.scrollY + delta,
          behavior: "auto"
        });
        return;
      }

      container.scrollTop += delta;
    }

    function applyWindow(force) {
      if (!orderedQuestions.length) {
        return;
      }

      if (!force && isSuspended()) {
        return;
      }

      if (orderedQuestions.length <= (windowRadius * 2) + 1) {
        orderedQuestions.forEach((question) => {
          expandQuestionById(question.id);
          getManagedElements(question).forEach(applyRenderOptimization);
        });
        return;
      }

      const range = getWindowRange();
      const anchorQuestion = getAnchorCandidate(range.startIndex, range.endIndex);
      const anchorElement = anchorQuestion && anchorQuestion.messageEl instanceof HTMLElement
        ? anchorQuestion.messageEl
        : null;
      const scrollContainer = anchorElement && navigatorModule
        ? navigatorModule.findScrollContainer(anchorElement)
        : window;
      const beforeTop = anchorElement ? getElementTopWithinContainer(anchorElement, scrollContainer) : null;

      orderedQuestions.forEach((question, index) => {
        if (index >= range.startIndex && index <= range.endIndex) {
          expandQuestionById(question.id);
          getManagedElements(question).forEach(applyRenderOptimization);
          return;
        }

        collapseQuestion(question);
      });

      if (anchorQuestion && questionsById.has(anchorQuestion.id)) {
        compensateScroll(questionsById.get(anchorQuestion.id), scrollContainer, beforeTop);
      }
    }

    function buildOrderedQuestionsFromDom(extractedQuestions) {
      const extractedById = new Map();
      (Array.isArray(extractedQuestions) ? extractedQuestions : []).forEach((question) => {
        if (question && question.id) {
          extractedById.set(question.id, question);
        }
      });

      extractedById.forEach((question, questionId) => {
        questionsById.set(questionId, question);
      });

      const ordered = [];
      const seen = new Set();
      Array.from(document.querySelectorAll(ORDER_SELECTOR)).forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }

        const questionId = node.getAttribute("data-qnav-id") || node.getAttribute("data-qnav-placeholder-for");
        if (!questionId || seen.has(questionId)) {
          return;
        }

        const question = extractedById.get(questionId) || questionsById.get(questionId);
        if (!question) {
          return;
        }

        ordered.push(question);
        seen.add(questionId);
      });

      extractedById.forEach((question, questionId) => {
        if (seen.has(questionId)) {
          return;
        }

        ordered.push(question);
        seen.add(questionId);
      });

      return ordered;
    }

    function reconcileQuestions(extractedQuestions) {
      const nextOrderedQuestions = buildOrderedQuestionsFromDom(extractedQuestions);
      if (!nextOrderedQuestions.length) {
        return Array.isArray(extractedQuestions) ? extractedQuestions.slice() : [];
      }

      return nextOrderedQuestions;
    }

    function applyQuestions(questions) {
      orderedQuestions = Array.isArray(questions) ? questions.slice() : [];
      questionsById = new Map(orderedQuestions.map((question) => [question.id, question]));
      cleanupStaleQuestions();

      if (!orderedQuestions.length) {
        activeQuestionId = null;
        return;
      }

      if (!activeQuestionId || !questionsById.has(activeQuestionId)) {
        activeQuestionId = orderedQuestions[orderedQuestions.length - 1].id;
      }

      applyWindow(false);
    }

    function ensureQuestionVisible(question) {
      if (!question || !question.id) {
        return;
      }

      setActiveQuestion(question.id, { force: true });
    }

    function getObservableQuestions(questions) {
      const nextQuestions = Array.isArray(questions) ? questions : [];
      return nextQuestions.filter((question) => {
        return question &&
          question.messageEl instanceof HTMLElement &&
          question.messageEl.isConnected &&
          question.messageEl.getAttribute(COLLAPSED_ATTR) !== "true";
      });
    }

    function setActiveQuestion(questionId, options) {
      if (!questionId || !questionsById.has(questionId)) {
        return;
      }

      const config = options || {};
      activeQuestionId = questionId;
      applyWindow(Boolean(config.force));
    }

    function reset() {
      Array.from(collapsedById.keys()).forEach((questionId) => {
        expandQuestionById(questionId);
      });

      orderedQuestions = [];
      questionsById.clear();
      activeQuestionId = null;
      suspendUntil = 0;
    }

    function destroy() {
      reset();
      if (placeholderObserver) {
        placeholderObserver.disconnect();
        placeholderObserver = null;
      }
    }

    return {
      applyQuestions,
      destroy,
      ensureQuestionVisible,
      getObservableQuestions,
      isSuspended,
      reconcileQuestions,
      reset,
      setActiveQuestion,
      suspend,
      suspendForMutation() {
        return suspend(DEFAULT_MUTATION_SUSPEND_MS);
      }
    };
  }

  root.virtualizer = {
    COLLAPSED_ATTR,
    MANAGED_ATTR,
    MANAGED_VALUE,
    createConversationVirtualizer
  };
}());
