/**
 * Boot + UI chrome (lang, in-tab panel, width slider, window modes).
 */
(function () {
  const clampPercent =
    globalThis.clampPanelPercent ||
    ((n) => Math.min(75, Math.max(25, Number(n) || 25)));

  function defaultPanelPercent() {
    return globalThis.PANEL_WIDTH?.default ?? 25;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function t(key) {
    try {
      return window.I18n.t(key);
    } catch {
      return key;
    }
  }

  function queryMode() {
    const q = location.search;
    if (q.includes("embed=1")) return "embed";
    if (q.includes("fullscreen=1")) return "fullscreen";
    if (q.includes("window=1")) return "standalone";
    if (q.includes("side=1")) return "side";
    if (q.includes("dock=1")) return "dock";
    return "toolbar";
  }

  const surfaceMode = queryMode();
  let sideWidthUiActive = false;

  function isEmbedPanel() {
    return surfaceMode === "embed";
  }

  function isFullscreenTab() {
    return surfaceMode === "fullscreen";
  }

  function isStandaloneWindow() {
    return surfaceMode === "standalone";
  }

  function isExpandedSurface() {
    return isEmbedPanel() || isFullscreenTab() || isStandaloneWindow() || surfaceMode === "side";
  }

  function isToolbarPopup() {
    if (isExpandedSurface()) return false;
    return document.body.classList.contains("mode-toolbar-popup");
  }

  function applySurfaceClasses() {
    document.body.classList.remove(
      "mode-toolbar-popup",
      "mode-embed-panel",
      "mode-fullscreen-tab",
      "mode-standalone-window",
      "mode-dock-panel",
      "mode-side-panel"
    );
    document.documentElement.classList.remove(
      "mode-embed-panel",
      "mode-fullscreen-tab",
      "mode-standalone-window",
      "mode-dock-panel",
      "mode-side-panel"
    );

    if (isEmbedPanel()) {
      document.body.classList.add("mode-embed-panel");
      document.documentElement.classList.add("mode-embed-panel");
      return;
    }
    if (isFullscreenTab()) {
      document.body.classList.add("mode-fullscreen-tab", "layout-wide");
      document.documentElement.classList.add("mode-fullscreen-tab");
      return;
    }
    if (isStandaloneWindow()) {
      document.body.classList.add("mode-standalone-window", "layout-wide");
      document.documentElement.classList.add("mode-standalone-window");
      return;
    }
    if (surfaceMode === "side") {
      document.body.classList.add("mode-side-panel", "layout-wide");
      document.documentElement.classList.add("mode-side-panel");
      return;
    }
    if (surfaceMode === "dock") {
      document.body.classList.add("mode-dock-panel", "layout-wide");
      document.documentElement.classList.add("mode-dock-panel");
      return;
    }
    document.body.classList.add("mode-toolbar-popup");
  }

  function setHeaderStatus(text, type) {
    const el = $("headerStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "header-status" + (type ? ` ${type}` : "");
    el.classList.toggle("hidden", !text);
  }

  function normalizeUiLang(lang) {
    return window.I18n?.normalizeUiLang?.(lang) || (lang === "uk" ? "uk" : "en");
  }

  function populateAppSettingsLangSelect() {
    const sel = $("appSettingsLang");
    if (!sel || sel.dataset.populated) return;
    const options = window.I18n?.UI_LANG_OPTIONS || [
      { code: "en", label: "English" },
      { code: "uk", label: "Українська" },
    ];
    sel.replaceChildren(
      ...options.map((opt) => {
        const el = document.createElement("option");
        el.value = opt.code;
        el.textContent = opt.label;
        return el;
      })
    );
    sel.dataset.populated = "1";
  }

  function syncAppSettingsLang(lang) {
    const sel = $("appSettingsLang");
    if (sel) sel.value = normalizeUiLang(lang);
  }

  function applyUiLang(lang) {
    const code = normalizeUiLang(lang);
    window.__uiLang = code;
    syncAppSettingsLang(code);
    if (!window.I18n) return;
    window.I18n.setLocale(code);
    document.documentElement.lang = code;
    window.I18n.applyPageI18n();
    document.title = `${window.I18n.t("brandTitle")}`;
    if (typeof window.onLocaleApplied === "function") {
      window.onLocaleApplied(code);
    }
  }

  async function persistUiLang(lang) {
    try {
      const stored = await chrome.storage.local.get("settings");
      const settings = stored.settings || {};
      settings.uiLang = normalizeUiLang(lang);
      await chrome.storage.local.set({ settings });
    } catch (err) {
      console.warn("persistUiLang:", err);
    }
  }

  function onLangChange(lang) {
    applyUiLang(lang);
    setHeaderStatus(t("settingsSaved"), "success");
    void persistUiLang(lang);
  }

  function openAppSettingsDialog() {
    populateAppSettingsLangSelect();
    syncAppSettingsLang(window.__uiLang || "en");
    const dlg = $("appSettingsDialog");
    if (!dlg) return;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }

  function closeAppSettingsDialog() {
    const dlg = $("appSettingsDialog");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }

  function updateSliderUi(pct) {
    const slider = $("panelWidthSlider");
    if (slider) {
      slider.min = String(globalThis.PANEL_WIDTH?.min ?? 25);
      slider.max = String(globalThis.PANEL_WIDTH?.max ?? 75);
      slider.value = String(clampPercent(pct));
    }
    if ($("panelWidthValue")) $("panelWidthValue").textContent = `${clampPercent(pct)}%`;
  }

  async function persistPanelWidth(pct) {
    const { settings = {} } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, panelWidthPercent: clampPercent(pct) },
    });
  }

  function applyPanelWidth(pct) {
    pct = clampPercent(pct);
    updateSliderUi(pct);
    void persistPanelWidth(pct);

    if (isEmbedPanel()) {
      window.parent.postMessage({ type: "CSX_RESIZE", pct }, "*");
      setHeaderStatus(t("widthApplied"), "success");
      return;
    }

    void getTargetTabId().then((tabId) => {
      chrome.runtime.sendMessage({ type: "RESIZE_INPAGE_PANEL", widthPercent: pct, tabId }, (res) => {
        if (chrome.runtime.lastError) {
          setHeaderStatus(chrome.runtime.lastError.message, "error");
          return;
        }
        if (res?.error) {
          setHeaderStatus(res.error, "error");
          return;
        }
        setHeaderStatus(t("widthApplied"), "success");
      });
    });
  }

  function setViewModeActive(mode) {
    sideWidthUiActive = mode === "side";
    document.body.classList.toggle("side-width-visible", sideWidthUiActive);
    applyPanelChromeUi();
  }

  function currentViewMode() {
    if (isEmbedPanel() || surfaceMode === "side" || surfaceMode === "dock") return "side";
    if (isStandaloneWindow()) return "window";
    if (isFullscreenTab()) return "fullscreen";
    return null;
  }

  async function onDockPanelClick() {
    if (isEmbedPanel() || surfaceMode === "side" || surfaceMode === "dock") {
      setViewModeActive("side");
      return;
    }
    if (isFullscreenTab() || isStandaloneWindow()) {
      await openSideFromExpandedSurface();
      return;
    }
    await openInTabPanel();
  }

  async function getTargetTabId() {
    const preferred =
      window.__targetTabId ??
      (await chrome.storage.session.get("popupTargetTabId").catch(() => ({}))).popupTargetTabId ??
      null;
    if (globalThis.pickPanelTargetTab) {
      return globalThis.pickPanelTargetTab(preferred);
    }
    const tabs = await chrome.tabs.query({ windowType: "normal" });
    const tab =
      tabs
        .filter((t) => t.id && globalThis.isPanelAllowedUrl?.(t.url))
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
    return tab?.id ?? null;
  }

  async function captureTargetTab() {
    try {
      const tabId = await getTargetTabId();
      if (!tabId) return;
      window.__targetTabId = tabId;
      await chrome.storage.session.set({ popupTargetTabId: tabId });
    } catch (err) {
      console.warn("captureTargetTab:", err);
    }
  }

  async function resolveTargetTabId() {
    return getTargetTabId();
  }

  async function getBrowserWindowIdForNewTab() {
    const current = await chrome.windows.getCurrent().catch(() => null);
    const currentId = current?.id;

    const tabId = await resolveTargetTabId();
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId && tab.windowId !== currentId) return tab.windowId;
      } catch (_) {}
    }

    const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const other = windows.find((w) => w.id && w.id !== currentId);
    return other?.id ?? null;
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

  async function ensurePanelScript(tabId) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_) {
      throw new Error(t("openPanelNoTab"));
    }
    if (!globalThis.isPanelAllowedUrl?.(tab.url)) {
      throw new Error(t("openPanelBlockedPage"));
    }

    const ping = await tabsSendMessage(tabId, { type: "PING_PAGE_PANEL" });
    if (ping?.ok) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["page-panel.js"],
      });
    } catch (_) {
      throw new Error(t("openPanelBlockedPage"));
    }
  }

  async function getCenteredWindowBounds() {
    const cfg = globalThis.EXTENSION_CONFIG || {};
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

  async function openInTabPanel() {
    setViewModeActive("side");
    setHeaderStatus(t("docking"));
    const pct = clampPercent(defaultPanelPercent());
    updateSliderUi(pct);
    await persistPanelWidth(pct);
    const tabId = await resolveTargetTabId();

    if (!tabId) {
      setHeaderStatus(t("openPanelNoTab"), "error");
      return;
    }

    try {
      await ensurePanelScript(tabId);
    } catch (err) {
      setHeaderStatus(err?.message || String(err), "error");
      return;
    }

    const res = await tabsSendMessage(tabId, { type: "OPEN_INPAGE_PANEL", widthPercent: pct });
    if (res?.error) {
      setHeaderStatus(res.error, "error");
      return;
    }
    if (!res?.ok) {
      setHeaderStatus(t("openPanelNoTab"), "error");
      return;
    }

    await persistPanelWidth(pct);
    setHeaderStatus(t("dockOpened"), "success");
    if (isToolbarPopup()) {
      setTimeout(() => window.close(), 450);
    }
  }

  async function closeCurrentSurface() {
    if (isFullscreenTab()) {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) await chrome.tabs.remove(tab.id);
      return;
    }
    if (isStandaloneWindow()) {
      const win = await chrome.windows.getCurrent();
      if (win?.id) await chrome.windows.remove(win.id);
      return;
    }
    if (isEmbedPanel()) {
      window.parent.postMessage({ type: "CSX_CLOSE" }, "*");
    }
  }

  async function openSideFromExpandedSurface() {
    setHeaderStatus(t("docking"));
    const pct = clampPercent(defaultPanelPercent());
    updateSliderUi(pct);
    await persistPanelWidth(pct);
    const tabId = await resolveTargetTabId();

    if (!tabId) {
      setHeaderStatus(t("openPanelNoTab"), "error");
      return;
    }

    try {
      await ensurePanelScript(tabId);
    } catch (err) {
      setHeaderStatus(err?.message || String(err), "error");
      return;
    }

    const res = await tabsSendMessage(tabId, { type: "OPEN_INPAGE_PANEL", widthPercent: pct });
    if (res?.error) {
      setHeaderStatus(res.error, "error");
      return;
    }
    if (!res?.ok) {
      setHeaderStatus(t("openPanelNoTab"), "error");
      return;
    }

    await persistPanelWidth(pct);
    setHeaderStatus(t("dockOpened"), "success");
    setTimeout(() => void closeCurrentSurface(), 280);
  }

  async function openStandaloneWindow() {
    setViewModeActive("window");
    setHeaderStatus(t("openingWindow"));
    const bounds = await getCenteredWindowBounds();
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("app.html?window=1"),
        type: "normal",
        focused: true,
        ...bounds,
      },
      () => {
        if (chrome.runtime.lastError) {
          setHeaderStatus(chrome.runtime.lastError.message, "error");
          return;
        }
        setHeaderStatus(t("windowOpened"), "success");
        if (isEmbedPanel()) {
          window.parent.postMessage({ type: "CSX_CLOSE" }, "*");
        } else if (isToolbarPopup()) {
          setTimeout(() => window.close(), 300);
        }
      }
    );
  }

  async function openFullscreenTab() {
    setViewModeActive("fullscreen");
    setHeaderStatus(t("openingFullscreen"));

    const fromStandalone = isStandaloneWindow();
    const fromEmbed = isEmbedPanel();
    const fromPopup = isToolbarPopup();
    let winId = null;

    if (fromStandalone) {
      winId = await getBrowserWindowIdForNewTab();
      if (!winId) {
        try {
          const current = await chrome.windows.getCurrent();
          if (current?.id) await chrome.windows.update(current.id, { state: "maximized" });
        } catch (_) {}
        window.location.replace(chrome.runtime.getURL("app.html?fullscreen=1"));
        setHeaderStatus(t("fullscreenOpened"), "success");
        return;
      }
    }

    const createOpts = {
      url: chrome.runtime.getURL("app.html?fullscreen=1"),
      active: true,
    };
    if (winId) createOpts.windowId = winId;

    chrome.tabs.create(createOpts, () => {
      if (chrome.runtime.lastError) {
        setHeaderStatus(chrome.runtime.lastError.message, "error");
        return;
      }
      setHeaderStatus(t("fullscreenOpened"), "success");
      if (fromEmbed) {
        window.parent.postMessage({ type: "CSX_CLOSE" }, "*");
      } else if (fromStandalone) {
        setTimeout(() => void closeCurrentSurface(), 400);
      } else if (fromPopup) {
        setTimeout(() => window.close(), 300);
      }
    });
  }

  function bindChromeUi() {
    if (document.body.dataset.chromeBound) return;
    document.body.dataset.chromeBound = "1";

    $("openAppSettingsBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      openAppSettingsDialog();
    });
    $("appSettingsLang")?.addEventListener("change", (e) => {
      onLangChange(e.target.value);
    });
    $("appSettingsCloseBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      closeAppSettingsDialog();
    });
    $("appSettingsDialog")?.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeAppSettingsDialog();
    });
    $("dockPanelBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      void onDockPanelClick();
    });
    $("openWindowBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      openStandaloneWindow();
    });
    $("openFullscreenBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      void openFullscreenTab();
    });

    const slider = $("panelWidthSlider");
    if (slider && !slider.dataset.bound) {
      slider.dataset.bound = "1";
      let timer = null;
      slider.addEventListener("input", (e) => {
        const pct = clampPercent(e.target.value);
        if ($("panelWidthValue")) $("panelWidthValue").textContent = `${pct}%`;
        clearTimeout(timer);
        timer = setTimeout(() => applyPanelWidth(pct), 60);
      });
    }

    $("compactPanelBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      void closeCurrentSurface();
    });
  }

  function applyPanelChromeUi() {
    const embed = isEmbedPanel();
    const fullscreen = isFullscreenTab();
    const standalone = isStandaloneWindow();
    const toolbar = isToolbarPopup();
    const expanded = isExpandedSurface();
    const expandedWindow = fullscreen || standalone;
    const showWidthSlider = embed || (toolbar && sideWidthUiActive);
    const activeMode = sideWidthUiActive && toolbar ? "side" : currentViewMode();

    $("dockPanelBtn")?.classList.toggle("view-mode-btn-active", activeMode === "side");
    $("openWindowBtn")?.classList.toggle("view-mode-btn-active", activeMode === "window");
    $("openFullscreenBtn")?.classList.toggle("view-mode-btn-active", activeMode === "fullscreen");
    $("panelWidthControl")?.classList.toggle("hidden", !showWidthSlider || fullscreen || standalone);
    $("sideWidthHint")?.classList.toggle("hidden", (toolbar && !embed && !sideWidthUiActive) || fullscreen || standalone);
    $("compactPanelBtn")?.classList.toggle("hidden", !embed && !expandedWindow);
    document.body.classList.toggle("layout-wide", expanded || window.innerWidth >= 680);
  }

  function bindEmbedHostMessages() {
    if (!isEmbedPanel() || window.__embedHostBound) return;
    window.__embedHostBound = true;

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== "CSX_HOST_RESIZED") return;
      if (data.pct != null) updateSliderUi(clampPercent(data.pct));
    });
  }

  async function initChromeUi() {
    applySurfaceClasses();
    if (isToolbarPopup() || isFullscreenTab() || isStandaloneWindow()) {
      await captureTargetTab();
    }
    bindChromeUi();
    bindEmbedHostMessages();
    applyPanelChromeUi();
    setViewModeActive(currentViewMode());

    if (!window.__panelResizeBound) {
      window.__panelResizeBound = true;
      window.addEventListener("resize", applyPanelChromeUi);
    }

    let lang = "en";
    let pct = globalThis.PANEL_WIDTH?.default ?? 25;
    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      lang = settings.uiLang || (window.I18n?.detectLocale?.() ?? "en");
      pct = settings.panelWidthPercent ?? pct;
      updateSliderUi(pct);
    } catch (_) {}

    populateAppSettingsLangSelect();
    applyUiLang(lang);
  }

  window.AppChrome = {
    applyUiLang,
    setHeaderStatus,
    getUiLang: () => window.__uiLang || "en",
    initChromeUi,
    openInTabPanel,
    openStandaloneWindow,
    openFullscreenTab,
    applyPanelWidth,
    getSurfaceMode: () => surfaceMode,
    openAppSettingsDialog,
    syncAppSettingsLang,
  };
  window.__dockToRight = () => openInTabPanel();
  window.__setUiLang = (lang) => onLangChange(lang);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initChromeUi());
  } else {
    void initChromeUi();
  }
})();
