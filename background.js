importScripts("extension-config.js", "panel-config.js", "prompt-hints.js", "ai-providers.js", "ai-client.js");

const OFFSCREEN_URL = "offscreen.html";
const APP_PATH = "app.html";
const DOCK_SUFFIX = "?dock=1";

chrome.runtime.onInstalled.addListener(() => {
  const sidePath = `${APP_PATH}?side=1`;
  if (chrome.sidePanel?.setOptions) {
    chrome.sidePanel.setOptions({ path: sidePath, enabled: true }).catch(() => {});
  }
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

function withServiceWorkerKeepAlive(work) {
  const tick = () => chrome.runtime.getPlatformInfo(() => {});
  tick();
  const id = setInterval(tick, 20000);
  return Promise.resolve(work()).finally(() => clearInterval(id));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target === "offscreen") return false;

  if (message.type === "WAKE_WORKER") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "CLOSE_LEGACY_DOCK") {
    closeLegacyDockWindows()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "OPEN_INPAGE_PANEL" || message.type === "RESIZE_INPAGE_PANEL") {
    relayToActiveTab(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "OPEN_FULLSCREEN_TAB") {
    chrome.tabs
      .create({ url: chrome.runtime.getURL("app.html?fullscreen=1"), active: true })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "OPEN_STANDALONE_WINDOW") {
    getCenteredWindowBounds()
      .then((bounds) =>
        chrome.windows.create({
          url: chrome.runtime.getURL("app.html?window=1"),
          type: "normal",
          focused: true,
          ...bounds,
        })
      )
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "OPEN_DOCK_PANEL" || message.type === "OPEN_SIDE_PANEL") {
    openInpagePanel(message.widthPercent ?? 25, message.browserWindowId)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "APPLY_DOCK_WIDTH" || message.type === "SET_DOCK_WIDTH" || message.type === "SIDE_PANEL_SET_WIDTH") {
    resizeInpagePanel(message.widthPercent ?? 25, message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "TRANSCRIBE") {
    withServiceWorkerKeepAlive(() => handleTranscribe(message.audioId, message.language))
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "CHAT") {
    const settings = message.settings || {};
    const provider = settings.aiProvider || "hosted";
    const keepAliveMs = provider === "cursor" ? 300000 : 150000;
    withServiceWorkerKeepAlive(async () => {
      const chatFn = globalThis.chatWithSources;
      if (typeof chatFn !== "function") {
        throw new Error("AI модуль у background не завантажився. Reload розширення.");
      }
      const text = await Promise.race([
        chatFn(message.sources || [], settings, message.history || []),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("AI не відповів вчасно. Перевірте API ключ і модель.")),
            keepAliveMs
          )
        ),
      ]);
      return { text };
    })
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "DESCRIBE_IMAGE") {
    withServiceWorkerKeepAlive(async () => {
      const describeFn = globalThis.describeImage;
      if (typeof describeFn !== "function") {
        throw new Error("AI модуль у background не завантажився.");
      }
      const text = await describeFn(message.imageBase64, message.settings || {});
      return { text };
    })
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "INSERT_TWEET") {
    findXTab()
      .then((tab) => {
        if (!tab?.id) {
          sendResponse({ error: "Відкрийте x.com або twitter.com у вкладці браузера" });
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "INSERT_TWEET", text: message.text }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              error:
                "Не вдалося вставити. Відкрийте x.com, натисніть «Що нового?» і спробуйте знову.",
            });
          } else {
            sendResponse(response);
          }
        });
      })
      .catch(() => sendResponse({ error: "Відкрийте x.com або twitter.com у вкладці браузера" }));
    return true;
  }
});

function dockAppUrl() {
  return chrome.runtime.getURL(APP_PATH + DOCK_SUFFIX);
}

async function findXTab() {
  const tabs = await chrome.tabs.query({
    url: ["https://x.com/*", "https://twitter.com/*"],
  });
  const usable = tabs.filter((t) => t.id && !t.discarded);
  if (!usable.length) return null;

  usable.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const active = usable.find((t) => t.active);
  return active || usable[0];
}

function isUsableBrowserWindow(win) {
  if (!win?.id || !win.width) return false;
  if (win.type === "popup" || win.type === "devtools") return false;
  return true;
}

async function getMainBrowserWindow(browserWindowId) {
  if (browserWindowId) {
    try {
      const win = await chrome.windows.get(browserWindowId);
      if (isUsableBrowserWindow(win)) return win;
    } catch (_) {}
  }

  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (isUsableBrowserWindow(win)) return win;
  } catch (_) {}

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tabs[0]?.windowId) {
    try {
      const win = await chrome.windows.get(tabs[0].windowId);
      if (isUsableBrowserWindow(win)) return win;
    } catch (_) {}
  }

  const normals = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const win = normals.find((w) => w.focused) || normals[normals.length - 1];
  if (!isUsableBrowserWindow(win)) {
    throw new Error("Відкрийте звичайну вкладку Chrome (YouTube, X тощо)");
  }
  return win;
}

async function findDockPanelWindow() {
  const url = dockAppUrl();
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["popup", "normal"] });
  return (
    wins.find((w) => w.tabs?.some((t) => t.url && t.url.startsWith(url.split("?")[0]) && t.url.includes("dock=1"))) ||
    null
  );
}

function dockGeometry(browserWin, widthPercent) {
  const pct = clampPercent(widthPercent);
  const width = Math.max(320, Math.round(browserWin.width * (pct / 100)));
  const left = (browserWin.left ?? 0) + browserWin.width - width;
  const top = browserWin.top ?? 0;
  const height = browserWin.height ?? 800;
  return { pct, width, left, top, height };
}


async function getActiveTabId(preferredTabId) {
  const tabId = await pickPanelTargetTab(preferredTabId);
  if (tabId) return tabId;
  throw new Error("Відкрийте звичайну вкладку Chrome (YouTube, X тощо)");
}

async function ensurePagePanelScript(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.id || !isPanelAllowedUrl(tab.url)) {
    throw new Error("Бік не працює на цій сторінці (chrome://, Extensions, Web Store). Перейдіть на звичайний сайт.");
  }

  const ping = await tabsSendMessage(tabId, { type: "PING_PAGE_PANEL" });
  if (ping?.ok) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["page-panel.js"],
    });
  } catch (_) {
    throw new Error("Бік не працює на цій сторінці (chrome://, Extensions, Web Store). Перейдіть на звичайний сайт.");
  }
}

function tabsSendMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

async function relayToActiveTab(message) {
  const tabId = await getActiveTabId(message.tabId);
  await closeLegacyDockWindows();
  await ensurePagePanelScript(tabId);
  const response = await tabsSendMessage(tabId, message);
  if (response?.error) throw new Error(response.error);
  if (message.type === "OPEN_INPAGE_PANEL" && response?.ok) {
    await savePanelWidth(message.widthPercent ?? 25);
  }
  if (message.type === "RESIZE_INPAGE_PANEL" && response?.ok) {
    await savePanelWidth(message.widthPercent ?? 25);
  }
  return response;
}

async function openInpagePanel(widthPercent = 25, _browserWindowId) {
  return relayToActiveTab({ type: "OPEN_INPAGE_PANEL", widthPercent });
}

async function resizeInpagePanel(widthPercent = 25, tabId) {
  return relayToActiveTab({ type: "RESIZE_INPAGE_PANEL", widthPercent, tabId });
}

async function openDockPanel(widthPercent = 25, browserWindowId) {
  return openInpagePanel(widthPercent, browserWindowId);
}

async function setDockPanelWidth(widthPercent) {
  return resizeInpagePanel(widthPercent);
}

async function closeLegacyDockWindows() {
  const dockUrl = chrome.runtime.getURL(APP_PATH + DOCK_SUFFIX);
  const wins = await chrome.windows.getAll({ populate: true });
  for (const win of wins) {
    const isLegacyDock = win.tabs?.some(
      (t) => t.url?.includes("dock=1") || t.url === dockUrl
    );
    if (isLegacyDock && win.id) {
      await chrome.windows.remove(win.id).catch(() => {});
    }
  }
}

async function savePanelWidth(widthPercent) {
  const pct = clampPercent(widthPercent);
  const { settings = {} } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({
    settings: { ...settings, panelWidthPercent: pct },
  });
  return { ok: true, widthPercent: pct };
}

function clampPercent(n) {
  const min = typeof EXTENSION_CONFIG !== "undefined" ? EXTENSION_CONFIG.panelWidthMin ?? 25 : 25;
  const max = typeof EXTENSION_CONFIG !== "undefined" ? EXTENSION_CONFIG.panelWidthMax ?? 75 : 75;
  const def = typeof EXTENSION_CONFIG !== "undefined" ? EXTENSION_CONFIG.panelWidthDefault ?? 25 : 25;
  return Math.min(max, Math.max(min, Number(n) || def));
}

async function getCenteredWindowBounds() {
  const cfg = typeof EXTENSION_CONFIG !== "undefined" ? EXTENSION_CONFIG : {};
  const targetW = cfg.standaloneWindowWidth ?? 1040;
  const targetH = cfg.standaloneWindowHeight ?? 700;

  try {
    if (chrome.system?.display?.getInfo) {
      const displays = await chrome.system.display.getInfo();
      const primary = displays.find((d) => d.isPrimary) || displays[0];
      const area = primary?.workArea;
      if (area) {
        const width = Math.min(targetW, Math.round(area.width * 0.82));
        const height = Math.min(targetH, Math.round(area.height * 0.8));
        return {
          width,
          height,
          left: Math.round(area.left + (area.width - width) / 2),
          top: Math.round(area.top + (area.height - height) / 2),
        };
      }
    }
  } catch (_) {}

  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  const width = targetW;
  const height = targetH;
  const baseLeft = win?.left ?? 100;
  const baseTop = win?.top ?? 80;
  const baseW = win?.width ?? 1400;
  const baseH = win?.height ?? 900;
  return {
    width,
    height,
    left: Math.round(baseLeft + (baseW - width) / 2),
    top: Math.round(baseTop + (baseH - height) / 2),
  };
}

async function handleTranscribe(audioId, language) {
  if (!audioId) {
    return { error: "Missing audio data" };
  }

  await ensureOffscreenDocument();

  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 15000);

  try {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "OFFSCREEN_TRANSCRIBE", audioId, language, target: "offscreen" },
        (response) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || "Transcription failed";
            resolve({
              error: msg.includes("parsed") || msg.includes("empty")
                ? "Транскрипція не вдалась. Спробуйте коротше відео або Reload розширення."
                : msg,
            });
            return;
          }
          if (!response) {
            resolve({ error: "Транскрипція не вдалась (порожня відповідь). Reload розширення." });
            return;
          }
          resolve(response);
        }
      );
    });
  } finally {
    clearInterval(keepAlive);
  }
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) throw new Error("Потрібен Chrome 109+");

  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["WORKERS"],
    justification: "Run local Whisper speech-to-text model",
  });
}
