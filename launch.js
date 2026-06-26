/**
 * Opens workspace window directly from popup (does not depend on service worker).
 */
(async function openWorkspace() {
  const APP_URL = chrome.runtime.getURL("app.html");
  const COMPACT = { width: 380, height: 520 };
  const status = document.getElementById("status");

  function fail(msg) {
    if (status) status.textContent = msg;
  }

  try {
    const popups = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });
    const existing = popups.find((w) => w.tabs?.some((t) => t.url === APP_URL));
    if (existing?.id) {
      await chrome.windows.update(existing.id, { focused: true });
      window.close();
      return;
    }

    let anchor = null;
    try {
      anchor = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    } catch {
      anchor = null;
    }
    if (!anchor?.width) {
      const normals = await chrome.windows.getAll({ windowTypes: ["normal"] });
      anchor = normals.find((w) => w.focused) || normals[0] || null;
    }

    const area = {
      left: anchor?.left ?? 80,
      top: anchor?.top ?? 80,
      width: anchor?.width ?? 1280,
      height: anchor?.height ?? 800,
    };

    await chrome.windows.create({
      url: APP_URL,
      type: "popup",
      width: COMPACT.width,
      height: COMPACT.height,
      left: Math.max(area.left, area.left + area.width - COMPACT.width - 20),
      top: area.top + 20,
      focused: true,
    });

    window.close();
  } catch (err) {
    fail(`Помилка: ${err.message}`);
    console.error("launch failed:", err);
  }
})();
