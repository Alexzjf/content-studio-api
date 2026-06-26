/** @type {{ min: number, max: number, default: number }} */
const PANEL_WIDTH = {
  min: typeof EXTENSION_CONFIG !== "undefined" && EXTENSION_CONFIG.panelWidthMin != null
    ? EXTENSION_CONFIG.panelWidthMin
    : 25,
  max: typeof EXTENSION_CONFIG !== "undefined" && EXTENSION_CONFIG.panelWidthMax != null
    ? EXTENSION_CONFIG.panelWidthMax
    : 75,
  default: typeof EXTENSION_CONFIG !== "undefined" && EXTENSION_CONFIG.panelWidthDefault != null
    ? EXTENSION_CONFIG.panelWidthDefault
    : 25,
};

function clampPanelPercent(n) {
  return Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, Number(n) || PANEL_WIDTH.default));
}

const PANEL_BLOCKED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
];

function isPanelAllowedUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (PANEL_BLOCKED_PREFIXES.some((p) => url.startsWith(p))) return false;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  try {
    const host = new URL(url).hostname;
    if (host === "chrome.google.com" || host === "chromewebstore.google.com") return false;
  } catch (_) {
    return false;
  }
  return true;
}

async function pickPanelTargetTab(preferredTabId) {
  if (preferredTabId) {
    try {
      const tab = await chrome.tabs.get(preferredTabId);
      if (tab?.id && isPanelAllowedUrl(tab.url)) return tab.id;
    } catch (_) {}
  }

  let focusedWindowId = null;
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    focusedWindowId = win?.id ?? null;
    if (focusedWindowId) {
      const inWin = await chrome.tabs.query({ windowId: focusedWindowId });
      const activeAllowed = inWin.find((t) => t.active && t.id && isPanelAllowedUrl(t.url));
      if (activeAllowed?.id) return activeAllowed.id;

      const anyInWin = inWin
        .filter((t) => t.id && isPanelAllowedUrl(t.url))
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      if (anyInWin[0]?.id) return anyInWin[0].id;
    }
  } catch (_) {}

  const tabs = await chrome.tabs.query({ windowType: "normal" });
  const allowed = tabs
    .filter((t) => t.id && isPanelAllowedUrl(t.url))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

  const active = allowed.find((t) => t.active);
  if (active?.id) return active.id;
  return allowed[0]?.id ?? null;
}

globalThis.PANEL_WIDTH = PANEL_WIDTH;
globalThis.clampPanelPercent = clampPanelPercent;
globalThis.isPanelAllowedUrl = isPanelAllowedUrl;
globalThis.pickPanelTargetTab = pickPanelTargetTab;
