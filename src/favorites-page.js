(function initFavoritesPage() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const storage = root.storage;
  if (!storage) {
    return;
  }

  const state = {
    favorites: [],
    filteredFavorites: [],
    query: "",
    activeFavoriteId: ""
  };

  const listEl = document.getElementById("favorites-list");
  const emptyEl = document.getElementById("favorites-empty");
  const countEl = document.getElementById("favorites-count");
  const detailEl = document.getElementById("favorites-detail");
  const searchInputEl = document.getElementById("favorites-search-input");

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function truncateText(text, limit) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return "";
    }

    if (normalized.length <= limit) {
      return normalized;
    }

    return normalized.slice(0, Math.max(0, limit - 1)).trimEnd() + "\u2026";
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp || Date.now());
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function buildSearchText(favorite) {
    return [
      favorite.conversationTitle,
      favorite.questionText,
      favorite.answerText,
      favorite.note
    ].filter(Boolean).join("\n").toLowerCase();
  }

  function filterFavorites() {
    const query = normalizeText(state.query).toLowerCase();
    if (!query) {
      state.filteredFavorites = state.favorites.slice();
      return;
    }

    state.filteredFavorites = state.favorites.filter((favorite) => {
      return buildSearchText(favorite).indexOf(query) !== -1;
    });
  }

  function getActiveFavorite() {
    return state.filteredFavorites.find((favorite) => favorite.favoriteId === state.activeFavoriteId) ||
      state.favorites.find((favorite) => favorite.favoriteId === state.activeFavoriteId) ||
      null;
  }

  function ensureActiveFavorite() {
    const activeFavorite = getActiveFavorite();
    if (activeFavorite) {
      state.activeFavoriteId = activeFavorite.favoriteId;
      return;
    }

    state.activeFavoriteId = state.filteredFavorites.length ? state.filteredFavorites[0].favoriteId : "";
  }

  function renderList() {
    listEl.textContent = "";
    countEl.textContent = state.filteredFavorites.length + " 条收藏";

    if (!state.favorites.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = "还没有收藏内容。回到聊天页，点击星标即可保存。";
      return;
    }

    if (!state.filteredFavorites.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = "没有匹配到收藏内容。";
      return;
    }

    emptyEl.hidden = true;

    state.filteredFavorites.forEach((favorite) => {
      const itemEl = document.createElement("button");
      itemEl.type = "button";
      itemEl.className = "favorites-item";
      itemEl.dataset.favoriteId = favorite.favoriteId;
      if (favorite.favoriteId === state.activeFavoriteId) {
        itemEl.classList.add("is-active");
      }

      itemEl.innerHTML = [
        "<div class='favorites-item-meta'>",
        "  <span>" + escapeHtml(favorite.conversationTitle || "未命名会话") + "</span>",
        "  <span>" + escapeHtml(formatDate(favorite.updatedAt)) + "</span>",
        "</div>",
        "<h2 class='favorites-item-title'>" + escapeHtml(truncateText(favorite.questionText, 96)) + "</h2>",
        "<div class='favorites-item-preview'>" + escapeHtml(truncateText(favorite.answerText, 132) || "暂无回答") + "</div>",
        favorite.note
          ? "<div class='favorites-item-note'>" + escapeHtml(truncateText(favorite.note, 96)) + "</div>"
          : ""
      ].join("");

      itemEl.addEventListener("click", () => {
        state.activeFavoriteId = favorite.favoriteId;
        render();
      });
      listEl.appendChild(itemEl);
    });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderDetail() {
    const favorite = getActiveFavorite();
    if (!favorite) {
      detailEl.innerHTML = "<div class='favorites-detail-empty'>选择左侧一条收藏，查看完整问答和备注。</div>";
      return;
    }

    detailEl.innerHTML = [
      "<div class='favorites-detail-meta'>",
      "  <div class='favorites-detail-meta-copy'>",
      "    <p class='favorites-detail-kicker'>收藏于 " + escapeHtml(formatDate(favorite.createdAt)) + "</p>",
      "    <h2 class='favorites-detail-title'>" + escapeHtml(truncateText(favorite.questionText, 160)) + "</h2>",
      "  </div>",
      "  <div class='favorites-detail-actions'>",
      favorite.conversationUrl
        ? "    <button class='favorites-button' data-action='open-source'>打开原会话</button>"
        : "",
      "    <button class='favorites-button is-danger' data-action='remove'>取消收藏</button>",
      "  </div>",
      "</div>",
      "<p class='favorites-source'>" + escapeHtml(favorite.conversationTitle || "未命名会话") + "</p>",
      "<section class='favorites-block'>",
      "  <p class='favorites-block-label'>问题</p>",
      "  <div class='favorites-block-body'>" + escapeHtml(favorite.questionText) + "</div>",
      "</section>",
      "<section class='favorites-block'>",
      "  <p class='favorites-block-label'>答案</p>",
      "  <div class='favorites-block-body'>" + escapeHtml(favorite.answerText || "暂无回答") + "</div>",
      "</section>",
      "<section class='favorites-note-editor'>",
      "  <p class='favorites-block-label'>备注</p>",
      "  <textarea class='favorites-note-input' placeholder='写一点这条内容为什么值得保存'>" + escapeHtml(favorite.note) + "</textarea>",
      "  <div class='favorites-note-actions'>",
      "    <button class='favorites-button is-primary' data-action='save-note'>保存备注</button>",
      "  </div>",
      "</section>"
    ].join("");

    const saveButtonEl = detailEl.querySelector("[data-action='save-note']");
    const removeButtonEl = detailEl.querySelector("[data-action='remove']");
    const openSourceButtonEl = detailEl.querySelector("[data-action='open-source']");
    const noteInputEl = detailEl.querySelector(".favorites-note-input");

    if (saveButtonEl && noteInputEl) {
      saveButtonEl.addEventListener("click", async () => {
        state.favorites = await storage.updateFavoriteNote(favorite.favoriteId, noteInputEl.value || "");
        filterFavorites();
        ensureActiveFavorite();
        render();
      });
    }

    if (removeButtonEl) {
      removeButtonEl.addEventListener("click", async () => {
        state.favorites = await storage.removeFavorite(favorite.favoriteId);
        filterFavorites();
        ensureActiveFavorite();
        render();
      });
    }

    if (openSourceButtonEl) {
      openSourceButtonEl.addEventListener("click", () => {
        window.open(favorite.conversationUrl, "_blank", "noopener");
      });
    }
  }

  function render() {
    renderList();
    renderDetail();
  }

  async function reloadFavorites() {
    state.favorites = await storage.loadFavorites();
    filterFavorites();
    ensureActiveFavorite();
    render();
  }

  searchInputEl.addEventListener("input", (event) => {
    state.query = event.target.value || "";
    filterFavorites();
    ensureActiveFavorite();
    render();
  });

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[storage.FAVORITES_KEY]) {
        return;
      }

      reloadFavorites();
    });
  }

  reloadFavorites();
}());
