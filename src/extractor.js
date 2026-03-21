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
      getUserMessages() {
        return getRoleNodes().filter((node) => node.getAttribute("data-message-author-role") === "user");
      },

      getAssistantAfter(userMessage) {
        const ordered = getRoleNodes();
        const startIndex = ordered.indexOf(userMessage);

        if (startIndex === -1) {
          return undefined;
        }

        for (let index = startIndex + 1; index < ordered.length; index += 1) {
          const candidate = ordered[index];
          if (candidate.getAttribute("data-message-author-role") === "assistant") {
            return candidate;
          }

          if (candidate.getAttribute("data-message-author-role") === "user") {
            return undefined;
          }
        }

        return undefined;
      }
    };
  }

  function extractQuestions(adapter) {
    const effectiveAdapter = adapter || createChatGPTWebAdapter();
    const userMessages = effectiveAdapter.getUserMessages();
    const items = [];

    userMessages.forEach((userRoleEl, index) => {
      const text = getMessageText(userRoleEl);
      if (!text) {
        return;
      }

      const messageEl = getDisplayBlock(userRoleEl);
      const assistantRoleEl = effectiveAdapter.getAssistantAfter(userRoleEl);
      const answerEl = assistantRoleEl ? getDisplayBlock(assistantRoleEl) : undefined;
      const id = getOrAssignAnchorId(messageEl, index);

      items.push({
        id,
        index: index + 1,
        text,
        shortTitle: buildShortTitle(text),
        messageEl,
        answerEl
      });
    });

    return items;
  }

  function getObservationRoot() {
    return document.body;
  }

  root.extractor = {
    ATTR_QNAV_ID,
    createChatGPTWebAdapter,
    extractQuestions,
    getObservationRoot
  };
}());
