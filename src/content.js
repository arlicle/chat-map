(function initContentScript() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
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

  function syncQuestions() {
    syncScheduled = false;

    if (window.location.href !== appState.currentUrl) {
      appState.currentUrl = window.location.href;
    }

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

    mutationObserver = observerModule.createConversationMutationObserver(
      extractor.getObservationRoot(),
      scheduleSync
    );

    window.addEventListener("popstate", scheduleSync);
    window.addEventListener("hashchange", scheduleSync);
    window.setInterval(() => {
      if (window.location.href !== appState.currentUrl) {
        scheduleSync();
      }
    }, 1000);

    syncQuestions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
}());
