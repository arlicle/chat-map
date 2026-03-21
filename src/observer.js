(function initObserverModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const TOP_OFFSET = root.navigator ? root.navigator.TOP_OFFSET : 96;
  const MUTATION_DEBOUNCE_MS = 180;
  const COLLAPSED_ATTR = root.virtualizer ? root.virtualizer.COLLAPSED_ATTR : "data-qnav-collapsed";
  const MANAGED_ATTR = root.virtualizer ? root.virtualizer.MANAGED_ATTR : "data-qnav-managed";
  const MANAGED_VALUE = root.virtualizer ? root.virtualizer.MANAGED_VALUE : "true";
  const MESSAGE_SELECTOR = [
    "[data-message-author-role]",
    "article",
    "[data-testid^='conversation-turn-']",
    "user-query",
    "user-query-content",
    "model-response",
    ".conversation-container",
    ".model-response-container",
    ".response-container"
  ].join(", ");

  function isManagedNode(node) {
    return node instanceof Element &&
      (node.getAttribute(MANAGED_ATTR) === MANAGED_VALUE ||
      Boolean(node.closest("[" + MANAGED_ATTR + "='" + MANAGED_VALUE + "']")));
  }

  function buildQuestionSignature(items) {
    return (Array.isArray(items) ? items : []).map((item) => item && item.id).filter(Boolean).join("|");
  }

  function isMessageRelatedElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    return element.matches(MESSAGE_SELECTOR) || Boolean(element.querySelector(MESSAGE_SELECTOR));
  }

  function isTrackableMessageElement(element) {
    return element instanceof HTMLElement &&
      element.isConnected &&
      element.getAttribute(COLLAPSED_ATTR) !== "true";
  }

  function createQuestionVisibilityTracker(options) {
    const config = options || {};
    let questions = [];
    let observer = null;
    let frameId = null;
    let currentActiveId = null;
    let observedSignature = "";

    function computeActiveQuestionId() {
      if (!questions.length) {
        return null;
      }

      const threshold = TOP_OFFSET + 24;
      let activeQuestion = null;

      for (let index = 0; index < questions.length; index += 1) {
        const item = questions[index];
        if (!item || !isTrackableMessageElement(item.messageEl)) {
          continue;
        }

        if (!activeQuestion) {
          activeQuestion = item;
        }

        const rect = item.messageEl.getBoundingClientRect();

        if (rect.top <= threshold) {
          activeQuestion = item;
          continue;
        }

        break;
      }

      return activeQuestion ? activeQuestion.id : null;
    }

    function emitActiveQuestion() {
      frameId = null;
      const nextActiveId = computeActiveQuestionId();

      if (nextActiveId === currentActiveId) {
        return;
      }

      currentActiveId = nextActiveId;
      if (typeof config.onActiveChange === "function") {
        config.onActiveChange(nextActiveId);
      }
    }

    function scheduleEmit() {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(emitActiveQuestion);
    }

    function observeQuestions(nextQuestions) {
      questions = Array.isArray(nextQuestions) ? nextQuestions.slice() : [];
      const nextSignature = buildQuestionSignature(questions);

      if (nextSignature === observedSignature && observer) {
        scheduleEmit();
        return;
      }

      observedSignature = nextSignature;

      if (observer) {
        observer.disconnect();
        observer = null;
      }

      if (!questions.length) {
        scheduleEmit();
        return;
      }

      observer = new IntersectionObserver(scheduleEmit, {
        root: null,
        rootMargin: "-" + TOP_OFFSET + "px 0px -60% 0px",
        threshold: [0, 0.01, 0.1, 0.4, 1]
      });

      questions.forEach((item) => {
        if (item && isTrackableMessageElement(item.messageEl)) {
          observer.observe(item.messageEl);
        }
      });

      scheduleEmit();
    }

    function disconnect() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }

      window.removeEventListener("resize", scheduleEmit);
    }

    window.addEventListener("resize", scheduleEmit);

    return {
      observeQuestions,
      disconnect
    };
  }

  function createConversationMutationObserver(target, onChange) {
    const observationTarget = target || document.body;
    let timeoutId = null;

    function shouldIgnoreMutation(mutation) {
      const rootEl = document.getElementById("qnav-root");
      if (!rootEl) {
        return false;
      }

      const targetNode = mutation.target;
      if (targetNode instanceof Node && rootEl.contains(targetNode)) {
        return true;
      }

      if (isManagedNode(targetNode)) {
        return true;
      }

      const changedNodes = Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes));
      if (!changedNodes.length) {
        return false;
      }

      return changedNodes.every((node) => {
        return (node instanceof Node && rootEl.contains(node)) || isManagedNode(node);
      });
    }

    function isRelevantMutation(mutation) {
      if (shouldIgnoreMutation(mutation)) {
        return false;
      }

      if (!(mutation.target instanceof Element) || !isMessageRelatedElement(mutation.target)) {
        return Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some((node) => {
          return isMessageRelatedElement(node);
        });
      }

      return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
    }

    const observer = new MutationObserver((mutations) => {
      const hasRelevantChange = mutations.some(isRelevantMutation);

      if (!hasRelevantChange) {
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        onChange(mutations);
      }, MUTATION_DEBOUNCE_MS);
    });

    observer.observe(observationTarget, {
      childList: true,
      subtree: true
    });

    return {
      disconnect() {
        observer.disconnect();
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      }
    };
  }

  root.observer = {
    createConversationMutationObserver,
    createQuestionVisibilityTracker
  };
}());
