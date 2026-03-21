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
  let visibilityTracker = null;
  let virtualizer = null;
  let resumeSyncTimerId = null;
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

  function refreshVisibilityTracking() {
    if (!visibilityTracker) {
      return;
    }

    const observableQuestions = virtualizer
      ? virtualizer.getObservableQuestions(appState.questions)
      : appState.questions;
    visibilityTracker.observeQuestions(observableQuestions);
  }

  function scheduleResumeSync(delayMs) {
    window.clearTimeout(resumeSyncTimerId);
    resumeSyncTimerId = window.setTimeout(() => {
      resumeSyncTimerId = null;
      scheduleSync();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function suspendVirtualization(durationMs) {
    if (!virtualizer) {
      return;
    }

    const resumeAt = virtualizer.suspend(durationMs);
    scheduleResumeSync(Math.max(0, resumeAt - Date.now()) + 32);
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
      refreshVisibilityTracking();
      destroyPanel();
      return;
    }

    const extractedQuestions = extractor.extractQuestions(adapter);
    const nextQuestions = virtualizer
      ? virtualizer.reconcileQuestions(extractedQuestions)
      : extractedQuestions;
    const nextSignature = buildQuestionsSignature(nextQuestions);
    const questionsChanged = nextSignature !== appState.questionsSignature;

    ensurePanel();
    appState.questions = nextQuestions;
    appState.questionsSignature = nextSignature;
    if (virtualizer) {
      virtualizer.applyQuestions(appState.questions);
      if (appState.activeQuestionId && !virtualizer.isSuspended()) {
        virtualizer.setActiveQuestion(appState.activeQuestionId);
      }
    }
    if (appState.activeQuestionId && !getQuestionById(appState.activeQuestionId)) {
      appState.activeQuestionId = appState.questions.length ? appState.questions[0].id : null;
      if (virtualizer && appState.activeQuestionId && !virtualizer.isSuspended()) {
        virtualizer.setActiveQuestion(appState.activeQuestionId);
      }
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

  function onConversationMutation() {
    suspendVirtualization(900);
    scheduleSync();
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
    if (virtualizer) {
      virtualizer.ensureQuestionVisible(question);
      refreshVisibilityTracking();
    }

    window.requestAnimationFrame(() => {
      navigator.scrollToQuestion(question);
    });
  }

  function onActiveQuestionChange(questionId) {
    appState.activeQuestionId = questionId;
    if (virtualizer && questionId) {
      if (!virtualizer.isSuspended()) {
        virtualizer.setActiveQuestion(questionId);
        refreshVisibilityTracking();
      }
    }

    if (panel) {
      panel.setActiveQuestion(questionId);
    }
  }

  async function bootstrap() {
    appState.panelState = await storage.loadPanelState();

    visibilityTracker = observerModule.createQuestionVisibilityTracker({
      onActiveChange: onActiveQuestionChange
    });
    virtualizer = virtualizerModule.createConversationVirtualizer({
      windowRadius: 3
    });

    installHistoryChangeListener();
    ensureMutationObserver(extractor.resolveConversationAdapter());
    installInteractionPauseListeners();

    syncQuestions();
  }

  function isConversationInputTarget(target) {
    return target instanceof HTMLElement &&
      target.matches("#prompt-textarea, textarea, [contenteditable='true'], [contenteditable='plaintext-only']");
  }

  function installInteractionPauseListeners() {
    const pause = () => {
      suspendVirtualization(1800);
    };

    document.addEventListener("focusin", (event) => {
      if (isConversationInputTarget(event.target)) {
        pause();
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (isConversationInputTarget(event.target)) {
        pause();
      }
    }, true);

    document.addEventListener("input", (event) => {
      if (isConversationInputTarget(event.target)) {
        pause();
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
}());
