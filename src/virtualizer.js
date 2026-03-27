(function initVirtualizerModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const MANAGED_ATTR = "data-qnav-managed";
  const MANAGED_VALUE = "true";
  const COLLAPSED_ATTR = "data-qnav-collapsed";
  const i18n = root.i18n;

  function t(key, params) {
    return i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;
  }

  function getManagedElements(question) {
    const elements = [];
    if (question && question.messageEl instanceof HTMLElement) {
      elements.push(question.messageEl);
    }

    if (question && question.answerEl instanceof HTMLElement && question.answerEl !== question.messageEl) {
      elements.push(question.answerEl);
    }

    return elements;
  }

  function getPrimaryContentElement(question) {
    if (question && question.answerEl instanceof HTMLElement) {
      return question.answerEl;
    }

    if (question && question.messageEl instanceof HTMLElement) {
      return question.messageEl;
    }

    return null;
  }

  function getElementText(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return normalizeText(element.innerText || element.textContent || "");
  }

  function getElementMultilineText(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return normalizeMultilineText(element.innerText || element.textContent || "");
  }

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

  function buildSearchText(questionText, answerText) {
    return [normalizeText(questionText), normalizeText(answerText)].filter(Boolean).join("\n");
  }

  function getElementHtml(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return String(element.innerHTML || "").trim();
  }

  function hydrateQuestion(question, fallbackQuestion) {
    if (!question && !fallbackQuestion) {
      return null;
    }

    const source = question || fallbackQuestion;
    const previous = fallbackQuestion || {};
    const nextQuestionText = normalizeMultilineText(
      source.questionText ||
      source.text ||
      previous.questionText ||
      previous.text ||
      ""
    );
    const nextAnswerText = normalizeMultilineText(
      source.answerText ||
      getElementMultilineText(source.answerEl) ||
      previous.answerText ||
      ""
    );
    const nextQuestionHtml = String(
      source.questionHtml ||
      getElementHtml(source.messageEl) ||
      previous.questionHtml ||
      ""
    ).trim();
    const nextAnswerHtml = String(
      source.answerHtml ||
      getElementHtml(source.answerEl) ||
      previous.answerHtml ||
      ""
    ).trim();

    return {
      id: source.id || previous.id,
      index: typeof previous.index === "number" ? previous.index : source.index,
      text: source.text || previous.text || normalizeText(nextQuestionText),
      questionText: nextQuestionText,
      answerText: nextAnswerText,
      questionHtml: nextQuestionHtml,
      answerHtml: nextAnswerHtml,
      searchText: buildSearchText(nextQuestionText, nextAnswerText),
      shortTitle: source.shortTitle || previous.shortTitle,
      messageEl: source.messageEl || previous.messageEl || null,
      answerEl: source.answerEl || previous.answerEl || null
    };
  }

  function setCollapsedState(element, collapsed) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    // Use inline style instead of hidden attribute for better compatibility
    // with custom elements like <user-query> and <model-response> in Gemini
    element.style.display = collapsed ? "none" : "";
    element.setAttribute(COLLAPSED_ATTR, collapsed ? "true" : "false");
  }

  function mergeQuestionData(previousQuestion, nextQuestion) {
    if (!previousQuestion) {
      return hydrateQuestion(nextQuestion);
    }

    if (!nextQuestion) {
      return hydrateQuestion(previousQuestion);
    }

    return hydrateQuestion(nextQuestion, previousQuestion);
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

  function buildQuestionPreview(question) {
    return truncateText(question && (question.questionText || question.text), 108);
  }

  function buildAnswerPreview(question) {
    const answerText = normalizeText(question && question.answerText);

    if (!answerText) {
      return t("common.noAnswer");
    }

    return truncateText(answerText, 96);
  }

  function createConversationVirtualizer(options) {
    const config = options || {};
    let orderedQuestions = [];
    let questionsById = new Map();
    let currentQuestionId = null;
    let prevControlEl = null;
    let nextControlEl = null;

    function removeControl(controlEl) {
      if (controlEl && typeof controlEl.remove === "function") {
        controlEl.remove();
      }
    }

    function removeControls() {
      removeControl(prevControlEl);
      removeControl(nextControlEl);
      prevControlEl = null;
      nextControlEl = null;
    }

    function alignControlToContent(controlEl, anchorEl) {
      if (!(controlEl instanceof HTMLElement) || !(anchorEl instanceof HTMLElement)) {
        return;
      }

      const parentEl = controlEl.parentElement;
      if (!(parentEl instanceof HTMLElement)) {
        return;
      }

      const anchorRect = anchorEl.getBoundingClientRect();
      const parentRect = parentEl.getBoundingClientRect();
      const nextWidth = Math.max(280, Math.round(anchorRect.width));
      const nextMarginLeft = Math.max(0, Math.round(anchorRect.left - parentRect.left));

      controlEl.style.width = nextWidth + "px";
      controlEl.style.maxWidth = nextWidth + "px";
      controlEl.style.marginLeft = nextMarginLeft + "px";
      controlEl.style.marginRight = "0";
    }

    function createJumpControl(direction, question) {
      if (!question) {
        return null;
      }

      const buttonEl = document.createElement("button");
      buttonEl.type = "button";
      buttonEl.className = "qnav-reader-jump qnav-reader-jump-" + direction;
      buttonEl.setAttribute(MANAGED_ATTR, MANAGED_VALUE);

      const titleRowEl = document.createElement("span");
      titleRowEl.className = "qnav-reader-jump-title";

      const labelEl = document.createElement("span");
      labelEl.className = "qnav-reader-jump-label";
      labelEl.textContent = direction === "prev" ? t("reader.prevLabel") : t("reader.nextLabel");

      const titleEl = document.createElement("span");
      titleEl.className = "qnav-reader-jump-heading";
      titleEl.textContent = buildQuestionPreview(question);

      titleRowEl.appendChild(labelEl);
      titleRowEl.appendChild(titleEl);
      buttonEl.appendChild(titleRowEl);

      const previewEl = document.createElement("span");
      previewEl.className = "qnav-reader-jump-preview";

      const previewLabelEl = document.createElement("span");
      previewLabelEl.className = "qnav-reader-jump-preview-label";
      previewLabelEl.textContent = t("reader.answerLabel");

      const previewTextEl = document.createElement("span");
      previewTextEl.className = "qnav-reader-jump-preview-text";
      previewTextEl.textContent = buildAnswerPreview(question);

      previewEl.appendChild(previewLabelEl);
      previewEl.appendChild(previewTextEl);
      buttonEl.appendChild(previewEl);

      buttonEl.addEventListener("click", () => {
        if (typeof config.onSelectQuestion === "function") {
          config.onSelectQuestion(question.id);
        }
      });
      return buttonEl;
    }

    function renderControls() {
      removeControls();

      if (!currentQuestionId || !questionsById.has(currentQuestionId) || !orderedQuestions.length) {
        return;
      }

      const currentIndex = orderedQuestions.findIndex((question) => question.id === currentQuestionId);
      if (currentIndex === -1) {
        return;
      }

      const currentQuestion = orderedQuestions[currentIndex];
      const currentElements = getManagedElements(currentQuestion).filter((element) => {
        return element instanceof HTMLElement && !element.hidden;
      });
      if (!currentElements.length) {
        return;
      }

      const firstElement = currentElements[0];
      const lastElement = currentElements[currentElements.length - 1];
      const contentAnchorEl = getPrimaryContentElement(currentQuestion) || lastElement || firstElement;
      const previousQuestion = typeof config.getAdjacentQuestion === "function"
        ? config.getAdjacentQuestion("up")
        : orderedQuestions[currentIndex - 1];
      const nextQuestion = typeof config.getAdjacentQuestion === "function"
        ? config.getAdjacentQuestion("down")
        : orderedQuestions[currentIndex + 1];

      if (previousQuestion && firstElement.parentNode instanceof Node) {
        prevControlEl = createJumpControl("prev", previousQuestion);
        if (prevControlEl) {
          firstElement.parentNode.insertBefore(prevControlEl, firstElement);
          alignControlToContent(prevControlEl, contentAnchorEl);
        }
      }

      if (nextQuestion && lastElement.parentNode instanceof Node) {
        nextControlEl = createJumpControl("next", nextQuestion);
        if (nextControlEl) {
          if (lastElement.nextSibling) {
            lastElement.parentNode.insertBefore(nextControlEl, lastElement.nextSibling);
          } else {
            lastElement.parentNode.appendChild(nextControlEl);
          }
          alignControlToContent(nextControlEl, contentAnchorEl);
        }
      }
    }

    function reconcileQuestions(extractedQuestions) {
      const nextQuestions = Array.isArray(extractedQuestions) ? extractedQuestions : [];
      if (!orderedQuestions.length) {
        return nextQuestions.map((question) => hydrateQuestion(question)).filter(Boolean);
      }

      if (!nextQuestions.length) {
        return orderedQuestions.map((question) => hydrateQuestion(question)).filter(Boolean);
      }

      const extractedById = new Map(nextQuestions.map((question) => [question.id, question]));
      const mergedQuestions = orderedQuestions.map((question) => {
        return mergeQuestionData(question, extractedById.get(question.id));
      });

      let maxIndex = mergedQuestions.reduce((highest, question) => {
        return Math.max(highest, typeof question.index === "number" ? question.index : 0);
      }, 0);

      nextQuestions.forEach((question) => {
        if (questionsById.has(question.id)) {
          return;
        }

        maxIndex += 1;
        const hydratedQuestion = hydrateQuestion(question);
        mergedQuestions.push({
          id: hydratedQuestion.id,
          index: maxIndex,
          text: hydratedQuestion.text,
          questionText: hydratedQuestion.questionText,
          answerText: hydratedQuestion.answerText,
          questionHtml: hydratedQuestion.questionHtml,
          answerHtml: hydratedQuestion.answerHtml,
          searchText: hydratedQuestion.searchText,
          shortTitle: hydratedQuestion.shortTitle,
          messageEl: hydratedQuestion.messageEl,
          answerEl: hydratedQuestion.answerEl
        });
      });

      return mergedQuestions;
    }

    function showQuestion(questionId) {
      if (!questionId || !questionsById.has(questionId)) {
        return;
      }

      removeControls();
      currentQuestionId = questionId;
      orderedQuestions.forEach((question) => {
        const isCurrent = question.id === currentQuestionId;
        getManagedElements(question).forEach((element) => {
          setCollapsedState(element, !isCurrent);
        });
      });
      renderControls();
    }

    function applyQuestions(questions) {
      orderedQuestions = Array.isArray(questions)
        ? questions.map((question) => Object.assign({}, question))
        : [];
      questionsById = new Map(orderedQuestions.map((question) => [question.id, question]));

      if (!orderedQuestions.length) {
        removeControls();
        currentQuestionId = null;
        return;
      }

      if (!currentQuestionId || !questionsById.has(currentQuestionId)) {
        currentQuestionId = orderedQuestions[orderedQuestions.length - 1].id;
      }

      showQuestion(currentQuestionId);
    }

    function getCurrentQuestionId() {
      return currentQuestionId;
    }

    function getObservableQuestions() {
      if (!currentQuestionId || !questionsById.has(currentQuestionId)) {
        return [];
      }

      return [questionsById.get(currentQuestionId)];
    }

    function reset() {
      removeControls();
      orderedQuestions.forEach((question) => {
        getManagedElements(question).forEach((element) => {
          setCollapsedState(element, false);
        });
      });

      orderedQuestions = [];
      questionsById.clear();
      currentQuestionId = null;
    }

    function setLanguage() {
      renderControls();
    }

    return {
      applyQuestions,
      ensureQuestionVisible(question) {
        if (question && question.id) {
          showQuestion(question.id);
        }
      },
      freeze() {
        return Date.now();
      },
      getCurrentQuestionId,
      getObservableQuestions,
      isFrozen() {
        return false;
      },
      isSuspended() {
        return false;
      },
      prepareNavigation(questionId) {
        showQuestion(questionId);
        return Promise.resolve();
      },
      reconcileQuestions,
      reset,
      setLanguage,
      setActiveQuestion(questionId) {
        showQuestion(questionId);
        return true;
      },
      showQuestion,
      suspend() {
        return Date.now();
      },
      suspendForMutation() {
        return Date.now();
      }
    };
  }

  root.virtualizer = {
    COLLAPSED_ATTR,
    MANAGED_ATTR,
    MANAGED_VALUE,
    createConversationVirtualizer
  };
}());
