(function initStorageModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const STORAGE_KEY = "qnav.panelState.v1";
  const DEFAULT_PANEL_STATE = Object.freeze({
    collapsed: false,
    width: 320
  });
  const MIN_WIDTH = 260;
  const MAX_WIDTH = 480;

  function clampWidth(width) {
    if (typeof width !== "number" || Number.isNaN(width)) {
      return DEFAULT_PANEL_STATE.width;
    }

    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
  }

  function normalizePanelState(state) {
    return {
      collapsed: Boolean(state && state.collapsed),
      width: clampWidth(state && state.width)
    };
  }

  function hasChromeStorage() {
    try {
      return typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local &&
        typeof chrome.storage.local.get === "function";
    } catch (error) {
      return false;
    }
  }

  function isRuntimeLastErrorSet() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.lastError);
    } catch (error) {
      return true;
    }
  }

  function readLocalFallback() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return normalizePanelState(DEFAULT_PANEL_STATE);
      }

      return normalizePanelState(JSON.parse(raw));
    } catch (error) {
      return normalizePanelState(DEFAULT_PANEL_STATE);
    }
  }

  function writeLocalFallback(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Ignore local fallback failures.
    }
  }

  async function loadPanelState() {
    if (!hasChromeStorage()) {
      return readLocalFallback();
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (isRuntimeLastErrorSet()) {
            resolve(readLocalFallback());
            return;
          }

          resolve(normalizePanelState(result[STORAGE_KEY] || DEFAULT_PANEL_STATE));
        });
      } catch (error) {
        resolve(readLocalFallback());
      }
    });
  }

  async function savePanelState(state) {
    const nextState = normalizePanelState(state);

    if (!hasChromeStorage()) {
      writeLocalFallback(nextState);
      return nextState;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: nextState }, () => {
          if (isRuntimeLastErrorSet()) {
            writeLocalFallback(nextState);
          }

          resolve(nextState);
        });
      } catch (error) {
        writeLocalFallback(nextState);
        resolve(nextState);
      }
    });
  }

  root.storage = {
    DEFAULT_PANEL_STATE,
    MIN_WIDTH,
    MAX_WIDTH,
    normalizePanelState,
    loadPanelState,
    savePanelState
  };
}());
