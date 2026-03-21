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
  let visibilityTracker = null;
  let syncScheduled = false;

  function getQuestionById(questionId) {
    return appState.questions.find((item) => item.id === questionId) || null;
  }

  function renderPanel() {
    if (!panel) {
      return;
    }

    panel.renderQuestions(appState.questions, appState.activeQuestionId);
    panel.setActiveQuestion(appState.activeQuestionId);
  }

  function buildQuestionsSignature(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
      return [item.id, item.index, item.shortTitle].join(":");
    }).join("|");
  }

  function refreshVisibilityTracking() {
    if (!visibilityTracker) {
      return;
    }

    visibilityTracker.observeQuestions(appState.questions);
  }

  function ensureMutationObserver() {
    const nextObservationRoot = extractor.getObservationRoot();
    if (mutationObserver && nextObservationRoot === observationRoot) {
      return;
    }

    observationRoot = nextObservationRoot;
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = observerModule.createConversationMutationObserver(
      observationRoot,
      scheduleSync
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

    if (window.location.href !== appState.currentUrl) {
      appState.currentUrl = window.location.href;
    }

    ensureMutationObserver();

    const nextQuestions = extractor.extractQuestions(adapter);
    const nextSignature = buildQuestionsSignature(nextQuestions);
    const questionsChanged = nextSignature !== appState.questionsSignature;

    appState.questions = nextQuestions;
    appState.questionsSignature = nextSignature;
    if (appState.activeQuestionId && !getQuestionById(appState.activeQuestionId)) {
      appState.activeQuestionId = appState.questions.length ? appState.questions[0].id : null;
    }

    if (questionsChanged) {
      renderPanel();
    } else if (panel) {
      panel.setActiveQuestion(appState.activeQuestionId);
    }

    refreshVisibilityTracking();
  }

  function scheduleSync() {
    if (syncScheduled) {
      return;
    }

    syncScheduled = true;
    window.requestAnimationFrame(syncQuestions);
  }

  async function persistPanelState(nextState) {
    const normalized = await storage.savePanelState(nextState);
    appState.panelState = normalized;
  }

  function onSelectQuestion(questionId) {
    const question = getQuestionById(questionId);
    if (!question) {
      return;
    }

    appState.activeQuestionId = questionId;
    panel.setActiveQuestion(questionId);
    navigator.scrollToQuestion(question);
  }

  function onActiveQuestionChange(questionId) {
    appState.activeQuestionId = questionId;
    if (panel) {
      panel.setActiveQuestion(questionId);
    }
  }

  async function bootstrap() {
    adapter = extractor.createChatGPTWebAdapter();
    appState.panelState = await storage.loadPanelState();

    panel = panelModule.createPanel({
      state: appState.panelState,
      onSelectQuestion,
      onStateChange: persistPanelState
    });

    visibilityTracker = observerModule.createQuestionVisibilityTracker({
      onActiveChange: onActiveQuestionChange
    });

    installHistoryChangeListener();
    ensureMutationObserver();

    syncQuestions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
}());
