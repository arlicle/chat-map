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
    return typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local &&
      typeof chrome.storage.local.get === "function";
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
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(readLocalFallback());
          return;
        }

        resolve(normalizePanelState(result[STORAGE_KEY] || DEFAULT_PANEL_STATE));
      });
    });
  }

  async function savePanelState(state) {
    const nextState = normalizePanelState(state);

    if (!hasChromeStorage()) {
      writeLocalFallback(nextState);
      return nextState;
    }

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: nextState }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          writeLocalFallback(nextState);
        }

        resolve(nextState);
      });
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
