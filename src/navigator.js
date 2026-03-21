(function initNavigatorModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const TOP_OFFSET = 96;
  const FLASH_CLASS = "qnav-flash";
  const FLASH_DURATION_MS = 1500;
  const FOLLOW_UP_CHECK_DELAY_MS = 360;

  function isWindowContainer(container) {
    return container === window;
  }

  function getScrollableOverflow(style) {
    return [style.overflowY, style.overflow].filter(Boolean).join(" ");
  }

  function isScrollableElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const overflow = getScrollableOverflow(style);
    const canScroll = /(auto|scroll|overlay)/.test(overflow);

    return canScroll && element.scrollHeight > element.clientHeight + 1;
  }

  function findScrollContainer(element) {
    let current = element ? element.parentElement : null;

    while (current) {
      if (isScrollableElement(current)) {
        return current;
      }

      current = current.parentElement;
    }

    if (document.scrollingElement instanceof HTMLElement) {
      return document.scrollingElement;
    }

    return window;
  }

  function getContainerRect(container) {
    if (isWindowContainer(container)) {
      return {
        top: 0,
        bottom: window.innerHeight
      };
    }

    return container.getBoundingClientRect();
  }

  function getContainerScrollTop(container) {
    return isWindowContainer(container) ? window.scrollY : container.scrollTop;
  }

  function setContainerScrollTop(container, top, behavior) {
    const nextTop = Math.max(0, top);

    if (isWindowContainer(container)) {
      window.scrollTo({
        top: nextTop,
        behavior: behavior || "auto"
      });
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: nextTop,
        behavior: behavior || "auto"
      });
      return;
    }

    container.scrollTop = nextTop;
  }

  function getRelativeTopWithinContainer(element, container) {
    const elementRect = element.getBoundingClientRect();

    if (isWindowContainer(container)) {
      return window.scrollY + elementRect.top;
    }

    const containerRect = getContainerRect(container);
    return getContainerScrollTop(container) + (elementRect.top - containerRect.top);
  }

  function isElementVisibleWithinContainer(element, container, offset) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const effectiveOffset = typeof offset === "number" ? offset : 0;

    if (isWindowContainer(container)) {
      const topBoundary = effectiveOffset;
      const bottomBoundary = window.innerHeight;
      return rect.bottom > topBoundary && rect.top < bottomBoundary;
    }

    const containerRect = getContainerRect(container);
    const topBoundary = containerRect.top + effectiveOffset;
    const bottomBoundary = containerRect.bottom;
    return rect.bottom > topBoundary && rect.top < bottomBoundary;
  }

  function scrollElementIntoViewWithOffset(element, container, offset, behavior) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const effectiveBehavior = behavior || "smooth";

    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({
        block: "start",
        inline: "nearest",
        behavior: effectiveBehavior
      });
    }

    window.requestAnimationFrame(() => {
      const targetTop = getRelativeTopWithinContainer(element, container) - offset;
      setContainerScrollTop(container, targetTop, effectiveBehavior);
    });
  }

  function ensureElementVisible(element, container, offset) {
    if (isElementVisibleWithinContainer(element, container, offset)) {
      return;
    }

    const targetTop = getRelativeTopWithinContainer(element, container) - offset;
    setContainerScrollTop(container, targetTop, "auto");
  }

  function scheduleVisibilityCheck(element, container, offset) {
    window.requestAnimationFrame(() => {
      ensureElementVisible(element, container, offset);
    });

    window.setTimeout(() => {
      ensureElementVisible(element, container, offset);
    }, FOLLOW_UP_CHECK_DELAY_MS);
  }

  function scrollToQuestion(questionItem) {
    if (!questionItem || !questionItem.messageEl) {
      return;
    }

    const container = findScrollContainer(questionItem.messageEl);
    scrollElementIntoViewWithOffset(questionItem.messageEl, container, TOP_OFFSET, "smooth");
    scheduleVisibilityCheck(questionItem.messageEl, container, TOP_OFFSET);

    flashElement(questionItem.messageEl);
    if (questionItem.answerEl) {
      flashElement(questionItem.answerEl);
    }
  }

  function flashElement(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.classList.add(FLASH_CLASS);
    window.clearTimeout(element.__qnavFlashTimer);
    element.__qnavFlashTimer = window.setTimeout(() => {
      element.classList.remove(FLASH_CLASS);
    }, FLASH_DURATION_MS);
  }

  root.navigator = {
    TOP_OFFSET,
    findScrollContainer,
    isElementVisibleWithinContainer,
    scrollElementIntoViewWithOffset,
    scrollToQuestion
  };
}());
