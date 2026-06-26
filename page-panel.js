/**
 * In-tab dock panel (right side of page). Resizable via slider or drag handle.
 */
(function () {
  if (window.__csxPagePanelReady) return;
  window.__csxPagePanelReady = true;

  const HOST_ID = "csx-page-panel-host";
  const STYLE_ID = "csx-page-panel-style";
  const FRAME_ID = "csx-page-panel-frame";
  const HANDLE_CLASS = "csx-panel-resize-handle";
  const PANEL_MIN = 25;
  const PANEL_MAX = 75;
  const PANEL_DEFAULT = 25;

  function clampPercent(n) {
    return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Number(n) || PANEL_DEFAULT));
  }

  function panelWidthPx(pct) {
    return Math.max(320, Math.round(window.innerWidth * (clampPercent(pct) / 100)));
  }

  function percentFromPx(widthPx) {
    return clampPercent(Math.round((widthPx / window.innerWidth) * 100));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html.csx-panel-open {
        /* Panel overlays the page — do not shift site content left */
      }
      #${HOST_ID} {
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        height: 100dvh;
        z-index: 2147483646;
        background: #0a0a10;
        border-left: 1px solid rgba(255,255,255,0.1);
        box-shadow: -10px 0 36px rgba(0,0,0,0.38);
        transition: width 0.18s ease;
      }
      #${HOST_ID} .${HANDLE_CLASS} {
        position: absolute;
        left: 0;
        top: 0;
        width: 10px;
        height: 100%;
        cursor: ew-resize;
        z-index: 3;
        touch-action: none;
      }
      #${HOST_ID} .${HANDLE_CLASS}::after {
        content: "";
        position: absolute;
        left: 3px;
        top: 50%;
        width: 2px;
        height: 48px;
        transform: translateY(-50%);
        border-radius: 999px;
        background: rgba(29, 155, 240, 0.55);
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      #${HOST_ID}:hover .${HANDLE_CLASS}::after,
      #${HOST_ID}.csx-dragging .${HANDLE_CLASS}::after {
        opacity: 1;
      }
      #${HOST_ID} iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function getHost() {
    return document.getElementById(HOST_ID);
  }

  function getFrame() {
    return document.getElementById(FRAME_ID);
  }

  function applyPageInset(widthPx) {
    document.documentElement.classList.add("csx-panel-open");
    document.documentElement.style.setProperty("--csx-panel-width", `${widthPx}px`);
  }

  function clearPageInset() {
    document.documentElement.classList.remove("csx-panel-open");
    document.documentElement.style.removeProperty("--csx-panel-width");
  }

  function notifyFrame(type, payload) {
    const frame = getFrame();
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ type, ...payload }, "*");
  }

  function bindResizeHandle(host) {
    if (host.dataset.resizeBound) return;
    host.dataset.resizeBound = "1";

    let handle = host.querySelector(`.${HANDLE_CLASS}`);
    if (!handle) {
      handle = document.createElement("div");
      handle.className = HANDLE_CLASS;
      handle.setAttribute("aria-label", "Resize panel");
      host.insertBefore(handle, host.firstChild);
    }

    let dragging = false;
    let activePointerId = null;

    const applyWidthFromPointer = (clientX) => {
      const widthPx = Math.max(320, window.innerWidth - clientX);
      const pct = percentFromPx(widthPx);
      host.dataset.widthPct = String(pct);
      host.style.width = `${widthPx}px`;
      document.documentElement.style.setProperty("--csx-panel-width", `${widthPx}px`);
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      activePointerId = null;
      host.classList.remove("csx-dragging");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const pct = percentFromPx(host.offsetWidth);
      host.dataset.widthPct = String(pct);
      notifyFrame("CSX_HOST_RESIZED", { pct, widthPx: host.offsetWidth });
    };

    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      activePointerId = e.pointerId;
      handle.setPointerCapture(e.pointerId);
      host.classList.add("csx-dragging");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ew-resize";
    });

    handle.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== activePointerId) return;
      e.preventDefault();
      applyWidthFromPointer(e.clientX);
    });

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    handle.addEventListener("lostpointercapture", endDrag);
  }

  function setPanelWidth(pct) {
    ensureStyles();
    const widthPx = panelWidthPx(pct);
    let host = getHost();

    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      const iframe = document.createElement("iframe");
      iframe.id = FRAME_ID;
      iframe.src = chrome.runtime.getURL("app.html?embed=1");
      iframe.allow = "clipboard-read; clipboard-write";
      host.appendChild(iframe);
      document.documentElement.appendChild(host);
    }

    host.dataset.widthPct = String(clampPercent(pct));
    host.style.width = `${widthPx}px`;
    host.style.display = "block";
    bindResizeHandle(host);
    applyPageInset(widthPx);
    notifyFrame("CSX_HOST_RESIZED", { pct: clampPercent(pct), widthPx });
    return { ok: true, widthPx, widthPercent: clampPercent(pct) };
  }

  function openPanel(widthPercent) {
    return setPanelWidth(widthPercent ?? PANEL_DEFAULT);
  }

  function closePanel() {
    const host = getHost();
    if (host) host.remove();
    clearPageInset();
    return { ok: true };
  }

  function relayRuntimeFromFrame(event) {
    const data = event.data;
    if (!data || data.type !== "CSX_RUNTIME_SEND") return;

    const frame = getFrame();
    if (!frame?.contentWindow || event.source !== frame.contentWindow) return;

    chrome.runtime.sendMessage(data.message, (response) => {
      frame.contentWindow.postMessage(
        {
          type: "CSX_RUNTIME_REPLY",
          requestId: data.requestId,
          response: response ?? null,
          error: chrome.runtime.lastError?.message || null,
        },
        "*"
      );
    });
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data.type !== "string") return;
    if (data.type === "CSX_RESIZE") setPanelWidth(data.pct);
    if (data.type === "CSX_CLOSE") closePanel();
    if (data.type === "CSX_RUNTIME_SEND") relayRuntimeFromFrame(event);
  });

  window.addEventListener("resize", () => {
    const host = getHost();
    if (!host) return;
    const current = parseInt(host.dataset.widthPct || String(PANEL_DEFAULT), 10);
    setPanelWidth(current);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "OPEN_INPAGE_PANEL") {
      try {
        const host = getHost();
        if (host) host.dataset.widthPct = String(clampPercent(message.widthPercent ?? PANEL_DEFAULT));
        sendResponse(openPanel(message.widthPercent ?? PANEL_DEFAULT));
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return true;
    }

    if (message.type === "RESIZE_INPAGE_PANEL") {
      try {
        const host = getHost();
        if (host) host.dataset.widthPct = String(clampPercent(message.widthPercent ?? PANEL_DEFAULT));
        sendResponse(setPanelWidth(message.widthPercent ?? PANEL_DEFAULT));
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return true;
    }

    if (message.type === "CLOSE_INPAGE_PANEL") {
      try {
        sendResponse(closePanel());
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return true;
    }

    if (message.type === "PING_PAGE_PANEL") {
      sendResponse({ ok: true, open: Boolean(getHost()) });
      return true;
    }

    return false;
  });
})();
