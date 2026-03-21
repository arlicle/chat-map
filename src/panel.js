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
      "    <button class='qnav-toggle' type='button' aria-label='Collapse question navigator'></button>",
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
    const collapsedTabEl = panelEl.querySelector(".qnav-collapsed-tab");
    const listEl = panelEl.querySelector(".qnav-list");
    const emptyEl = panelEl.querySelector(".qnav-empty");
    const countEl = panelEl.querySelector(".qnav-count");
    let questionItems = [];
    let activeQuestionId = null;
    let dragState = null;
    let lastRenderSignature = "";

    function buildQuestionsSignature(items) {
      return (Array.isArray(items) ? items : []).map((item) => {
        return [item.id, item.index, item.shortTitle].join(":");
      }).join("|");
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

    function applyState() {
      panelEl.dataset.collapsed = state.collapsed ? "true" : "false";
      panelEl.style.width = (state.collapsed ? COLLAPSED_WIDTH : state.width) + "px";
      toggleButtonEl.textContent = state.collapsed ? "\u2039" : "\u203a";
      toggleButtonEl.setAttribute(
        "aria-label",
        state.collapsed ? "Expand question navigator" : "Collapse question navigator"
      );
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

    function renderQuestions(items, activeId) {
      const nextItems = Array.isArray(items) ? items.slice() : [];
      const nextSignature = buildQuestionsSignature(nextItems);
      questionItems = nextItems;
      activeQuestionId = activeId || null;

      if (nextSignature === lastRenderSignature) {
        setActiveQuestion(activeQuestionId);
        return;
      }

      lastRenderSignature = nextSignature;
      listEl.textContent = "";

      if (!questionItems.length) {
        emptyEl.hidden = false;
        countEl.textContent = "0 questions";
        return;
      }

      emptyEl.hidden = true;
      countEl.textContent = questionItems.length + " question" + (questionItems.length === 1 ? "" : "s");

      questionItems.forEach((item) => {
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
        listEl.appendChild(buttonEl);
      });
    }

    function setActiveQuestion(questionId) {
      const nextActiveId = questionId || null;
      if (nextActiveId === activeQuestionId) {
        return;
      }

      activeQuestionId = nextActiveId;
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

    function onListClick(event) {
      const target = event.target.closest(".qnav-item");
      if (!target) {
        return;
      }

      const questionId = target.dataset.qnavQuestionId;
      if (!questionId || typeof config.onSelectQuestion !== "function") {
        return;
      }

      config.onSelectQuestion(questionId);
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
      collapsedTabEl.removeEventListener("click", onToggleClick);
      listEl.removeEventListener("click", onListClick);
      resizeHandleEl.removeEventListener("mousedown", onResizeStart);
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeEnd);
      panelEl.remove();
    }

    toggleButtonEl.addEventListener("click", onToggleClick);
    collapsedTabEl.addEventListener("click", onToggleClick);
    listEl.addEventListener("click", onListClick);
    resizeHandleEl.addEventListener("mousedown", onResizeStart);

    applyState();

    return {
      renderQuestions,
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
