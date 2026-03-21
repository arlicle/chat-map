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
  const panelModule = root.panel;
  const observerModule = root.observer;
  const virtualizerModule = root.virtualizer;

  const appState = {
    panelState: storage ? storage.DEFAULT_PANEL_STATE : { collapsed: false, width: 320 },
    questions: [],
    activeQuestionId: null,
    currentUrl: window.location.href,
    questionsSignature: ""
  };

  let panel = null;
  let adapter = null;
  let mutationObserver = null;
  let observationRoot = null;
  let virtualizer = null;
  let syncScheduled = false;

  function getQuestionById(questionId) {
    return appState.questions.find((item) => item.id === questionId) || null;
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
    if (config.resetPosition !== false) {
      scheduleQuestionPositionReset(questionId);
    }

    return true;
  }

  function renderPanel() {
    if (!panel) {
      return;
    }

    panel.renderQuestions(appState.questions, appState.activeQuestionId);
    panel.setActiveQuestion(appState.activeQuestionId);
  }

  function ensurePanel() {
    if (panel) {
      return;
    }

    panel = panelModule.createPanel({
      state: appState.panelState,
      onSelectQuestion,
      onStateChange: persistPanelState
    });
  }

  function destroyPanel() {
    if (!panel) {
      return;
    }

    panel.destroy();
    panel = null;
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

    if (questionsChanged) {
      renderPanel();
    } else if (panel) {
      panel.setActiveQuestion(appState.activeQuestionId);
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

  function onConversationMutation() {
    scheduleSync();
  }

  async function persistPanelState(nextState) {
    const normalized = await storage.savePanelState(nextState);
    appState.panelState = normalized;
  }

  function onSelectQuestion(questionId) {
    showQuestionById(questionId, {
      resetPosition: true
    });
  }

  async function bootstrap() {
    appState.panelState = await storage.loadPanelState();

    virtualizer = virtualizerModule.createConversationVirtualizer({
      getAdjacentQuestion,
      onSelectQuestion
    });

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
