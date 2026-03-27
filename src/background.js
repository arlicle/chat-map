(function initBackground() {
  const FAVORITES_PAGE_PATH = "favorites.html";
  const LANGUAGE_KEY = "qnav.language.v1";

  function resolveLocale(preference) {
    const normalized = String(preference || "auto").trim();
    if (normalized === "zh-CN" || normalized === "en") {
      return normalized;
    }

    return String(navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh-CN" : "en";
  }

  function getActionTitle(locale) {
    return locale === "zh-CN" ? "打开 ChatMap 收藏页" : "Open ChatMap favorites";
  }

  async function syncActionTitle() {
    try {
      const result = await chrome.storage.local.get([LANGUAGE_KEY]);
      const locale = resolveLocale(result[LANGUAGE_KEY]);
      await chrome.action.setTitle({
        title: getActionTitle(locale)
      });
    } catch (_error) {
      // Ignore title sync failures.
    }
  }

  function getFavoritesPageUrl() {
    return chrome.runtime.getURL(FAVORITES_PAGE_PATH);
  }

  async function openOrFocusFavoritesPage() {
    const favoritesUrl = getFavoritesPageUrl();
    const matchingTabs = await chrome.tabs.query({
      url: favoritesUrl
    });

    const existingTab = Array.isArray(matchingTabs) ? matchingTabs[0] : null;
    if (existingTab && typeof existingTab.id === "number") {
      await chrome.tabs.update(existingTab.id, {
        active: true
      });
      if (typeof existingTab.windowId === "number") {
        await chrome.windows.update(existingTab.windowId, {
          focused: true
        });
      }
      return;
    }

    await chrome.tabs.create({
      url: favoritesUrl
    });
  }

  chrome.action.onClicked.addListener(() => {
    openOrFocusFavoritesPage().catch(() => {
      // Ignore action failures.
    });
  });

  chrome.runtime.onInstalled.addListener(() => {
    syncActionTitle();
  });

  chrome.runtime.onStartup.addListener(() => {
    syncActionTitle();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[LANGUAGE_KEY]) {
      syncActionTitle();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "OPEN_FAVORITES_PAGE") {
      return false;
    }

    openOrFocusFavoritesPage()
      .then(() => {
        sendResponse({
          ok: true
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message || error)
        });
      });

    return true;
  });

  syncActionTitle();
}());
