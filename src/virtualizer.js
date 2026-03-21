(function initVirtualizerModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const MANAGED_ATTR = "data-qnav-managed";
  const MANAGED_VALUE = "true";
  const COLLAPSED_ATTR = "data-qnav-collapsed";

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

  function setCollapsedState(element, collapsed) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.hidden = Boolean(collapsed);
    element.setAttribute(COLLAPSED_ATTR, collapsed ? "true" : "false");
  }

  function mergeQuestionData(previousQuestion, nextQuestion) {
    if (!previousQuestion) {
      return nextQuestion;
    }

    if (!nextQuestion) {
      return previousQuestion;
    }

    return {
      id: previousQuestion.id,
      index: previousQuestion.index,
      text: nextQuestion.text || previousQuestion.text,
      shortTitle: nextQuestion.shortTitle || previousQuestion.shortTitle,
      messageEl: nextQuestion.messageEl || previousQuestion.messageEl,
      answerEl: nextQuestion.answerEl || previousQuestion.answerEl
    };
  }

  function truncateText(text, limit) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }

    if (normalized.length <= limit) {
      return normalized;
    }

    return normalized.slice(0, Math.max(0, limit - 1)).trimEnd() + "\u2026";
  }

  function buildQuestionPreview(question) {
    return truncateText(question && question.text, 108);
  }

  function buildAnswerPreview(question) {
    const answerText = String(
      question && question.answerEl instanceof HTMLElement
        ? (question.answerEl.innerText || question.answerEl.textContent)
        : ""
    ).replace(/\s+/g, " ").trim();

    if (!answerText) {
      return "暂无回答";
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
      labelEl.textContent = direction === "prev" ? "上一题：" : "下一题：";

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
      previewLabelEl.textContent = "答案：";

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
        }
      }
    }

    function reconcileQuestions(extractedQuestions) {
      const nextQuestions = Array.isArray(extractedQuestions) ? extractedQuestions : [];
      if (!orderedQuestions.length) {
        return nextQuestions.slice();
      }

      if (!nextQuestions.length) {
        return orderedQuestions.slice();
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
        mergedQuestions.push({
          id: question.id,
          index: maxIndex,
          text: question.text,
          shortTitle: question.shortTitle,
          messageEl: question.messageEl,
          answerEl: question.answerEl
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
      orderedQuestions = Array.isArray(questions) ? questions.slice() : [];
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
