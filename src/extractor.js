(function initExtractorModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const ATTR_QNAV_ID = "data-qnav-id";
  const ROLE_SELECTOR = "[data-message-author-role]";
  const TITLE_LIMIT = 72;

  function getRoleNodes() {
    return Array.from(document.querySelectorAll(ROLE_SELECTOR)).filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      const role = node.getAttribute("data-message-author-role");
      return role === "user" || role === "assistant";
    });
  }

  function getDisplayBlock(roleEl) {
    return roleEl.closest("article") ||
      roleEl.closest("[data-testid^='conversation-turn-']") ||
      roleEl.parentElement ||
      roleEl;
  }

  function getMessageText(roleEl) {
    return roleEl.innerText.replace(/\s+/g, " ").trim();
  }

  function buildShortTitle(text) {
    if (text.length <= TITLE_LIMIT) {
      return text;
    }

    return text.slice(0, TITLE_LIMIT - 1).trimEnd() + "\u2026";
  }

  function getOrAssignAnchorId(messageEl, index) {
    const existing = messageEl.getAttribute(ATTR_QNAV_ID);
    if (existing) {
      return existing;
    }

    const nextId = "qnav-" + String(index + 1);
    messageEl.setAttribute(ATTR_QNAV_ID, nextId);
    return nextId;
  }

  function createChatGPTWebAdapter() {
    return {
      getOrderedMessages() {
        return getRoleNodes();
      }
    };
  }

  function extractQuestions(adapter) {
    const effectiveAdapter = adapter || createChatGPTWebAdapter();
    const orderedMessages = typeof effectiveAdapter.getOrderedMessages === "function"
      ? effectiveAdapter.getOrderedMessages()
      : getRoleNodes();
    const items = [];

    orderedMessages.forEach((roleEl) => {
      const role = roleEl.getAttribute("data-message-author-role");

      if (role === "user") {
        const text = getMessageText(roleEl);
        if (!text) {
          return;
        }

        const messageEl = getDisplayBlock(roleEl);
        const questionIndex = items.length;
        const id = getOrAssignAnchorId(messageEl, questionIndex);

        items.push({
          id,
          index: questionIndex + 1,
          text,
          shortTitle: buildShortTitle(text),
          messageEl,
          answerEl: undefined
        });
        return;
      }

      if (role === "assistant" && items.length) {
        const lastQuestion = items[items.length - 1];
        if (!lastQuestion.answerEl) {
          lastQuestion.answerEl = getDisplayBlock(roleEl);
        }
      }
    });

    return items;
  }

  function getObservationRoot() {
    const firstRoleNode = document.querySelector(ROLE_SELECTOR);
    if (firstRoleNode instanceof HTMLElement) {
      return firstRoleNode.closest("main") ||
        firstRoleNode.closest("[role='main']") ||
        document.body;
    }

    return document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;
  }

  root.extractor = {
    ATTR_QNAV_ID,
    createChatGPTWebAdapter,
    extractQuestions,
    getObservationRoot
  };
}());
