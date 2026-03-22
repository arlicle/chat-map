(function initBackground() {
  const FAVORITES_PAGE_PATH = "favorites.html";

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
}());
