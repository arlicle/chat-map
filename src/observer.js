(function initObserverModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const TOP_OFFSET = root.navigator ? root.navigator.TOP_OFFSET : 96;
  const MUTATION_DEBOUNCE_MS = 180;

  function createQuestionVisibilityTracker(options) {
    const config = options || {};
    let questions = [];
    let observer = null;
    let frameId = null;
    let currentActiveId = null;

    function computeActiveQuestionId() {
      if (!questions.length) {
        return null;
      }

      const threshold = TOP_OFFSET + 24;
      let activeQuestion = questions[0];

      for (let index = 0; index < questions.length; index += 1) {
        const item = questions[index];
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

      if (observer) {
        observer.disconnect();
      }

      observer = new IntersectionObserver(scheduleEmit, {
        root: null,
        rootMargin: "-" + TOP_OFFSET + "px 0px -60% 0px",
        threshold: [0, 0.01, 0.1, 0.4, 1]
      });

      questions.forEach((item) => {
        if (item && item.messageEl instanceof HTMLElement) {
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

      const changedNodes = Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes));
      if (!changedNodes.length) {
        return false;
      }

      return changedNodes.every((node) => {
        return node instanceof Node && rootEl.contains(node);
      });
    }

    const observer = new MutationObserver((mutations) => {
      const hasRelevantChange = mutations.some((mutation) => {
        if (shouldIgnoreMutation(mutation)) {
          return false;
        }

        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });

      if (!hasRelevantChange) {
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        onChange();
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
