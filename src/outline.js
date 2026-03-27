(function initOutlineModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const navigator = root.navigator;
  const i18n = root.i18n;
  const MANAGED_ATTR = root.virtualizer ? root.virtualizer.MANAGED_ATTR : "data-qnav-managed";
  const MANAGED_VALUE = root.virtualizer ? root.virtualizer.MANAGED_VALUE : "true";
  const OUTLINE_ID_ATTR = "data-qnav-outline-id";
  const MIN_HEADINGS = 2;
  const COMPACT_BREAKPOINT = 1480;
  const MIN_ANSWER_WIDTH = 840;
  const OUTLINE_BOTTOM_MARGIN = 16;
  const OUTLINE_EXTRA_HEIGHT = 250;

  function t(key, params) {
    return i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;
  }

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

  function isVisibleHeading(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    // Check if heading is inside a virtualizer-managed collapsed element
    // In that case, getClientRects() returns 0 but the heading is still valid
    const collapsedParent = element.closest("[data-qnav-collapsed]");
    if (collapsedParent) {
      // Heading is inside a managed element, trust the content
      return true;
    }

    return element.getClientRects().length > 0;
  }

  function getHeadingLevel(element) {
    const match = element && element.tagName ? element.tagName.match(/^H([1-4])$/i) : null;
    return match ? Number(match[1]) : 4;
  }

  function flashHeading(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.classList.add("qnav-flash");
    window.clearTimeout(element.__qnavOutlineFlashTimer);
    element.__qnavOutlineFlashTimer = window.setTimeout(() => {
      element.classList.remove("qnav-flash");
    }, 1500);
  }

  function isGeminiPlatform() {
    return window.location.hostname === "gemini.google.com";
  }

  function createAnswerOutline(options) {
    const config = options || {};
    let currentAnswerEl = null;
    let wrapperEl = null;
    let railEl = null;
    let toggleButtonEl = null;
    let panelEl = null;
    let items = [];
    let activeHeadingId = null;
    let scrollContainer = null;
    let scrollTarget = null;
    let scrollFrameId = null;
    let resizeFrameId = null;
    let compactMode = false;
    let compactExpanded = false;
    const isGemini = isGeminiPlatform();

    function clearScrollListener() {
      if (scrollTarget && typeof scrollTarget.removeEventListener === "function") {
        scrollTarget.removeEventListener("scroll", scheduleActiveHeadingUpdate);
      }

      scrollTarget = null;
      scrollContainer = null;
    }

    function setCompactExpanded(expanded) {
      compactExpanded = Boolean(expanded);
      if (wrapperEl) {
        wrapperEl.dataset.outlineExpanded = compactExpanded ? "true" : "false";
      }
      if (isGemini && railEl) {
        railEl.dataset.outlineExpanded = compactExpanded ? "true" : "false";
      }
    }

    function removeManagedNodes() {
      if (railEl) {
        railEl.remove();
      }
      if (toggleButtonEl) {
        toggleButtonEl.remove();
      }
      if (panelEl) {
        panelEl.remove();
      }

      railEl = null;
      toggleButtonEl = null;
      panelEl = null;
    }

    function detachWrapper() {
      clearScrollListener();
      if (scrollFrameId !== null) {
        window.cancelAnimationFrame(scrollFrameId);
        scrollFrameId = null;
      }
      if (resizeFrameId !== null) {
        window.cancelAnimationFrame(resizeFrameId);
        resizeFrameId = null;
      }

      window.removeEventListener("resize", scheduleLayoutRefresh);
      removeManagedNodes();

      if (wrapperEl && currentAnswerEl && wrapperEl.parentNode) {
        wrapperEl.replaceWith(currentAnswerEl);
      }

      wrapperEl = null;
      currentAnswerEl = null;
      items = [];
      activeHeadingId = null;
      compactMode = false;
      compactExpanded = false;
    }

    function reset() {
      detachWrapper();
    }

    function buildOutlineItems(answerEl) {
      const headings = Array.from(answerEl.querySelectorAll("h1, h2, h3, h4"));
      const outlineItems = [];
      let previousText = "";

      headings.forEach((headingEl, index) => {
        if (!isVisibleHeading(headingEl)) {
          return;
        }

        const text = normalizeText(headingEl.textContent);
        if (!text) {
          return;
        }

        if (text === previousText) {
          return;
        }

        previousText = text;
        const headingId = [
          "qnav-outline",
          index,
          text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "section"
        ].join("-");

        headingEl.setAttribute(OUTLINE_ID_ATTR, headingId);
        outlineItems.push({
          id: headingId,
          index: outlineItems.length,
          text,
          shortText: truncateText(text, 72),
          level: getHeadingLevel(headingEl),
          element: headingEl
        });
      });

      return outlineItems;
    }

    function updateCompactMode() {
      if (!currentAnswerEl) {
        return;
      }

      // Gemini: use fixed positioning, no need for compact mode based on answer width
      // Only switch to compact mode on very narrow screens
      if (isGemini) {
        compactMode = window.innerWidth < COMPACT_BREAKPOINT;
        if (railEl) {
          railEl.dataset.outlineCompact = compactMode ? "true" : "false";
        }
        if (toggleButtonEl) {
          toggleButtonEl.dataset.outlineCompact = compactMode ? "true" : "false";
        }
        if (panelEl) {
          panelEl.dataset.outlineCompact = compactMode ? "true" : "false";
        }
        if (!compactMode) {
          setCompactExpanded(false);
        }
        return;
      }

      const answerWidth = currentAnswerEl.getBoundingClientRect().width;
      compactMode = window.innerWidth < COMPACT_BREAKPOINT || answerWidth < MIN_ANSWER_WIDTH;

      if (wrapperEl) {
        wrapperEl.dataset.outlineCompact = compactMode ? "true" : "false";
      }
      if (!compactMode) {
        setCompactExpanded(false);
      }
    }

    function updateRailHeight() {
      if (!railEl) {
        return;
      }

      const topOffset = getTopThreshold();
      const threadBottomEl = document.getElementById("thread-bottom");
      let maxHeight = window.innerHeight - topOffset - OUTLINE_BOTTOM_MARGIN + OUTLINE_EXTRA_HEIGHT;

      if (threadBottomEl instanceof HTMLElement) {
        const threadBottomRect = threadBottomEl.getBoundingClientRect();
        if (threadBottomRect.top > 0) {
          maxHeight = Math.min(
            maxHeight,
            threadBottomRect.top - topOffset - OUTLINE_BOTTOM_MARGIN + OUTLINE_EXTRA_HEIGHT
          );
        }
      }

      railEl.style.setProperty("--qnav-outline-max-height", Math.max(180, Math.round(maxHeight)) + "px");

      // Gemini: position outline to the left of the answer element
      if (isGemini && currentAnswerEl) {
        const answerRect = currentAnswerEl.getBoundingClientRect();
        const outlineWidth = 196;
        const gap = 16;
        const leftPos = answerRect.left - outlineWidth - gap;

        if (leftPos > 0) {
          railEl.style.left = leftPos + "px";
          if (toggleButtonEl) toggleButtonEl.style.left = leftPos + "px";
          if (panelEl) panelEl.style.left = leftPos + "px";
        }
      }
    }

    function createListElement() {
      const listEl = document.createElement("div");
      listEl.className = "qnav-outline-list";
      listEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);

      items.forEach((item) => {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.className = "qnav-outline-item";
        buttonEl.dataset.qnavOutlineId = item.id;
        buttonEl.dataset.level = String(item.level);
        buttonEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
        buttonEl.textContent = item.shortText;
        buttonEl.title = item.text;
        buttonEl.addEventListener("click", () => {
          scrollToHeading(item.id);
        });
        listEl.appendChild(buttonEl);
      });

      return listEl;
    }

    function renderOutlineChrome() {
      removeManagedNodes();

      if (items.length < MIN_HEADINGS) {
        return;
      }

      railEl = document.createElement("aside");
      railEl.className = "qnav-outline-rail";
      railEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);

      const railTitleEl = document.createElement("div");
      railTitleEl.className = "qnav-outline-title";
      railTitleEl.textContent = t("outline.title");
      railEl.appendChild(railTitleEl);
      railEl.appendChild(createListElement());

      toggleButtonEl = document.createElement("button");
      toggleButtonEl.type = "button";
      toggleButtonEl.className = "qnav-outline-toggle";
      toggleButtonEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
      toggleButtonEl.textContent = t("outline.title");
      toggleButtonEl.addEventListener("click", () => {
        setCompactExpanded(!compactExpanded);
      });

      panelEl = document.createElement("div");
      panelEl.className = "qnav-outline-panel";
      panelEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);

      const panelTitleEl = document.createElement("div");
      panelTitleEl.className = "qnav-outline-title";
      panelTitleEl.textContent = t("outline.title");
      panelEl.appendChild(panelTitleEl);
      panelEl.appendChild(createListElement());

      if (isGemini && currentAnswerEl) {
        // Gemini: insert rail directly to body to avoid transform/filter issues
        railEl.classList.add("qnav-outline-gemini");
        toggleButtonEl.classList.add("qnav-outline-gemini");
        panelEl.classList.add("qnav-outline-gemini");

        document.body.appendChild(railEl);
        document.body.appendChild(toggleButtonEl);
        document.body.appendChild(panelEl);
      } else if (wrapperEl) {
        // Standard mode: insert into wrapper
        wrapperEl.insertBefore(railEl, currentAnswerEl);
        wrapperEl.insertBefore(toggleButtonEl, currentAnswerEl);
        wrapperEl.insertBefore(panelEl, currentAnswerEl);
      }

      updateCompactMode();
      updateRailHeight();
      applyActiveHeading();
    }

    function getTopThreshold() {
      return (navigator ? navigator.TOP_OFFSET : 96) + 24;
    }

    function computeActiveHeadingId() {
      if (!items.length) {
        return null;
      }

      const threshold = getTopThreshold();
      let nextActiveItem = items[0];

      items.forEach((item) => {
        const headingEl = item.element;
        if (!(headingEl instanceof HTMLElement)) {
          return;
        }

        const rect = headingEl.getBoundingClientRect();
        if (rect.top <= threshold) {
          nextActiveItem = item;
        }
      });

      return nextActiveItem ? nextActiveItem.id : null;
    }

    function applyActiveHeading() {
      const scopeEl = wrapperEl || railEl;
      if (!scopeEl) {
        return;
      }

      scopeEl.querySelectorAll(".qnav-outline-item").forEach((itemEl) => {
        const isActive = itemEl.dataset.qnavOutlineId === activeHeadingId;
        itemEl.classList.toggle("is-active", isActive);
      });
    }

    function updateActiveHeading() {
      scrollFrameId = null;
      const nextActiveHeadingId = computeActiveHeadingId();
      if (nextActiveHeadingId === activeHeadingId) {
        return;
      }

      activeHeadingId = nextActiveHeadingId;
      applyActiveHeading();
      if (typeof config.onActiveHeadingChange === "function") {
        config.onActiveHeadingChange(activeHeadingId);
      }
    }

    function scheduleActiveHeadingUpdate() {
      if (scrollFrameId !== null) {
        return;
      }

      scrollFrameId = window.requestAnimationFrame(updateActiveHeading);
    }

    function scheduleLayoutRefresh() {
      if (resizeFrameId !== null) {
        return;
      }

      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = null;
        updateCompactMode();
        updateRailHeight();
        scheduleActiveHeadingUpdate();
      });
    }

    function bindScrollTracking() {
      clearScrollListener();
      scrollContainer = navigator && currentAnswerEl
        ? navigator.findScrollContainer(currentAnswerEl)
        : window;
      scrollTarget = scrollContainer === window ? window : scrollContainer;
      if (scrollTarget && typeof scrollTarget.addEventListener === "function") {
        scrollTarget.addEventListener("scroll", scheduleActiveHeadingUpdate, { passive: true });
      }

      window.addEventListener("resize", scheduleLayoutRefresh);
      updateRailHeight();
      scheduleActiveHeadingUpdate();
    }

    function scrollToHeading(headingId) {
      const targetItem = items.find((item) => item.id === headingId);
      if (!targetItem || !(targetItem.element instanceof HTMLElement) || !navigator) {
        return;
      }

      const container = scrollContainer || navigator.findScrollContainer(targetItem.element);
      navigator.scrollElementIntoViewWithOffset(targetItem.element, container, getTopThreshold(), "auto");
      flashHeading(targetItem.element);
      activeHeadingId = headingId;
      applyActiveHeading();
      if (compactMode) {
        setCompactExpanded(false);
      }
    }

    function applyAnswer(answerEl) {
      const nextAnswerEl = answerEl instanceof HTMLElement ? answerEl : null;
      if (!nextAnswerEl || !nextAnswerEl.isConnected) {
        reset();
        return [];
      }

      const nextItems = buildOutlineItems(nextAnswerEl);
      if (nextItems.length < MIN_HEADINGS) {
        reset();
        return [];
      }

      if (currentAnswerEl && currentAnswerEl !== nextAnswerEl) {
        detachWrapper();
      }

      currentAnswerEl = nextAnswerEl;
      items = nextItems;

      // Gemini: don't create wrapper, insert rail as sibling
      if (isGemini) {
        renderOutlineChrome();
        bindScrollTracking();
        return items.slice();
      }

      if (!wrapperEl) {
        wrapperEl = document.createElement("div");
        wrapperEl.className = "qnav-outline-wrap";
        wrapperEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
        currentAnswerEl.replaceWith(wrapperEl);
        wrapperEl.appendChild(currentAnswerEl);
      }

      renderOutlineChrome();
      bindScrollTracking();
      return items.slice();
    }

    return {
      applyAnswer,
      getItems() {
        return items.slice();
      },
      refreshLayout() {
        if (!wrapperEl && !railEl) {
          return;
        }

        scheduleLayoutRefresh();
      },
      reset,
      setLanguage() {
        if (!wrapperEl && !railEl) {
          return;
        }

        renderOutlineChrome();
      },
      setActiveHeading(headingId) {
        activeHeadingId = headingId || null;
        applyActiveHeading();
      }
    };
  }

  root.outline = {
    createAnswerOutline
  };
}());
