/**
 * Safe chrome.runtime.sendMessage — works in popup, side panel, and embed iframe
 * (embed relays via page-panel.js content script on the host tab).
 */
(function () {
  let requestId = 0;
  /** @type {Map<number, { resolve: Function, reject: Function }>} */
  const pending = new Map();

  function isEmbedPanel() {
    return location.search.includes("embed=1");
  }

  function canUseRuntime() {
    return typeof chrome !== "undefined" && typeof chrome.runtime?.sendMessage === "function";
  }

  function runtimeSend(message) {
    const timeoutMs =
      message?.type === "CHAT" || message?.type === "DESCRIBE_IMAGE" ? 300000 : 120000;

    const withTimeout = (promise) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Зв'язок з розширенням перервався (таймаут). F5 на сторінці."));
        }, timeoutMs);
        promise
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      });

    if (canUseRuntime()) {
      return withTimeout(
        new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(message, (response) => {
              const err = chrome.runtime.lastError;
              if (err) {
                const msg = err.message || "Extension error";
                reject(
                  new Error(
                    msg.includes("parsed") || msg.includes("empty")
                      ? "Зв'язок з розширенням перервався. Reload на chrome://extensions"
                      : msg
                  )
                );
                return;
              }
              if (!response) {
                reject(new Error("Розширення не відповіло. Reload на chrome://extensions"));
                return;
              }
              resolve(response);
            });
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        })
      );
    }

    if (isEmbedPanel() && window.parent !== window) {
      return withTimeout(
        new Promise((resolve, reject) => {
          const id = ++requestId;
          pending.set(id, { resolve, reject });
          window.parent.postMessage({ type: "CSX_RUNTIME_SEND", requestId: id, message }, "*");
        })
      );
    }

    return Promise.reject(
      new Error("API Chrome недоступний. Перезавантажте розширення на chrome://extensions")
    );
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "CSX_RUNTIME_REPLY") return;
    const p = pending.get(data.requestId);
    if (!p) return;
    pending.delete(data.requestId);
    if (data.error) {
      p.reject(new Error(data.error));
      return;
    }
    if (!data.response) {
      p.reject(new Error("Розширення не відповіло"));
      return;
    }
    p.resolve(data.response);
  });

  globalThis.extensionRuntimeSend = runtimeSend;
  globalThis.canUseExtensionRuntime = canUseRuntime;
  globalThis.isEmbedPanel = isEmbedPanel;
})();
