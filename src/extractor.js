(function initExtractorModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const ATTR_QNAV_ID = "data-qnav-id";
  const CHATGPT_ROLE_SELECTOR = "[data-message-author-role]";
  const CHATGPT_TURN_SELECTOR = [
    ":is(article, section)[data-testid^='conversation-turn-']",
    "article[data-message-id]",
    "section[data-message-id]"
  ].join(", ");
  const TITLE_LIMIT = 72;
  const GEMINI_MESSAGE_SELECTOR = "user-query, model-response";

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeMultilineText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getChatGPTTurnNodes() {
    return Array.from(document.querySelectorAll(CHATGPT_TURN_SELECTOR)).filter((node) => {
      return node instanceof HTMLElement;
    });
  }

  function getChatGPTRoleNodes() {
    const roleNodesFromTurns = getChatGPTTurnNodes().map((turnEl) => {
      if (turnEl.matches(CHATGPT_ROLE_SELECTOR)) {
        return turnEl;
      }

      return turnEl.querySelector(CHATGPT_ROLE_SELECTOR);
    }).filter((node) => {
      return node instanceof HTMLElement;
    });

    const roleNodes = roleNodesFromTurns.length
      ? roleNodesFromTurns
      : Array.from(document.querySelectorAll(CHATGPT_ROLE_SELECTOR));

    return roleNodes.filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      const role = node.getAttribute("data-message-author-role");
      return role === "user" || role === "assistant";
    });
  }

  function getChatGPTDisplayBlock(roleEl) {
    return roleEl.closest(CHATGPT_TURN_SELECTOR) ||
      roleEl.closest("article") ||
      roleEl.closest("section") ||
      roleEl.parentElement ||
      roleEl;
  }

  function getElementText(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return normalizeText(element.innerText || element.textContent);
  }

  function getElementMultilineText(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return normalizeMultilineText(element.innerText || element.textContent);
  }

  function getElementHtml(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return String(element.innerHTML || "").trim();
  }

  function getFirstMatchingText(rootEl, selectors) {
    const selectorList = Array.isArray(selectors) ? selectors : [];
    for (let index = 0; index < selectorList.length; index += 1) {
      const selector = selectorList[index];
      if (!selector) {
        continue;
      }

      const match = rootEl.matches(selector) ? rootEl : rootEl.querySelector(selector);
      const text = getElementText(match);
      if (text) {
        return text;
      }
    }

    return getElementText(rootEl);
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

  function getChatGPTObservationRoot() {
    const firstTurnNode = document.querySelector(CHATGPT_TURN_SELECTOR);
    if (firstTurnNode instanceof HTMLElement) {
      return firstTurnNode.closest("main") ||
        firstTurnNode.closest("[role='main']") ||
        document.body;
    }

    const firstRoleNode = document.querySelector(CHATGPT_ROLE_SELECTOR);
    if (firstRoleNode instanceof HTMLElement) {
      return firstRoleNode.closest("main") ||
        firstRoleNode.closest("[role='main']") ||
        document.body;
    }

    return document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;
  }

  function createChatGPTConversationAdapter() {
    return {
      id: "chatgpt",
      isSupportedPage() {
        return getChatGPTRoleNodes().length > 0;
      },
      getOrderedMessages() {
        return getChatGPTRoleNodes();
      },
      getMessageRole(roleEl) {
        return roleEl.getAttribute("data-message-author-role");
      },
      getDisplayBlock(roleEl) {
        return getChatGPTDisplayBlock(roleEl);
      },
      getMessageText(roleEl) {
        return getElementText(roleEl);
      },
      getObservationRoot() {
        return getChatGPTObservationRoot();
      }
    };
  }

  function getGeminiConversationRoot() {
    return document.querySelector("chat-window-content > div.chat-history-scroll-container") ||
      document.querySelector("chat-window-content") ||
      document.querySelector(".chat-history-scroll-container") ||
      document.querySelector("main") ||
      document.body;
  }

  function getGeminiMessageNodes() {
    // Query from the chat history container or document body to get all messages
    const root = getGeminiConversationRoot();
    if (!(root instanceof Element)) {
      return [];
    }

    return Array.from(root.querySelectorAll(GEMINI_MESSAGE_SELECTOR)).filter((node) => {
      return node instanceof HTMLElement && !node.closest("immersive-panel");
    });
  }

  function getGeminiDisplayBlock(roleEl) {
    return roleEl.closest("user-query") ||
      roleEl.closest("model-response") ||
      roleEl.closest(".model-response-container") ||
      roleEl.closest(".response-container") ||
      roleEl;
  }

  function createGeminiConversationAdapter() {
    return {
      id: "gemini",
      isSupportedPage() {
        if (document.querySelector("immersive-panel")) {
          return false;
        }

        return getGeminiMessageNodes().length > 0;
      },
      getOrderedMessages() {
        return getGeminiMessageNodes();
      },
      getMessageRole(roleEl) {
        const tagName = roleEl.tagName.toLowerCase();
        if (tagName === "user-query") {
          return "user";
        }

        if (tagName === "model-response") {
          return "assistant";
        }

        if (roleEl.classList.contains("user-query")) {
          return "user";
        }

        if (roleEl.classList.contains("model-response")) {
          return "assistant";
        }

        return "";
      },
      getDisplayBlock(roleEl) {
        return getGeminiDisplayBlock(roleEl);
      },
      getMessageText(roleEl) {
        return getFirstMatchingText(roleEl, [
          ".query-text",
          ".user-query-bubble-with-background",
          "user-query-content",
          ".query-container"
        ]);
      },
      getObservationRoot() {
        return getGeminiConversationRoot();
      }
    };
  }

  function resolveConversationAdapter() {
    const hostname = window.location.hostname;
    if (hostname === "chatgpt.com" || hostname === "chat.openai.com") {
      return createChatGPTConversationAdapter();
    }

    if (hostname === "gemini.google.com") {
      return createGeminiConversationAdapter();
    }

    return null;
  }

  function isConversationSupported(adapter) {
    return Boolean(adapter && typeof adapter.isSupportedPage === "function" && adapter.isSupportedPage());
  }

  function extractQuestions(adapter) {
    const effectiveAdapter = adapter || resolveConversationAdapter();
    if (!isConversationSupported(effectiveAdapter)) {
      return [];
    }

    const orderedMessages = typeof effectiveAdapter.getOrderedMessages === "function"
      ? effectiveAdapter.getOrderedMessages()
      : [];
    const items = [];

    orderedMessages.forEach((roleEl) => {
      const role = typeof effectiveAdapter.getMessageRole === "function"
        ? effectiveAdapter.getMessageRole(roleEl)
        : "";

      if (role === "user") {
        const text = typeof effectiveAdapter.getMessageText === "function"
          ? effectiveAdapter.getMessageText(roleEl)
          : getElementText(roleEl);
        if (!text) {
          return;
        }

        const messageEl = typeof effectiveAdapter.getDisplayBlock === "function"
          ? effectiveAdapter.getDisplayBlock(roleEl)
          : roleEl;
        const questionIndex = items.length;
        const id = getOrAssignAnchorId(messageEl, questionIndex);

        items.push({
          id,
          index: questionIndex + 1,
          text,
          questionText: getElementMultilineText(messageEl || roleEl) || text,
          shortTitle: buildShortTitle(text),
          questionHtml: getElementHtml(messageEl || roleEl),
          messageEl,
          answerEl: undefined
        });
        return;
      }

      if (role === "assistant" && items.length) {
        const lastQuestion = items[items.length - 1];
        if (!lastQuestion.answerEl) {
          const answerEl = typeof effectiveAdapter.getDisplayBlock === "function"
            ? effectiveAdapter.getDisplayBlock(roleEl)
            : roleEl;
          lastQuestion.answerEl = answerEl;
          lastQuestion.answerText = getElementMultilineText(answerEl || roleEl);
          lastQuestion.answerHtml = getElementHtml(answerEl || roleEl);
        }
      }
    });

    return items;
  }

  function getObservationRoot(adapter) {
    const effectiveAdapter = adapter || resolveConversationAdapter();
    if (effectiveAdapter && typeof effectiveAdapter.getObservationRoot === "function") {
      return effectiveAdapter.getObservationRoot() || document.body;
    }

    return document.body;
  }

  root.extractor = {
    ATTR_QNAV_ID,
    isConversationSupported,
    resolveConversationAdapter,
    extractQuestions,
    getObservationRoot
  };
}());
