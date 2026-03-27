(function initStorageModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const STORAGE_KEY = "qnav.panelState.v1";
  const FAVORITES_KEY = "qnav.favorites.v1";
  const LANGUAGE_KEY = "qnav.language.v1";
  const DEFAULT_LANGUAGE_PREFERENCE = "auto";
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

  function normalizeLanguagePreference(value) {
    const nextValue = String(value || DEFAULT_LANGUAGE_PREFERENCE).trim();
    if (nextValue === "auto" || nextValue === "zh-CN" || nextValue === "en") {
      return nextValue;
    }

    return DEFAULT_LANGUAGE_PREFERENCE;
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

  function readLanguageFallback() {
    try {
      return normalizeLanguagePreference(window.localStorage.getItem(LANGUAGE_KEY));
    } catch (error) {
      return DEFAULT_LANGUAGE_PREFERENCE;
    }
  }

  function writeLocalFallback(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Ignore local fallback failures.
    }
  }

  function writeLanguageFallback(value) {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, normalizeLanguagePreference(value));
    } catch (error) {
      // Ignore local fallback failures.
    }
  }

  function makeFavoriteId(record) {
    const conversationId = String(record && record.conversationId || "").trim();
    const questionId = String(record && record.questionId || "").trim();
    if (!conversationId || !questionId) {
      return "";
    }

    return conversationId + "::" + questionId;
  }

  function normalizeTimestamp(value, fallbackValue) {
    const nextValue = typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(value, 10);
    if (Number.isFinite(nextValue)) {
      return nextValue;
    }

    return fallbackValue;
  }

  function normalizeInlineText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeMultilineText(value) {
    const source = String(value || "").replace(/\r\n?/g, "\n");
    if (!source.trim()) {
      return "";
    }

    const normalizedLines = source.split("\n").map((line) => {
      return line
        .replace(/\u00a0/g, " ")
        .replace(/\s+$/g, "");
    });
    const normalizedText = normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return normalizedText;
  }

  function normalizeHtmlValue(value) {
    return String(value || "").trim();
  }

  function normalizeFavoriteRecord(record, existingRecord) {
    const previous = existingRecord || {};
    const now = Date.now();
    const favoriteId = makeFavoriteId(record || previous);
    if (!favoriteId) {
      return null;
    }

    return {
      favoriteId,
      conversationId: String(record && record.conversationId || previous.conversationId || ""),
      conversationUrl: String(record && record.conversationUrl || previous.conversationUrl || ""),
      conversationTitle: normalizeInlineText(record && record.conversationTitle || previous.conversationTitle || ""),
      questionId: String(record && record.questionId || previous.questionId || ""),
      questionIndex: typeof record?.questionIndex === "number"
        ? record.questionIndex
        : typeof previous.questionIndex === "number"
          ? previous.questionIndex
          : 0,
      questionText: normalizeMultilineText(record && record.questionText || previous.questionText || ""),
      answerText: normalizeMultilineText(record && record.answerText || previous.answerText || ""),
      questionHtml: normalizeHtmlValue(record && record.questionHtml || previous.questionHtml || ""),
      answerHtml: normalizeHtmlValue(record && record.answerHtml || previous.answerHtml || ""),
      note: normalizeMultilineText(record && record.note || previous.note || ""),
      createdAt: normalizeTimestamp(record && record.createdAt, normalizeTimestamp(previous.createdAt, now)),
      updatedAt: normalizeTimestamp(record && record.updatedAt, now)
    };
  }

  function normalizeFavorites(items) {
    const favorites = Array.isArray(items) ? items : [];
    const deduped = new Map();

    favorites.forEach((item) => {
      const normalized = normalizeFavoriteRecord(item);
      if (!normalized) {
        return;
      }

      const existing = deduped.get(normalized.favoriteId);
      if (!existing || normalized.updatedAt >= existing.updatedAt) {
        deduped.set(normalized.favoriteId, normalized);
      }
    });

    return Array.from(deduped.values()).sort((left, right) => {
      return right.updatedAt - left.updatedAt;
    });
  }

  function readFavoritesFallback() {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) {
        return [];
      }

      return normalizeFavorites(JSON.parse(raw));
    } catch (error) {
      return [];
    }
  }

  function writeFavoritesFallback(items) {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(normalizeFavorites(items)));
    } catch (error) {
      // Ignore local fallback failures.
    }
  }

  async function loadFavorites() {
    if (!hasChromeStorage()) {
      return readFavoritesFallback();
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([FAVORITES_KEY], (result) => {
          if (isRuntimeLastErrorSet()) {
            resolve(readFavoritesFallback());
            return;
          }

          resolve(normalizeFavorites(result[FAVORITES_KEY] || []));
        });
      } catch (error) {
        resolve(readFavoritesFallback());
      }
    });
  }

  async function saveFavorites(items) {
    const favorites = normalizeFavorites(items);

    if (!hasChromeStorage()) {
      writeFavoritesFallback(favorites);
      return favorites;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [FAVORITES_KEY]: favorites }, () => {
          if (isRuntimeLastErrorSet()) {
            writeFavoritesFallback(favorites);
          }

          resolve(favorites);
        });
      } catch (error) {
        writeFavoritesFallback(favorites);
        resolve(favorites);
      }
    });
  }

  async function saveFavorite(record) {
    const favorites = await loadFavorites();
    const nextRecord = normalizeFavoriteRecord(record, favorites.find((item) => item.favoriteId === makeFavoriteId(record)));
    if (!nextRecord) {
      return favorites;
    }

    const nextFavorites = favorites.filter((item) => item.favoriteId !== nextRecord.favoriteId);
    nextFavorites.push(nextRecord);
    return saveFavorites(nextFavorites);
  }

  async function removeFavorite(favoriteId) {
    const nextFavoriteId = String(favoriteId || "").trim();
    if (!nextFavoriteId) {
      return loadFavorites();
    }

    const favorites = await loadFavorites();
    return saveFavorites(favorites.filter((item) => item.favoriteId !== nextFavoriteId));
  }

  async function updateFavoriteNote(favoriteId, note) {
    const nextFavoriteId = String(favoriteId || "").trim();
    const favorites = await loadFavorites();
    const existing = favorites.find((item) => item.favoriteId === nextFavoriteId);
    if (!existing) {
      return favorites;
    }

    return saveFavorite(Object.assign({}, existing, {
      note: String(note || "").trim(),
      updatedAt: Date.now()
    }));
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

  async function loadLanguagePreference() {
    if (!hasChromeStorage()) {
      return readLanguageFallback();
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([LANGUAGE_KEY], (result) => {
          if (isRuntimeLastErrorSet()) {
            resolve(readLanguageFallback());
            return;
          }

          resolve(normalizeLanguagePreference(result[LANGUAGE_KEY] || DEFAULT_LANGUAGE_PREFERENCE));
        });
      } catch (error) {
        resolve(readLanguageFallback());
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

  async function saveLanguagePreference(value) {
    const nextValue = normalizeLanguagePreference(value);

    if (!hasChromeStorage()) {
      writeLanguageFallback(nextValue);
      return nextValue;
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [LANGUAGE_KEY]: nextValue }, () => {
          if (isRuntimeLastErrorSet()) {
            writeLanguageFallback(nextValue);
          }

          resolve(nextValue);
        });
      } catch (error) {
        writeLanguageFallback(nextValue);
        resolve(nextValue);
      }
    });
  }

  root.storage = {
    DEFAULT_PANEL_STATE,
    DEFAULT_LANGUAGE_PREFERENCE,
    FAVORITES_KEY,
    LANGUAGE_KEY,
    MIN_WIDTH,
    MAX_WIDTH,
    makeFavoriteId,
    normalizeFavoriteRecord,
    normalizeLanguagePreference,
    normalizePanelState,
    loadFavorites,
    loadLanguagePreference,
    saveFavorite,
    saveFavorites,
    loadPanelState,
    removeFavorite,
    updateFavoriteNote,
    saveLanguagePreference,
    savePanelState
  };
}());
