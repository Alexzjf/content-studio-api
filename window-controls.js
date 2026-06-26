/** Dock-panel UI only (slider, compact). Dock open lives in app.js */

const $wc = (id) => document.getElementById(id);

let uiSurface = "toolbar";

async function initWindowControls() {
  uiSurface = location.search.includes("dock=1") ? "dock" : "toolbar";
  applySurfaceClasses();
  applySurfaceUi();

  const clamp =
    globalThis.clampPanelPercent ||
    ((n) => Math.min(75, Math.max(25, Number(n) || 25)));
  const { settings = {} } = await chrome.storage.local.get("settings");
  const panelWidthPercent = settings.panelWidthPercent ?? globalThis.PANEL_WIDTH?.default ?? 25;
  const slider = $wc("panelWidthSlider");
  if (slider) {
    slider.value = String(clamp(panelWidthPercent));
    slider.min = String(globalThis.PANEL_WIDTH?.min ?? 25);
    slider.max = String(globalThis.PANEL_WIDTH?.max ?? 75);
  }
  if ($wc("panelWidthValue")) {
    $wc("panelWidthValue").textContent = `${panelWidthPercent}%`;
  }

  bindDockPanelUi();
  document.body.classList.toggle("layout-wide", window.innerWidth >= 680);
  window.addEventListener("resize", () => {
    document.body.classList.toggle("layout-wide", window.innerWidth >= 680);
  });
}

function applySurfaceClasses() {
  const isDock = uiSurface === "dock";
  document.body.classList.toggle("mode-toolbar-popup", !isDock);
  document.body.classList.toggle("mode-dock-panel", isDock);
  document.documentElement.classList.toggle("mode-dock-panel", isDock);
}

function applySurfaceUi() {
  const isDock = uiSurface === "dock";
  $wc("dockPanelBtn")?.classList.toggle("hidden", isDock);
  $wc("compactPanelBtn")?.classList.toggle("hidden", !isDock);
  $wc("panelWidthControl")?.classList.toggle("hidden", !isDock);
  $wc("sideWidthHint")?.classList.toggle("hidden", !isDock);
}

function bindDockPanelUi() {
  $wc("compactPanelBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.close();
  });

  const slider = $wc("panelWidthSlider");
  if (!slider || slider.dataset.bound) return;
  slider.dataset.bound = "1";

  let timer = null;
  slider.addEventListener("input", (e) => {
    const pct = Number(e.target.value);
    if ($wc("panelWidthValue")) $wc("panelWidthValue").textContent = `${pct}%`;

    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        if (typeof window.dockToRight === "function") {
          await window.dockToRight();
        }
        if (typeof saveSettingsQuiet === "function") await saveSettingsQuiet();
      } catch (err) {
        if (typeof setStatus === "function") setStatus(err.message, "error");
      }
    }, 80);
  });
}

if (typeof window !== "undefined") {
  window.initWindowControls = initWindowControls;
}
