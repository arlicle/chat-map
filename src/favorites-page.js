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

  function normalizeMultilineText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stripSpeakerPrefix(text) {
    return String(text || "")
      .replace(/^\s*(?:你说|你|ChatGPT说|ChatGPT 说|ChatGPT|Gemini说|Gemini 说|Gemini)\s*[:：]\s*/i, "")
      .trimStart();
  }

  function normalizeCodeText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/\s+$/g, "")
      .trim();
  }

  function extractTextWithLineBreaks(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return "";
    }

    clone.querySelectorAll("br").forEach((brEl) => {
      brEl.replaceWith("\n");
    });

    return String(clone.textContent || "");
  }

  function normalizeLanguageToken(language) {
    const token = normalizeText(language).toLowerCase();
    if (!token) {
      return "";
    }

    const aliases = {
      "shell": "bash",
      "sh": "bash",
      "zsh": "bash",
      "console": "bash",
      "node": "javascript",
      "ts": "typescript",
      "js": "javascript",
      "py": "python",
      "yml": "yaml",
      "md": "markdown",
      "plaintext": "plaintext",
      "plain text": "plaintext",
      "text": "plaintext"
    };

    return aliases[token] || token;
  }

  function extractCodeLanguage(preEl) {
    if (!(preEl instanceof HTMLElement)) {
      return "";
    }

    const directLang = preEl.getAttribute("data-language") || preEl.getAttribute("data-lang");
    if (directLang) {
      return normalizeText(directLang);
    }

    const classLang = Array.from(preEl.classList || []).find((token) => token.indexOf("language-") === 0);
    if (classLang) {
      return normalizeText(classLang.slice("language-".length));
    }

    const headerCandidate = preEl.querySelector("[class*='font-medium'], [class*='language'], [data-language-label]");
    if (headerCandidate instanceof HTMLElement) {
      const text = normalizeText(headerCandidate.innerText || headerCandidate.textContent || "");
      if (text && text.length <= 24) {
        return text;
      }
    }

    return "";
  }

  function replaceRichPreBlocks(container) {
    if (!(container instanceof DocumentFragment || container instanceof HTMLElement)) {
      return;
    }

    Array.from(container.querySelectorAll("pre")).forEach((preEl) => {
      const sourceEl = preEl.querySelector(".cm-content, code") || preEl;
      const codeText = normalizeCodeText(extractTextWithLineBreaks(sourceEl));
      if (!codeText) {
        return;
      }

      const language = normalizeLanguageToken(extractCodeLanguage(preEl));
      const figureEl = document.createElement("figure");
      figureEl.className = "favorites-code-block";

      const headerEl = document.createElement("div");
      headerEl.className = "favorites-code-header";

      const captionEl = document.createElement("figcaption");
      captionEl.className = "favorites-code-language";
      captionEl.textContent = language || "";
      if (!language) {
        captionEl.classList.add("is-empty");
      }
      headerEl.appendChild(captionEl);

      const copyButtonEl = document.createElement("button");
      copyButtonEl.type = "button";
      copyButtonEl.className = "favorites-code-copy";
      copyButtonEl.setAttribute("data-action", "copy-code");
      copyButtonEl.textContent = "复制";
      headerEl.appendChild(copyButtonEl);

      figureEl.appendChild(headerEl);

      const nextPreEl = document.createElement("pre");
      nextPreEl.className = "favorites-code-pre";

      const codeEl = document.createElement("code");
      codeEl.className = "favorites-code";
      if (language) {
        codeEl.dataset.lang = language;
      }
      codeEl.textContent = codeText;
      nextPreEl.appendChild(codeEl);
      figureEl.appendChild(nextPreEl);

      preEl.replaceWith(figureEl);
    });
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value) {
      return false;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_error) {
      }
    }

    try {
      const textareaEl = document.createElement("textarea");
      textareaEl.value = value;
      textareaEl.setAttribute("readonly", "readonly");
      textareaEl.style.position = "fixed";
      textareaEl.style.opacity = "0";
      textareaEl.style.pointerEvents = "none";
      document.body.appendChild(textareaEl);
      textareaEl.select();
      const copied = document.execCommand("copy");
      textareaEl.remove();
      return !!copied;
    } catch (_error) {
      return false;
    }
  }

  function sanitizeFavoriteHtml(rawHtml) {
    const source = String(rawHtml || "").trim();
    if (!source) {
      return "";
    }

    const template = document.createElement("template");
    template.innerHTML = source;

    template.content.querySelectorAll("script, style, iframe, object, embed, link, meta, textarea, input, select, button").forEach((node) => {
      node.remove();
    });

    template.content.querySelectorAll(
      ".sr-only, [class*='sr-only'], .visually-hidden, [class*='visually-hidden'], [class*='screen-reader']"
    ).forEach((node) => {
      node.remove();
    });

    const allowedAttributes = new Set([
      "class", "href", "title", "target", "rel", "colspan", "rowspan", "scope", "lang", "dir", "aria-label"
    ]);

    template.content.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value || "";
        if (name.startsWith("on") || name === "style") {
          element.removeAttribute(attribute.name);
          return;
        }

        if (!allowedAttributes.has(name) && !name.startsWith("data-")) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (name === "href" && /^javascript:/i.test(value.trim())) {
          element.removeAttribute(attribute.name);
        }
      });

      if (element.tagName.toLowerCase() === "a") {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    });

    replaceRichPreBlocks(template.content);

    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const originalText = node.textContent || "";
      if (originalText.trim()) {
        node.textContent = stripSpeakerPrefix(originalText);
        break;
      }
      node = walker.nextNode();
    }

    return template.innerHTML.trim();
  }

  function applyCodeHighlighting(scopeEl) {
    if (!(scopeEl instanceof HTMLElement) || !window.hljs) {
      return;
    }

    scopeEl.querySelectorAll(".favorites-code").forEach((codeEl) => {
      if (!(codeEl instanceof HTMLElement)) {
        return;
      }

      const rawCode = codeEl.textContent || "";
      if (!rawCode.trim()) {
        return;
      }

      const preferredLanguage = normalizeLanguageToken(codeEl.dataset.lang || "");
      let highlighted = "";
      let resolvedLanguage = "";

      try {
        if (preferredLanguage && typeof window.hljs.getLanguage === "function" && window.hljs.getLanguage(preferredLanguage)) {
          highlighted = window.hljs.highlight(rawCode, { language: preferredLanguage, ignoreIllegals: true }).value;
          resolvedLanguage = preferredLanguage;
        } else {
          const autoResult = window.hljs.highlightAuto(rawCode);
          highlighted = autoResult.value;
          resolvedLanguage = autoResult.language || "";
        }
      } catch (error) {
        return;
      }

      codeEl.innerHTML = highlighted;
      codeEl.classList.add("hljs");
      if (resolvedLanguage) {
        codeEl.classList.add("language-" + resolvedLanguage);
      }
    });
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

    const questionBubble = escapeHtml(stripSpeakerPrefix(normalizeMultilineText(favorite.questionText || "暂无问题"))).replace(/\n/g, "<br>");

    detailEl.innerHTML = [
      "<div class='favorites-detail-meta'>",
      "  <div class='favorites-detail-meta-copy'>",
      "    <p class='favorites-detail-kicker'>收藏于 " + escapeHtml(formatDate(favorite.createdAt)) + "</p>",
      "    <h2 class='favorites-detail-title'>" + escapeHtml(favorite.conversationTitle || "未命名会话") + "</h2>",
      "  </div>",
      "  <div class='favorites-detail-actions'>",
      favorite.conversationUrl
        ? "    <button class='favorites-button' data-action='open-source'>打开原会话</button>"
        : "",
      "    <button class='favorites-button is-danger' data-action='remove'>取消收藏</button>",
      "  </div>",
      "</div>",
      "<div class='favorites-chat-thread'>",
      "  <div class='favorites-user-row'>",
      "    <div class='favorites-user-bubble'>" + questionBubble + "</div>",
      "  </div>",
      "  <article class='favorites-assistant-card favorites-rendered'>" + renderFavoriteContent(favorite.answerHtml, favorite.answerText || "暂无回答") + "</article>",
      "</div>",
      "<section class='favorites-note-editor'>",
      "  <p class='favorites-block-label'>备注</p>",
      "  <textarea class='favorites-note-input' placeholder='写一点这条内容为什么值得保存'>" + escapeHtml(favorite.note) + "</textarea>",
      "  <div class='favorites-note-actions'>",
      "    <button class='favorites-button is-primary' data-action='save-note'>保存备注</button>",
      "  </div>",
      "</section>"
    ].join("");

    applyCodeHighlighting(detailEl);

    detailEl.querySelectorAll("[data-action='copy-code']").forEach((copyButtonEl) => {
      if (!(copyButtonEl instanceof HTMLButtonElement)) {
        return;
      }

      copyButtonEl.addEventListener("click", async () => {
        const codeEl = copyButtonEl.closest(".favorites-code-block")?.querySelector(".favorites-code");
        const codeText = codeEl instanceof HTMLElement ? codeEl.innerText || codeEl.textContent || "" : "";
        const copied = await copyTextToClipboard(codeText);
        copyButtonEl.textContent = copied ? "已复制" : "复制失败";
        copyButtonEl.classList.toggle("is-copied", copied);
        copyButtonEl.classList.toggle("is-error", !copied);

        window.setTimeout(() => {
          copyButtonEl.textContent = "复制";
          copyButtonEl.classList.remove("is-copied", "is-error");
        }, 1200);
      });
    });

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

  function renderFavoriteContent(rawHtml, fallbackText) {
    const safeHtml = sanitizeFavoriteHtml(rawHtml);
    if (safeHtml) {
      return safeHtml;
    }

    return renderRichText(stripSpeakerPrefix(fallbackText));
  }

  function splitLongParagraph(line) {
    const trimmedLine = String(line || "").trim();
    if (trimmedLine.length < 180) {
      return [trimmedLine];
    }

    const sentenceParts = trimmedLine.split(/(?<=[。！？!?\.])\s+/).filter(Boolean);
    if (sentenceParts.length < 3) {
      return [trimmedLine];
    }

    const chunks = [];
    let currentChunk = "";
    sentenceParts.forEach((sentence) => {
      if (!currentChunk) {
        currentChunk = sentence;
        return;
      }

      if ((currentChunk + " " + sentence).length > 180) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk += " " + sentence;
      }
    });

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  function renderRichText(text) {
    const source = normalizeMultilineText(text);
    if (!source) {
      return "<p class='favorites-rich-paragraph'>暂无内容</p>";
    }

    let shaped = source;
    if (shaped.indexOf("\n") === -1 && shaped.length > 220) {
      shaped = shaped.replace(/([。！？!?])\s+/g, "$1\n");
    }

    const lines = shaped.split("\n");
    const html = [];
    let listItems = [];

    function flushListItems() {
      if (!listItems.length) {
        return;
      }

      html.push("<ul class='favorites-rich-list'>" + listItems.join("") + "</ul>");
      listItems = [];
    }

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        flushListItems();
        return;
      }

      const markdownHeadingMatch = trimmedLine.match(/^#{1,4}\s+(.+)$/);
      if (markdownHeadingMatch) {
        flushListItems();
        html.push("<h4 class='favorites-rich-heading'>" + escapeHtml(markdownHeadingMatch[1]) + "</h4>");
        return;
      }

      const listMatch = trimmedLine.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        listItems.push("<li class='favorites-rich-list-item'>" + escapeHtml(listMatch[1]) + "</li>");
        return;
      }

      flushListItems();
      splitLongParagraph(trimmedLine).forEach((paragraph) => {
        html.push("<p class='favorites-rich-paragraph'>" + escapeHtml(paragraph) + "</p>");
      });
    });

    flushListItems();
    return html.join("") || "<p class='favorites-rich-paragraph'>暂无内容</p>";
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
