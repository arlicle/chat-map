(function initPanelModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const MIN_WIDTH = root.storage ? root.storage.MIN_WIDTH : 260;
  const MAX_WIDTH = root.storage ? root.storage.MAX_WIDTH : 480;
  const COLLAPSED_WIDTH = 48;

  function createPanel(options) {
    const config = options || {};
    const initialState = config.state || { collapsed: false, width: 320 };
    const state = {
      collapsed: Boolean(initialState.collapsed),
      width: initialState.width
    };

    const panelEl = document.createElement("aside");
    panelEl.id = "qnav-root";
    panelEl.className = "qnav-root";
    panelEl.setAttribute("aria-label", "Question Navigator");

    panelEl.innerHTML = [
      "<div class='qnav-resize-handle' aria-hidden='true'></div>",
      "<div class='qnav-shell'>",
      "  <div class='qnav-header'>",
      "    <div class='qnav-title-wrap'>",
      "      <div class='qnav-title'>Questions</div>",
      "      <div class='qnav-subtitle'>Jump to earlier prompts in this conversation</div>",
      "    </div>",
      "    <div class='qnav-header-actions'>",
      "      <button class='qnav-favorites-button' type='button' aria-label='Open favorites'>",
      "        <span class='qnav-favorites-button-icon'>★</span>",
      "        <span class='qnav-favorites-button-count'>0</span>",
      "      </button>",
      "      <button class='qnav-toggle' type='button' aria-label='Collapse question navigator'></button>",
      "    </div>",
      "  </div>",
      "  <div class='qnav-search-wrap'>",
      "    <input class='qnav-search-input' type='search' placeholder='Search questions and answers' aria-label='Search questions and answers' />",
      "  </div>",
      "  <div class='qnav-count'></div>",
      "  <div class='qnav-empty'>No questions found in this conversation yet.</div>",
      "  <div class='qnav-list' role='listbox' aria-label='Conversation questions'></div>",
      "  <button class='qnav-collapsed-tab' type='button' aria-label='Expand question navigator'>Q</button>",
      "</div>"
    ].join("");

    document.body.appendChild(panelEl);

    const resizeHandleEl = panelEl.querySelector(".qnav-resize-handle");
    const toggleButtonEl = panelEl.querySelector(".qnav-toggle");
    const favoritesButtonEl = panelEl.querySelector(".qnav-favorites-button");
    const favoritesCountEl = panelEl.querySelector(".qnav-favorites-button-count");
    const collapsedTabEl = panelEl.querySelector(".qnav-collapsed-tab");
    const searchInputEl = panelEl.querySelector(".qnav-search-input");
    const listEl = panelEl.querySelector(".qnav-list");
    const emptyEl = panelEl.querySelector(".qnav-empty");
    const countEl = panelEl.querySelector(".qnav-count");
    let questionItems = [];
    let activeQuestionId = null;
    let dragState = null;
    let lastRenderSignature = "";
    let currentSearchState = {
      query: "",
      results: []
    };
    let favoritesCount = 0;

    function updateCountText() {
      if (currentSearchState.query) {
        countEl.textContent = "找到 " + currentSearchState.results.length + " 条结果";
        return;
      }

      if (!questionItems.length) {
        countEl.textContent = "0 questions";
        return;
      }

      const activeIndex = questionItems.findIndex((item) => item.id === activeQuestionId);
      if (activeIndex === -1) {
        countEl.textContent = questionItems.length + " question" + (questionItems.length === 1 ? "" : "s");
        return;
      }

      countEl.textContent = "Q" + questionItems[activeIndex].index + " / " + questionItems.length;
    }

    function setFavoritesCount(count) {
      favoritesCount = Math.max(0, Number(count) || 0);
      favoritesCountEl.textContent = String(favoritesCount);
      favoritesButtonEl.title = favoritesCount
        ? "Open favorites (" + favoritesCount + ")"
        : "Open favorites";
    }

    function buildQuestionsSignature(items) {
      return (Array.isArray(items) ? items : []).map((item) => {
        return [item.id, item.index, item.shortTitle].join(":");
      }).join("|");
    }

    function buildSearchSignature(searchState) {
      const state = searchState || { query: "", results: [] };
      return [
        state.query || "",
        (Array.isArray(state.results) ? state.results : []).map((item) => {
          return [item.questionId, item.matchType, item.preview].join(":");
        }).join("|")
      ].join("::");
    }

    function buildRenderSignature(items, searchState) {
      return [
        buildQuestionsSignature(items),
        buildSearchSignature(searchState)
      ].join("||");
    }

    function isListItemFullyVisible(itemEl, containerEl) {
      if (!(itemEl instanceof HTMLElement) || !(containerEl instanceof HTMLElement)) {
        return false;
      }

      const itemRect = itemEl.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();
      return itemRect.top >= containerRect.top && itemRect.bottom <= containerRect.bottom;
    }

    function clampWidth(width) {
      return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
    }

    function emitStateChange() {
      if (typeof config.onStateChange === "function") {
        config.onStateChange({
          collapsed: state.collapsed,
          width: state.width
        });
      }
    }

    function emitLayoutChange() {
      if (typeof config.onLayoutChange === "function") {
        config.onLayoutChange({
          collapsed: state.collapsed,
          width: state.width,
          renderedWidth: state.collapsed ? COLLAPSED_WIDTH : state.width
        });
      }
    }

    function applyState() {
      panelEl.dataset.collapsed = state.collapsed ? "true" : "false";
      panelEl.style.width = (state.collapsed ? COLLAPSED_WIDTH : state.width) + "px";
      toggleButtonEl.textContent = state.collapsed ? "\u2039" : "\u203a";
      toggleButtonEl.setAttribute(
        "aria-label",
        state.collapsed ? "Expand question navigator" : "Collapse question navigator"
      );
      emitLayoutChange();
    }

    function setCollapsed(collapsed, shouldPersist) {
      state.collapsed = Boolean(collapsed);
      applyState();
      if (shouldPersist) {
        emitStateChange();
      }
    }

    function setWidth(width, shouldPersist) {
      state.width = clampWidth(width);
      applyState();
      if (shouldPersist) {
        emitStateChange();
      }
    }

    function createQuestionButton(item) {
      const buttonEl = document.createElement("button");
      buttonEl.type = "button";
      buttonEl.className = "qnav-item";
      buttonEl.dataset.qnavQuestionId = item.id;
      buttonEl.setAttribute("role", "option");
      buttonEl.setAttribute("aria-selected", item.id === activeQuestionId ? "true" : "false");
      if (item.id === activeQuestionId) {
        buttonEl.classList.add("is-active");
      }

      const indexEl = document.createElement("span");
      indexEl.className = "qnav-item-index";
      indexEl.textContent = "Q" + item.index;

      const titleEl = document.createElement("span");
      titleEl.className = "qnav-item-title";
      titleEl.textContent = item.shortTitle;

      buttonEl.appendChild(indexEl);
      buttonEl.appendChild(titleEl);
      return buttonEl;
    }

    function createSearchResultButton(result) {
      const buttonEl = document.createElement("button");
      buttonEl.type = "button";
      buttonEl.className = "qnav-item qnav-search-result";
      buttonEl.dataset.qnavQuestionId = result.questionId;
      buttonEl.dataset.qnavMatchType = result.matchType;
      buttonEl.setAttribute("role", "option");
      buttonEl.setAttribute("aria-selected", result.questionId === activeQuestionId ? "true" : "false");
      if (result.questionId === activeQuestionId) {
        buttonEl.classList.add("is-active");
      }

      const indexEl = document.createElement("span");
      indexEl.className = "qnav-item-index";
      indexEl.textContent = "Q" + result.index;

      const bodyEl = document.createElement("span");
      bodyEl.className = "qnav-search-result-body";

      const metaEl = document.createElement("span");
      metaEl.className = "qnav-search-result-meta";

      const typeEl = document.createElement("span");
      typeEl.className = "qnav-search-result-type";
      typeEl.textContent = result.matchType === "answer" ? "答案" : "问题";

      const titleEl = document.createElement("span");
      titleEl.className = "qnav-search-result-title";
      titleEl.textContent = result.title;

      metaEl.appendChild(typeEl);
      metaEl.appendChild(titleEl);

      const previewEl = document.createElement("span");
      previewEl.className = "qnav-search-result-preview";
      previewEl.textContent = result.preview;

      bodyEl.appendChild(metaEl);
      bodyEl.appendChild(previewEl);

      buttonEl.appendChild(indexEl);
      buttonEl.appendChild(bodyEl);
      return buttonEl;
    }

    function renderQuestions(items, activeId, searchState) {
      const nextItems = Array.isArray(items) ? items.slice() : [];
      const nextSearchState = {
        query: searchState && searchState.query ? searchState.query : "",
        results: Array.isArray(searchState && searchState.results) ? searchState.results.slice() : []
      };
      const nextSignature = buildRenderSignature(nextItems, nextSearchState);
      questionItems = nextItems;
      activeQuestionId = activeId || null;
      currentSearchState = nextSearchState;

      if (searchInputEl.value !== currentSearchState.query) {
        searchInputEl.value = currentSearchState.query;
      }

      if (nextSignature === lastRenderSignature) {
        setActiveQuestion(activeQuestionId);
        return;
      }

      lastRenderSignature = nextSignature;
      listEl.textContent = "";

      if (currentSearchState.query && !currentSearchState.results.length) {
        emptyEl.hidden = false;
        emptyEl.textContent = "No matches found for \"" + currentSearchState.query + "\".";
        updateCountText();
        return;
      }

      if (!currentSearchState.query && !questionItems.length) {
        emptyEl.hidden = false;
        emptyEl.textContent = "No questions found in this conversation yet.";
        updateCountText();
        return;
      }

      emptyEl.hidden = true;
      emptyEl.textContent = "No questions found in this conversation yet.";
      updateCountText();

      if (currentSearchState.query) {
        currentSearchState.results.forEach((result) => {
          listEl.appendChild(createSearchResultButton(result));
        });
        return;
      }

      questionItems.forEach((item) => {
        listEl.appendChild(createQuestionButton(item));
      });
    }

    function setActiveQuestion(questionId) {
      const nextActiveId = questionId || null;
      if (nextActiveId === activeQuestionId) {
        return;
      }

      activeQuestionId = nextActiveId;
      updateCountText();
      const itemEls = listEl.querySelectorAll(".qnav-item");
      itemEls.forEach((itemEl) => {
        const isActive = activeQuestionId && itemEl.dataset.qnavQuestionId === activeQuestionId;
        itemEl.classList.toggle("is-active", Boolean(isActive));
        itemEl.setAttribute("aria-selected", isActive ? "true" : "false");

        if (isActive && !isListItemFullyVisible(itemEl, listEl)) {
          itemEl.scrollIntoView({
            block: "nearest"
          });
        }
      });
    }

    function getState() {
      return {
        collapsed: state.collapsed,
        width: state.width
      };
    }

    function onToggleClick() {
      setCollapsed(!state.collapsed, true);
    }

    function onFavoritesClick() {
      if (typeof config.onOpenFavorites === "function") {
        config.onOpenFavorites();
      }
    }

    function onListClick(event) {
      const target = event.target.closest(".qnav-item");
      if (!target) {
        return;
      }

      const questionId = target.dataset.qnavQuestionId;
      if (!questionId || typeof config.onSelectQuestion !== "function") {
        return;
      }

      config.onSelectQuestion(questionId, target.dataset.qnavMatchType || "question");
    }

    function onSearchInput(event) {
      if (typeof config.onSearchChange !== "function") {
        return;
      }

      config.onSearchChange(event.target.value || "");
    }

    function onResizeStart(event) {
      if (state.collapsed || event.button !== 0) {
        return;
      }

      dragState = {
        startX: event.clientX,
        startWidth: state.width
      };

      document.body.classList.add("qnav-resizing");
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", onResizeEnd);
      event.preventDefault();
    }

    function onResizeMove(event) {
      if (!dragState) {
        return;
      }

      const nextWidth = dragState.startWidth + (dragState.startX - event.clientX);
      setWidth(nextWidth, false);
    }

    function onResizeEnd() {
      if (!dragState) {
        return;
      }

      dragState = null;
      document.body.classList.remove("qnav-resizing");
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeEnd);
      emitStateChange();
    }

    function destroy() {
      dragState = null;
      document.body.classList.remove("qnav-resizing");
      toggleButtonEl.removeEventListener("click", onToggleClick);
      favoritesButtonEl.removeEventListener("click", onFavoritesClick);
      collapsedTabEl.removeEventListener("click", onToggleClick);
      listEl.removeEventListener("click", onListClick);
      searchInputEl.removeEventListener("input", onSearchInput);
      resizeHandleEl.removeEventListener("mousedown", onResizeStart);
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeEnd);
      panelEl.remove();
    }

    toggleButtonEl.addEventListener("click", onToggleClick);
    favoritesButtonEl.addEventListener("click", onFavoritesClick);
    collapsedTabEl.addEventListener("click", onToggleClick);
    listEl.addEventListener("click", onListClick);
    searchInputEl.addEventListener("input", onSearchInput);
    resizeHandleEl.addEventListener("mousedown", onResizeStart);

    applyState();

    return {
      renderQuestions,
      setFavoritesCount,
      setActiveQuestion,
      setCollapsed,
      setWidth,
      getState,
      destroy
    };
  }

  root.panel = {
    createPanel
  };
}());
