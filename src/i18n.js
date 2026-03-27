(function initI18nModule() {
  const root = window.__QNAV__ = window.__QNAV__ || {};
  const DEFAULT_LANGUAGE_PREFERENCE = "auto";
  const SUPPORTED_LOCALES = ["zh-CN", "en"];

  const MESSAGES = {
    "zh-CN": {
      "common.language": "语言",
      "common.languageAuto": "跟随浏览器",
      "common.languageZh": "中文",
      "common.languageEn": "English",
      "common.untitledConversation": "未命名会话",
      "common.noAnswer": "暂无回答",
      "common.noQuestion": "暂无问题",
      "common.noContent": "暂无内容",

      "panel.ariaLabel": "问题导航",
      "panel.title": "Questions",
      "panel.subtitle": "Jump to earlier prompts in this conversation",
      "panel.favoriteCurrentAria": "收藏当前问答",
      "panel.openFavoritesAria": "打开收藏页",
      "panel.collapseAria": "收起问题导航",
      "panel.expandAria": "展开问题导航",
      "panel.searchPlaceholder": "搜索问题和答案",
      "panel.searchAria": "搜索问题和答案",
      "panel.listAria": "会话问题列表",
      "panel.foundResults": ({ count }) => "找到 " + count + " 条结果",
      "panel.zeroQuestions": "0 个问题",
      "panel.questionCount": ({ count }) => count + " 个问题",
      "panel.noQuestions": "当前会话还没有可提取的问题。",
      "panel.noMatches": ({ query }) => "没有找到与 “" + query + "” 相关的结果。",
      "panel.resultTypeQuestion": "问题",
      "panel.resultTypeAnswer": "答案",
      "panel.openFavorites": "打开收藏页",
      "panel.openFavoritesCount": ({ count }) => "打开收藏页（" + count + "）",
      "panel.favoriteCurrent": "收藏当前问答",
      "panel.favoriteCurrentSaved": "已收藏，点击编辑备注",
      "panel.favoriteCurrentSavedWithNote": ({ note }) => "已收藏: " + note,

      "reader.prevLabel": "上一题：",
      "reader.nextLabel": "下一题：",
      "reader.answerLabel": "答案：",

      "outline.title": "Outline",

      "favoriteDialog.ariaLabel": "收藏当前问答",
      "favoriteDialog.kicker": "收藏这轮问答",
      "favoriteDialog.closeAria": "关闭收藏弹窗",
      "favoriteDialog.noteLabel": "备注",
      "favoriteDialog.notePlaceholder": "写一点这条内容为什么值得保存",
      "favoriteDialog.cancel": "取消",
      "favoriteDialog.remove": "取消收藏",
      "favoriteDialog.save": "保存收藏",

      "favorites.pageTitle": "ChatMap 收藏",
      "favorites.title": "收藏内容",
      "favorites.subtitle": "集中回看你标星保存的问答与备注。",
      "favorites.searchLabel": "搜索",
      "favorites.searchPlaceholder": "搜索备注、问题、答案或会话标题",
      "favorites.count": ({ count }) => count + " 条收藏",
      "favorites.empty": "还没有收藏内容。回到聊天页，点击星标即可保存。",
      "favorites.noMatches": "没有匹配到收藏内容。",
      "favorites.listAria": "收藏列表",
      "favorites.detailEmpty": "选择左侧一条收藏，查看完整问答和备注。",
      "favorites.savedAt": ({ date }) => "收藏于 " + date,
      "favorites.openSource": "打开原会话",
      "favorites.remove": "取消收藏",
      "favorites.noteLabel": "备注",
      "favorites.notePlaceholder": "写一点这条内容为什么值得保存",
      "favorites.saveNote": "保存备注",
      "favorites.copy": "复制",
      "favorites.copied": "已复制",
      "favorites.copyFailed": "复制失败"
    },
    "en": {
      "common.language": "Language",
      "common.languageAuto": "Follow browser",
      "common.languageZh": "Chinese",
      "common.languageEn": "English",
      "common.untitledConversation": "Untitled conversation",
      "common.noAnswer": "No answer yet",
      "common.noQuestion": "No question yet",
      "common.noContent": "No content yet",

      "panel.ariaLabel": "Question Navigator",
      "panel.title": "Questions",
      "panel.subtitle": "Jump to earlier prompts in this conversation",
      "panel.favoriteCurrentAria": "Favorite current answer",
      "panel.openFavoritesAria": "Open favorites",
      "panel.collapseAria": "Collapse question navigator",
      "panel.expandAria": "Expand question navigator",
      "panel.searchPlaceholder": "Search questions and answers",
      "panel.searchAria": "Search questions and answers",
      "panel.listAria": "Conversation questions",
      "panel.foundResults": ({ count }) => count + " results",
      "panel.zeroQuestions": "0 questions",
      "panel.questionCount": ({ count }) => count + " question" + (count === 1 ? "" : "s"),
      "panel.noQuestions": "No questions found in this conversation yet.",
      "panel.noMatches": ({ query }) => "No matches found for \"" + query + "\".",
      "panel.resultTypeQuestion": "Question",
      "panel.resultTypeAnswer": "Answer",
      "panel.openFavorites": "Open favorites",
      "panel.openFavoritesCount": ({ count }) => "Open favorites (" + count + ")",
      "panel.favoriteCurrent": "Favorite current answer",
      "panel.favoriteCurrentSaved": "Favorited. Click to edit note.",
      "panel.favoriteCurrentSavedWithNote": ({ note }) => "Favorited: " + note,

      "reader.prevLabel": "Previous:",
      "reader.nextLabel": "Next:",
      "reader.answerLabel": "Answer:",

      "outline.title": "Outline",

      "favoriteDialog.ariaLabel": "Favorite conversation turn",
      "favoriteDialog.kicker": "Save this Q&A",
      "favoriteDialog.closeAria": "Close favorite dialog",
      "favoriteDialog.noteLabel": "Note",
      "favoriteDialog.notePlaceholder": "Add a quick note about why this is worth saving",
      "favoriteDialog.cancel": "Cancel",
      "favoriteDialog.remove": "Remove favorite",
      "favoriteDialog.save": "Save favorite",

      "favorites.pageTitle": "ChatMap Favorites",
      "favorites.title": "Favorites",
      "favorites.subtitle": "Review the Q&A turns and notes you starred.",
      "favorites.searchLabel": "Search",
      "favorites.searchPlaceholder": "Search notes, questions, answers, or conversation titles",
      "favorites.count": ({ count }) => count + " favorite" + (count === 1 ? "" : "s"),
      "favorites.empty": "No favorites yet. Go back to a conversation and click the star button to save one.",
      "favorites.noMatches": "No favorites matched your search.",
      "favorites.listAria": "Favorites list",
      "favorites.detailEmpty": "Choose a favorite on the left to view the full question, answer, and note.",
      "favorites.savedAt": ({ date }) => "Saved " + date,
      "favorites.openSource": "Open source conversation",
      "favorites.remove": "Remove favorite",
      "favorites.noteLabel": "Note",
      "favorites.notePlaceholder": "Add a quick note about why this is worth saving",
      "favorites.saveNote": "Save note",
      "favorites.copy": "Copy",
      "favorites.copied": "Copied",
      "favorites.copyFailed": "Copy failed"
    }
  };

  let languagePreference = DEFAULT_LANGUAGE_PREFERENCE;
  let locale = "en";

  function normalizeLanguagePreference(value) {
    const nextValue = String(value || DEFAULT_LANGUAGE_PREFERENCE).trim();
    if (nextValue === "zh-CN" || nextValue === "en" || nextValue === DEFAULT_LANGUAGE_PREFERENCE) {
      return nextValue;
    }

    return DEFAULT_LANGUAGE_PREFERENCE;
  }

  function detectBrowserLocale() {
    const languages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || "en"];

    const hasChinese = languages.some((entry) => String(entry || "").toLowerCase().indexOf("zh") === 0);
    return hasChinese ? "zh-CN" : "en";
  }

  function resolveLocale(preference) {
    const normalized = normalizeLanguagePreference(preference);
    if (normalized === DEFAULT_LANGUAGE_PREFERENCE) {
      return detectBrowserLocale();
    }

    return SUPPORTED_LOCALES.indexOf(normalized) === -1 ? "en" : normalized;
  }

  function interpolate(message, params) {
    if (typeof message === "function") {
      return message(params || {});
    }

    return String(message || "").replace(/\{(\w+)\}/g, (_match, key) => {
      return Object.prototype.hasOwnProperty.call(params || {}, key) ? String(params[key]) : "";
    });
  }

  function applyDocumentLanguage(nextLocale) {
    try {
      document.documentElement.lang = nextLocale;
    } catch (_error) {
    }
  }

  function setLanguagePreference(preference) {
    languagePreference = normalizeLanguagePreference(preference);
    locale = resolveLocale(languagePreference);
    applyDocumentLanguage(locale);
    return locale;
  }

  function getLanguageOptions() {
    return [
      { value: DEFAULT_LANGUAGE_PREFERENCE, label: t("common.languageAuto") },
      { value: "zh-CN", label: t("common.languageZh") },
      { value: "en", label: t("common.languageEn") }
    ];
  }

  function t(key, params) {
    const activeMessages = MESSAGES[locale] || MESSAGES.en;
    const message = Object.prototype.hasOwnProperty.call(activeMessages, key)
      ? activeMessages[key]
      : MESSAGES.en[key];
    if (typeof message === "undefined") {
      return key;
    }

    return interpolate(message, params);
  }

  setLanguagePreference(DEFAULT_LANGUAGE_PREFERENCE);

  root.i18n = {
    DEFAULT_LANGUAGE_PREFERENCE,
    SUPPORTED_LOCALES,
    normalizeLanguagePreference,
    resolveLocale,
    getLocale: () => locale,
    getLanguagePreference: () => languagePreference,
    getLanguageOptions,
    setLanguagePreference,
    t
  };
}());
