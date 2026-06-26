const APP_VERSION = "1.34.8";

let chatStatusTicker = null;
let hostedWarmAt = 0;
let hostedWarmPromise = null;
let hostedKeepAliveTimer = null;
const HOSTED_WARM_TTL_MS = 4 * 60 * 1000;

function clearChatStatusTicker() {
  if (chatStatusTicker) {
    clearInterval(chatStatusTicker);
    chatStatusTicker = null;
  }
}

function startChatStatusTicker(_provider, _model) {
  clearChatStatusTicker();
  setStatus(t("aiThinking"), "");
}

const DEFAULT_SETTINGS = {
  uiLang: "en",
  aiConnectionMode: "own",
  aiOwnProvider: "gemini",
  ownApiKeys: {},
  ownModels: {},
  aiProvider: "hosted",
  hostedApiUrl:
    typeof EXTENSION_CONFIG !== "undefined" ? EXTENSION_CONFIG.hostedApiUrl : "http://localhost:8787",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash-lite",
  openrouterApiKey: "",
  openrouterModel: "anthropic/claude-3.5-haiku",
  openaiApiKey: "",
  anthropicApiKey: "",
  whisperLang: "auto",
  postLang: "uk",
  postStyle: "punchy",
  postLength: "auto",
  emojiMode: "light",
  perspective: "auto",
  temperature: 0.85,
  customInstructions: "",
  panelWidthPercent: 25,
};

/** @type {{ id: string, type: string, name: string, content: string, status: string }[]} */
let sources = [];
let chatHistory = [];
let isBusy = false;
let activeChatAbort = null;
let chatOpGen = 0;
const CHAT_HISTORY_KEY = "chatHistorySnapshot";
let sourceIdCounter = 0;
let uiLang = "en";
let ownApiKeysCache = {};
let ownModelsCache = {};
let ownProviderBeforeChange = "";

const SOURCE_ICONS = {
  video: "🎬",
  audio: "🎵",
  text: "📄",
  paste: "📝",
  image: "🖼️",
};

const $ = (id) => document.getElementById(id);
function t(key, vars) {
  try {
    return I18n.t(key, vars);
  } catch {
    return key;
  }
}

function runtimeSend(message) {
  if (typeof globalThis.extensionRuntimeSend === "function") {
    return globalThis.extensionRuntimeSend(message);
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Extension error"));
          return;
        }
        if (!response) {
          reject(new Error("Розширення не відповіло"));
          return;
        }
        resolve(response);
      });
    });
  }
  return Promise.reject(
    new Error("API Chrome недоступний. Перезавантажте розширення на chrome://extensions")
  );
}

function getHostedApiBase(settings) {
  return (settings?.hostedApiUrl || EXTENSION_CONFIG?.hostedApiUrl || "http://localhost:8787").replace(
    /\/$/,
    ""
  );
}

function getHostedApiBases(settings) {
  const primary = getHostedApiBase(settings);
  const bases = [primary];
  const allowLocal =
    (typeof EXTENSION_CONFIG !== "undefined" && EXTENSION_CONFIG.localDevFallback === true) ||
    settings?.localDevFallback === true;
  if (allowLocal && !/localhost|127\.0\.0\.1/.test(primary)) {
    bases.push("http://localhost:8787");
  }
  return bases;
}

function hostedApiHeaders(base) {
  const headers = {
    "Content-Type": "application/json",
    "X-Client-Id": chrome.runtime.id || "unknown",
  };
  if (base.includes("loca.lt")) {
    headers["Bypass-Tunnel-Reminder"] = "true";
  }
  return headers;
}

function shouldSuppressStatusError(text) {
  const msg = String(text || "");
  if (msg === "__silent_ai__") return true;
  if (/gemini|openai|anthropic|cursor|api key|quota|rate limit|high demand|overloaded|try again|experiencing|403|429|502|503|forbidden|resource.?exhausted/i.test(msg)) {
    return true;
  }
  return /importScripts|WorkerGlobalScope|service worker/i.test(msg);
}

function formatApiError(status, data, base) {
  const raw = data?.error || "";
  if (/Ліміт сервера|Daily limit reached/i.test(raw)) {
    return t("aiSharedUnavailable");
  }
  if (/Ліміт Gemini|quota|rate limit|resource.?exhausted|зайнят|overloaded|хмарн/i.test(raw)) {
    return t("aiSharedUnavailable");
  }
  if (/gemini-1\.5|not found for API version|not supported for generateContent/i.test(raw)) {
    return "Сервер AI застарів. Перезапустіть у терміналі: cd server && npm start";
  }
  if (/high demand|overloaded|try again later/i.test(raw)) {
    return t("aiSharedUnavailable");
  }
  if (status === 503) {
    if (base.includes("localhost") || base.includes("127.0.0.1")) {
      return "Локальний сервер AI не запущений. У терміналі: cd server && npm start";
    }
    return t("aiSharedUnavailable");
  }
  if (status === 502) {
    return t("aiSharedUnavailable");
  }
  if (status === 404) {
    if (base.includes("localhost") || base.includes("127.0.0.1")) {
      return "Локальний сервер застарів. Перезапустіть: cd server && npm start";
    }
    return t("serverWrongUrl");
  }
  if (status === 429) {
    return t("aiSharedUnavailable");
  }
  if (status === 403) {
    return t("aiSharedUnavailable");
  }
  if (status === 413) {
    return t("chatHistoryTooLong");
  }
  return raw || `API помилка (${status})`;
}

function wrapNetworkError(err) {
  const msg = err?.message || String(err);
  if (/failed to fetch|networkerror|network error|load failed|err_connection_refused/i.test(msg)) {
    return new Error("__silent_ai__");
  }
  return err instanceof Error ? err : new Error(msg);
}

function isRetryableAiError(status, raw) {
  const msg = String(raw || "");
  return (
    status === 403 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    /Ліміт Gemini|тимчасово зайнятий|high demand|overloaded|quota|rate limit|resource.?exhausted|зачекайте|forbidden/i.test(
      msg
    )
  );
}

function retryWaitSec(status, data, _raw) {
  if (data?.retryAfterSec) return Math.min(8, Math.max(2, Number(data.retryAfterSec)));
  if (status === 429 || status === 503) return 4;
  return 2;
}

async function hostedApiPost(path, body, settings, timeoutMs = 45000, externalSignal) {
  const bases = getHostedApiBases(settings);
  const deadline = Date.now() + 95000;
  let lastError = null;

  for (const base of bases) {
    for (let rateTry = 0; rateTry < 4; rateTry++) {
      if (externalSignal?.aborted) {
        throw new Error("__chat_aborted__");
      }
      if (Date.now() >= deadline) {
        throw new Error(t("aiSharedBusy"));
      }
      const remaining = Math.max(5000, deadline - Date.now());
      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
      try {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: hostedApiHeaders(base),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const rawText = await response.text();
        let data = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = {};
        }
        if (!response.ok) {
          const raw =
            data?.error ||
            (rawText && rawText.length < 240 && !/<html/i.test(rawText) ? rawText.trim() : "");
          if (isRetryableAiError(response.status, raw) && rateTry === 0 && Date.now() < deadline) {
            const sec = retryWaitSec(response.status, data, raw);
            setStatus(t("aiThinking"));
            await new Promise((r) => setTimeout(r, sec * 1000 + 200));
            continue;
          }
          const err = new Error(formatApiError(response.status, data, base));
          const baseIdx = bases.indexOf(base);
          const hasNextBase = baseIdx >= 0 && baseIdx < bases.length - 1;
          if (hasNextBase && (response.status === 429 || response.status === 503 || isRetryableAiError(response.status, raw))) {
            lastError = err;
            break;
          }
          if ((response.status === 503 || response.status === 404) && hasNextBase) {
            lastError = err;
            break;
          }
          if (isRetryableAiError(response.status, raw)) {
            if (rateTry < 1 && Date.now() < deadline) {
              setStatus(t("aiThinking"));
              await new Promise((r) => setTimeout(r, retryWaitSec(response.status, data, raw) * 1000 + 300));
              continue;
            }
            throw new Error(t("aiSharedBusy"));
          }
          throw err;
        }
        return data;
      } catch (err) {
        if (externalSignal?.aborted || err.message === "__chat_aborted__") {
          throw new Error("__chat_aborted__");
        }
        if (err.name === "AbortError") {
          throw new Error(t("aiTimeout"));
        }
        if (bases.length > 1 && /503|fetch|tunnel|localhost|127\.0\.0\.1|Failed to fetch/i.test(err.message)) {
          lastError = wrapNetworkError(err);
          break;
        }
        throw wrapNetworkError(err);
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  throw lastError || new Error(t("aiSharedBusy"));
}

async function warmHostedServer(options = {}) {
  if (getAiConnectionMode() !== "shared") return true;
  if (Date.now() - hostedWarmAt < HOSTED_WARM_TTL_MS) return true;
  if (hostedWarmPromise) return hostedWarmPromise;

  const showStatus = options.showStatus === true;
  hostedWarmPromise = (async () => {
    const settings = await getSettings();
    const bases = getHostedApiBases(settings);
    if (showStatus) setStatus(t("serverWaking"), "");

    for (const base of bases) {
      try {
        const r = await fetch(`${base}/health`, {
          signal: AbortSignal.timeout(90000),
          headers: hostedApiHeaders(base),
        });
        if (!r.ok) continue;
        const data = await r.json().catch(() => ({}));
        if (data.ok !== false) {
          hostedWarmAt = Date.now();
          if (showStatus) {
            setStatus(t("serverReady"), "success");
            setTimeout(() => setStatus("", ""), 1800);
          }
          return true;
        }
      } catch (err) {
        console.warn("warmHostedServer", base, err?.message || err);
      }
    }
    return false;
  })().finally(() => {
    hostedWarmPromise = null;
  });

  return hostedWarmPromise;
}

function startHostedKeepAlive() {
  if (hostedKeepAliveTimer) clearInterval(hostedKeepAliveTimer);
  if (getAiConnectionMode() !== "shared") return;
  hostedKeepAliveTimer = setInterval(
    () => void warmHostedServer({ showStatus: false }),
    HOSTED_WARM_TTL_MS - 45 * 1000
  );
}

function stopHostedKeepAlive() {
  if (hostedKeepAliveTimer) {
    clearInterval(hostedKeepAliveTimer);
    hostedKeepAliveTimer = null;
  }
}

function getSharedDirectGeminiKey() {
  const cfg =
    typeof EXTENSION_CONFIG !== "undefined" ? EXTENSION_CONFIG.sharedGeminiApiKey : "";
  return String(cfg || "").trim();
}

function isSharedQuotaError(err) {
  const msg = String(err?.message || "");
  return (
    msg === "__silent_ai__" ||
    msg === t("aiSharedUnavailable") ||
    msg === t("aiSharedBusy") ||
    msg === t("chatHistoryTooLong") ||
    /gemini|quota|ліміт|зайнят|busy|429|403|forbidden|api помилка|rate limit|resource.?exhausted|high demand|overloaded|try again|experiencing|тимчасово недоступн|тимчасово зайнят/i.test(
      msg
    )
  );
}

function isRetryableSharedError(err) {
  return isSharedQuotaError(err);
}

async function callSharedGeminiDirect(sources, settings, history, signal, apiKey) {
  await ensureAiReady();
  const fn = getAiChatFn();
  if (typeof fn !== "function") {
    throw new Error("__no_ai_client__");
  }
  const directSettings = {
    ...settings,
    aiProvider: "gemini",
    ownApiKeys: { ...(settings.ownApiKeys || {}), gemini: apiKey },
    geminiModel:
      settings.geminiModel || settings.ownModels?.gemini || "gemini-2.5-flash",
  };
  return fn(sources, directSettings, history, signal);
}

async function hostedChatDirect(sources, settings, history, signal) {
  const directKey = getSharedDirectGeminiKey();
  if (directKey) {
    return callSharedGeminiDirect(sources, settings, history, signal, directKey);
  }

  if (Date.now() - hostedWarmAt >= HOSTED_WARM_TTL_MS) {
    setStatus(t("aiThinking"));
    await warmHostedServer({ showStatus: false });
  }

  setStatus(t("aiThinking"));
  const data = await hostedApiPost(
    "/v1/chat",
    { sources, settings, history: trimHistoryForApi(history) },
    settings,
    90000,
    signal
  );
  if (!data.text?.trim()) throw new Error("Empty AI response");
  return data.text.trim();
}

async function hostedDescribeDirect(imageBase64, settings) {
  const data = await hostedApiPost("/v1/describe-image", { imageBase64, settings }, settings);
  if (!data.text?.trim()) throw new Error("Empty AI response");
  return data.text.trim();
}

function mergeAbortSignals(userSignal, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return userSignal;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  userSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onAbort);
    },
    { once: true }
  );
  if (userSignal?.aborted) controller.abort();
  return controller.signal;
}

function getAiChatFn() {
  return globalThis.chatWithSources || (typeof window !== "undefined" ? window.chatWithSources : undefined);
}

function getAiDescribeFn() {
  return globalThis.describeImage || (typeof window !== "undefined" ? window.describeImage : undefined);
}

function extensionScriptUrl(name) {
  if (typeof chrome?.runtime?.getURL === "function") {
    return chrome.runtime.getURL(name);
  }
  return new URL(name, location.href).href;
}

function loadExtensionScript(name) {
  const url = extensionScriptUrl(name);
  const existing = [...document.querySelectorAll("script[src]")].find(
    (s) => s.src === url || s.src.endsWith(`/${name}`)
  );
  if (existing) {
    existing.dataset.csxAi = name;
    if (!existing.dataset.loaded) existing.dataset.loaded = "1";
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.dataset.csxAi = name;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`${name} load failed`));
    document.head.appendChild(s);
  });
}

async function loadAiClientIfMissing() {
  if (typeof getAiChatFn() === "function") return true;
  const chain = ["prompt-hints.js", "ai-providers.js", "ai-client.js"];
  for (const file of chain) {
    if (typeof getAiChatFn() === "function") return true;
    try {
      await loadExtensionScript(file);
    } catch (err) {
      console.warn(`loadAiClientIfMissing ${file}:`, err);
    }
  }
  return typeof getAiChatFn() === "function";
}

async function forceReloadAiClient() {
  ["ai-client.js", "ai-providers.js", "prompt-hints.js"].forEach((name) => {
    document.querySelectorAll(`script[src*="${name}"]`).forEach((el) => el.remove());
  });
  return loadAiClientIfMissing();
}

function ensureAiClientLoaded() {
  return typeof getAiChatFn() === "function";
}

async function ensureAiReady() {
  if (typeof getAiChatFn() === "function") return true;
  if (await loadAiClientIfMissing()) return true;
  return forceReloadAiClient();
}

function normalizeCursorModelSetting(model) {
  const m = String(model || "")
    .trim()
    .toLowerCase();
  const aliases = {
    composer: "composer-2.5",
    "composer-2": "composer-2.5",
    "composer-latest": "composer-2.5",
    "composer-2-5": "composer-2.5",
    "claude-4-sonnet-thinking": "claude-opus-4-8",
    "gpt-4o": "composer-2.5",
    "gemini-2.5-flash": "composer-2.5",
  };
  if (aliases[m]) return aliases[m];
  return model?.trim() || "composer-2.5";
}

async function callChatViaBackground(sources, settings, history, provider) {
  await runtimeSend({ type: "WAKE_WORKER" }).catch(() => {});
  const res = await withChatTimeout(
    runtimeSend({ type: "CHAT", sources, settings, history }),
    provider
  );
  if (res?.error) throw new Error(res.error);
  if (!res?.text?.trim()) throw new Error("Порожня відповідь AI");
  return res.text;
}

async function callChatWithSources(sources, settings, history, signal) {
  const provider =
    settings.aiConnectionMode === "shared" || getAiConnectionMode() === "shared"
      ? "hosted"
      : settings.aiProvider || "hosted";
  settings = { ...settings, aiProvider: provider };

  const runInPage = async () => {
    await ensureAiReady();
    const fn = getAiChatFn();
    if (typeof fn !== "function") {
      throw new Error("__no_ai_client__");
    }
    return fn(sources, settings, history, signal);
  };

  const runInBackground = () => callChatViaBackground(sources, settings, history, provider);

  // Cursor runs in-page (iframe stays alive). ai-client.js must load — see prompt-hints before it in app.html.
  if (provider === "cursor") {
    await ensureAiReady();
    const fn = getAiChatFn();
    if (typeof fn !== "function") {
      throw new Error(
        "AI модуль не завантажився. Reload розширення на chrome://extensions (↻) і ⌘+R на сторінці."
      );
    }
    return fn(sources, settings, history, signal);
  }

  if (provider === "hosted") {
    return hostedChatDirect(sources, settings, history, signal);
  }

  try {
    return await runInPage();
  } catch (inPageErr) {
    if (inPageErr?.message === "__chat_aborted__") throw inPageErr;
    console.warn("In-page AI failed, retrying via background:", inPageErr);
    try {
      return await runInBackground();
    } catch (bgErr) {
      const msg = bgErr?.message || inPageErr?.message || "AI помилка";
      if (msg === "__no_ai_client__") {
        throw new Error(
          "AI модуль не завантажився. Натисніть ↻ на chrome://extensions і перезавантажте сторінку."
        );
      }
      throw new Error(msg);
    }
  }
}

function withChatTimeout(promise, provider) {
  const ms = provider === "cursor" ? 240000 : 120000;
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("AI не відповів вчасно. Перевірте API ключ і модель.")),
        ms
      )
    ),
  ]);
}

async function callDescribeViaBackground(imageBase64, settings) {
  await runtimeSend({ type: "WAKE_WORKER" }).catch(() => {});
  const res = await runtimeSend({ type: "DESCRIBE_IMAGE", imageBase64, settings });
  if (res?.error) throw new Error(res.error);
  if (!res?.text?.trim()) throw new Error("Порожня відповідь AI");
  return res.text;
}

async function callDescribeImage(imageBase64, settings) {
  const provider = settings.aiProvider || "hosted";

  const runInPage = async () => {
    await ensureAiReady();
    const fn = getAiDescribeFn();
    if (typeof fn !== "function") {
      throw new Error("__no_ai_client__");
    }
    return fn(imageBase64, settings);
  };

  const runInBackground = () => callDescribeViaBackground(imageBase64, settings);

  if (provider === "hosted") {
    try {
      return await runInPage();
    } catch (inPageErr) {
      try {
        return await hostedDescribeDirect(imageBase64, settings);
      } catch (hostedErr) {
        console.warn("Hosted describe failed, retrying via background:", hostedErr);
        return runInBackground();
      }
    }
  }

  try {
    return await runInPage();
  } catch (inPageErr) {
    console.warn("In-page describe failed, retrying via background:", inPageErr);
    return runInBackground();
  }
}

const SETTINGS_SELECT_IDS = [
  "aiConnectionMode",
  "aiOwnProvider",
  "postLang",
  "whisperLang",
  "postStyle",
  "postLength",
  "emojiMode",
  "perspective",
  "temperature",
];

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void bootApp());
} else {
  void bootApp();
}

window.onLocaleApplied = () => {
  updateAiMode();
  populateOwnProviderSelect();
  updateAiProviderUI();
  renderSources();
  updateChatState();
  if (!$("chatMessages")?.querySelector(".msg")) {
    renderChatEmpty();
  }
};

async function bootApp() {
  try {
    await loadSettings();
    try {
      await loadAiClientIfMissing();
    } catch (err) {
      console.warn("loadAiClientIfMissing:", err);
    }
    await restoreChatHistory();
    if (!chatHistory.length) renderChatEmpty();
    renderSources();
    updateSettingsVersion();
    if (!document.body.classList.contains("mode-toolbar-popup")) {
      $("settingsDetails")?.setAttribute("open", "");
    } else {
      $("settingsDetails")?.removeAttribute("open");
    }
    applyLocale(false);
    bindEvents();
    if (!ensureAiClientLoaded()) {
      try {
        await loadAiClientIfMissing();
      } catch (err) {
        console.warn("AI module retry:", err);
      }
    }
    setStatus("", "");
    window.AppChrome?.setHeaderStatus("", "");
    void warmHostedServer({ showStatus: false });
    startHostedKeepAlive();
  } catch (err) {
    console.error("Content Studio init failed:", err);
    window.AppChrome?.setHeaderStatus(`Init: ${err.message}`, "error");
    setStatus(`Init: ${err.message}`, "error");
  }
}

function getUiLang() {
  return uiLang;
}

function syncAppSettingsLang(lang) {
  window.AppChrome?.syncAppSettingsLang?.(lang);
}

async function setUiLang(lang, persist = true) {
  if (!lang) return;
  uiLang = window.I18n?.normalizeUiLang?.(lang) || (lang === "uk" ? "uk" : "en");
  syncAppSettingsLang(uiLang);

  if (uiLang === "uk" && $("postLang")?.value === "auto") {
    setSelectValue("postLang", "uk");
  }

  if (typeof I18n !== "undefined") {
    I18n.setLocale(uiLang);
    document.documentElement.lang = uiLang;
    I18n.applyPageI18n();
    document.title = `${I18n.t("brandTitle")}`;
  }

  updateAiMode();
  populateOwnProviderSelect();
  renderSources();
  updateChatState();
  if (!$("chatMessages")?.querySelector(".msg")) {
    renderChatEmpty();
  }

  if (persist) {
    try {
      await saveSettingsQuiet();
      setStatus(t("settingsSaved"), "success");
    } catch (err) {
      setStatus(err.message, "error");
    }
  }
}

function updateSettingsVersion() {
  const el = $("settingsVersion");
  if (el) el.textContent = `v${APP_VERSION}`;
  const winVer = $("windowVersion");
  if (winVer) winVer.textContent = `v${APP_VERSION}`;
}

function setSelectValue(id, value) {
  const el = $(id);
  if (!el || value == null) return;
  if ([...el.options].some((opt) => opt.value === value)) {
    el.value = value;
  }
}

async function loadSettings() {
  let settings = {};
  try {
    const stored = await chrome.storage.local.get("settings");
    settings = migrateAiSettings(stored.settings || {});
  } catch (_) {
    settings = migrateAiSettings({});
  }

  uiLang = settings.uiLang ?? (typeof I18n !== "undefined" ? I18n.detectLocale() : "en");
  uiLang = I18n?.normalizeUiLang?.(uiLang) || uiLang;
  window.__uiLang = uiLang;
  syncAppSettingsLang(uiLang);

  ownApiKeysCache = { ...(settings.ownApiKeys || {}) };
  ownModelsCache = { ...(settings.ownModels || {}) };
  if (settings.geminiApiKey && !ownApiKeysCache.gemini) ownApiKeysCache.gemini = settings.geminiApiKey;
  if (settings.geminiModel && !ownModelsCache.gemini) ownModelsCache.gemini = settings.geminiModel;
  if (settings.openrouterApiKey && !ownApiKeysCache.openrouter) {
    ownApiKeysCache.openrouter = settings.openrouterApiKey;
  }
  if (settings.openrouterModel && !ownModelsCache.openrouter) {
    ownModelsCache.openrouter = settings.openrouterModel;
  }
  if (settings.openaiApiKey && !ownApiKeysCache.openai) ownApiKeysCache.openai = settings.openaiApiKey;
  if (settings.anthropicApiKey && !ownApiKeysCache.anthropic) {
    ownApiKeysCache.anthropic = settings.anthropicApiKey;
  }
  if (settings.cursorApiKey && !ownApiKeysCache.cursor) ownApiKeysCache.cursor = settings.cursorApiKey;
  if (settings.groqApiKey && !ownApiKeysCache.groq) ownApiKeysCache.groq = settings.groqApiKey;
  if (settings.mistralApiKey && !ownApiKeysCache.mistral) ownApiKeysCache.mistral = settings.mistralApiKey;
  if (settings.deepseekApiKey && !ownApiKeysCache.deepseek) {
    ownApiKeysCache.deepseek = settings.deepseekApiKey;
  }
  if (ownModelsCache.cursor === "composer-2") ownModelsCache.cursor = "composer-2.5";

  setSelectValue("whisperLang", settings.whisperLang ?? DEFAULT_SETTINGS.whisperLang);
  setSelectValue(
    "postLang",
    settings.postLang ?? (uiLang === "uk" ? "uk" : DEFAULT_SETTINGS.postLang)
  );
  setSelectValue("postStyle", settings.postStyle ?? DEFAULT_SETTINGS.postStyle);
  setSelectValue("postLength", settings.postLength ?? DEFAULT_SETTINGS.postLength);
  setSelectValue("emojiMode", settings.emojiMode ?? DEFAULT_SETTINGS.emojiMode);
  setSelectValue("perspective", settings.perspective ?? DEFAULT_SETTINGS.perspective);
  setSelectValue("temperature", String(settings.temperature ?? DEFAULT_SETTINGS.temperature));
  setSelectValue("aiConnectionMode", settings.aiConnectionMode ?? DEFAULT_SETTINGS.aiConnectionMode);

  populateOwnProviderSelect();
  setSelectValue("aiOwnProvider", settings.aiOwnProvider ?? DEFAULT_SETTINGS.aiOwnProvider);
  syncOwnProviderFieldsFromCache();

  const custom = $("customInstructions");
  if (custom) custom.value = settings.customInstructions ?? DEFAULT_SETTINGS.customInstructions;

  const rawPct = settings.panelWidthPercent ?? DEFAULT_SETTINGS.panelWidthPercent;
  const widthPct =
    typeof globalThis.clampPanelPercent === "function"
      ? globalThis.clampPanelPercent(rawPct)
      : Math.min(75, Math.max(25, Number(rawPct) || 25));
  if ($("panelWidthSlider")) $("panelWidthSlider").value = String(widthPct);
  if ($("panelWidthValue")) $("panelWidthValue").textContent = `${widthPct}%`;

  updateAiProviderUI();
}

function migrateAiSettings(settings) {
  const s = { ...settings };
  const keys = { ...(s.ownApiKeys || {}) };
  if (s.geminiApiKey) keys.gemini = s.geminiApiKey;
  if (s.openrouterApiKey) keys.openrouter = s.openrouterApiKey;
  if (s.openaiApiKey) keys.openai = s.openaiApiKey;
  if (s.anthropicApiKey) keys.anthropic = s.anthropicApiKey;
  if (s.cursorApiKey) keys.cursor = s.cursorApiKey;
  if (s.groqApiKey) keys.groq = s.groqApiKey;
  if (s.mistralApiKey) keys.mistral = s.mistralApiKey;
  if (s.deepseekApiKey) keys.deepseek = s.deepseekApiKey;
  s.ownApiKeys = keys;

  if (s.aiConnectionMode === "shared" || s.aiConnectionMode === "own") {
    if (s.aiConnectionMode === "own" && !s.aiOwnProvider) {
      s.aiOwnProvider =
        s.aiProvider && s.aiProvider !== "hosted" ? s.aiProvider : DEFAULT_SETTINGS.aiOwnProvider;
    }
    return s;
  }

  if (s.aiProvider === "hosted") {
    s.aiConnectionMode = "shared";
    return s;
  }

  const hasAnyOwnKey = Object.values(keys).some((k) => String(k || "").trim());
  if (
    hasAnyOwnKey ||
    (s.aiProvider &&
      s.aiProvider !== "hosted" &&
      ["gemini", "openrouter", "openai", "anthropic", "cursor", "groq", "mistral", "deepseek"].includes(
        s.aiProvider
      ))
  ) {
    s.aiConnectionMode = "own";
    s.aiOwnProvider =
      s.aiOwnProvider ||
      (s.aiProvider && s.aiProvider !== "hosted" ? s.aiProvider : DEFAULT_SETTINGS.aiOwnProvider);
    s.ownModels = { ...(s.ownModels || {}) };
    if (s.geminiModel) s.ownModels.gemini = s.geminiModel;
    if (s.openrouterModel) s.ownModels.openrouter = s.openrouterModel;
  } else {
    s.aiConnectionMode = "shared";
  }
  return s;
}

function getAiConnectionMode() {
  return $("aiConnectionMode")?.value || DEFAULT_SETTINGS.aiConnectionMode;
}

function getAiOwnProvider() {
  return $("aiOwnProvider")?.value || DEFAULT_SETTINGS.aiOwnProvider;
}

function resolveAiProvider() {
  return getAiConnectionMode() === "shared" ? "hosted" : getAiOwnProvider();
}

function getAiProvider() {
  return resolveAiProvider();
}

function populateOwnProviderSelect() {
  const sel = $("aiOwnProvider");
  if (!sel) return;
  const lang = uiLang === "uk" ? "Uk" : "En";
  const prev = sel.value;
  const order = [
    "gemini",
    "openai",
    "anthropic",
    "groq",
    "mistral",
    "deepseek",
    "openrouter",
    "cursor",
  ];
  sel.innerHTML = "";
  for (const id of order) {
    const p = globalThis.OWN_AI_PROVIDERS?.[id];
    if (!p) continue;
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p[`label${lang}`];
    sel.appendChild(opt);
  }
  if (prev && [...sel.options].some((o) => o.value === prev)) {
    sel.value = prev;
  }
}

function saveCurrentOwnToCache() {
  const p = getAiOwnProvider();
  if (!p) return;
  ownApiKeysCache[p] = $("ownApiKey")?.value?.trim() || "";
}

function getOwnModelValue(provider) {
  const p = provider || getAiOwnProvider();
  const meta = globalThis.OWN_AI_PROVIDERS?.[p];
  let m = ownModelsCache[p]?.trim() || meta?.defaultModel || "";
  if (p === "cursor") m = normalizeCursorModelSetting(m);
  return m;
}

function ensureOwnModelDefaults(provider) {
  const p = provider || getAiOwnProvider();
  const meta = globalThis.OWN_AI_PROVIDERS?.[p];
  if (!ownModelsCache[p]?.trim() && meta?.defaultModel) {
    ownModelsCache[p] =
      p === "cursor" ? normalizeCursorModelSetting(meta.defaultModel) : meta.defaultModel;
  }
}

function ensureOwnConnectionMode() {
  const modeEl = $("aiConnectionMode");
  if (!modeEl || modeEl.value === "own") return false;
  modeEl.value = "own";
  updateAiProviderUI();
  return true;
}

function syncOwnProviderFieldsFromCache() {
  const p = getAiOwnProvider();
  const meta = globalThis.OWN_AI_PROVIDERS?.[p];
  ensureOwnModelDefaults(p);
  const keyEl = $("ownApiKey");
  if (keyEl) keyEl.value = ownApiKeysCache[p] || "";

  const hint = $("ownApiKeyHint");
  if (hint && meta) {
    const hintText = uiLang === "uk" ? meta.keyHintUk : meta.keyHintEn;
    if (meta.keyUrl) {
      hint.innerHTML = "";
      const link = document.createElement("a");
      link.href = meta.keyUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = hintText;
      hint.appendChild(link);
    } else {
      hint.textContent = hintText;
    }
  }
}

function isAiConfigured() {
  if (getAiConnectionMode() === "shared") return true;
  const p = getAiOwnProvider();
  return Boolean($("ownApiKey")?.value?.trim() || ownApiKeysCache[p]?.trim());
}

function updateAiProviderUI() {
  const shared = getAiConnectionMode() === "shared";
  const own = !shared;
  $("aiSharedHint")?.classList.toggle("hidden", !shared);
  $("aiOwnBlock")?.classList.toggle("hidden", shared);
  $("aiModeHint")?.classList.toggle("hidden", shared || own);

  if (!shared) syncOwnProviderFieldsFromCache();
}

globalThis.updateAiProviderUI = updateAiProviderUI;
globalThis.populateOwnProviderSelect = populateOwnProviderSelect;

async function testOwnApi() {
  saveCurrentOwnToCache();
  if (!isAiConfigured()) {
    setStatus(t("ownApiKeyRequired"), "error");
    return;
  }
  if (getAiConnectionMode() === "shared") {
    setStatus(t("testApiOwnOnly"), "error");
    return;
  }
  setBusy(true);
  setStatus(t("aiThinking"));
  const provider = getAiOwnProvider();
  const testAbort = new AbortController();
  const testMs = provider === "cursor" ? 200000 : 90000;
  const testTimer = setTimeout(() => testAbort.abort(), testMs);
  try {
    const settings = await getSettings();
    settings.chatMode = "qa";
    const reply = await callChatWithSources(
      [],
      settings,
      [{ role: "user", content: "Reply with exactly: OK" }],
      testAbort.signal
    );
    setStatus(t("testApiOk").replace("{reply}", String(reply).slice(0, 80)), "success");
  } catch (err) {
    setStatus(formatOwnApiError(err?.message, provider), "error");
  } finally {
    clearTimeout(testTimer);
    setBusy(false);
  }
}

function openOwnKeySettings() {
  $("settingsDetails")?.setAttribute("open", "");
  setSelectValue("aiConnectionMode", "own");
  updateAiProviderUI();
  $("ownApiKey")?.focus();
  $("ownApiKey")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function applyLocale(showSavedStatus = false) {
  const lang = window.AppChrome?.getUiLang() || getUiLang() || I18n.getLocale() || I18n.detectLocale();
  uiLang = I18n?.normalizeUiLang?.(lang) || (lang === "uk" ? "uk" : "en");
  window.AppChrome?.applyUiLang(uiLang);
  syncAppSettingsLang(uiLang);
  I18n.setLocale(uiLang);
  document.documentElement.lang = uiLang;
  I18n.applyPageI18n();
  document.title = `${I18n.t("brandTitle")}`;
  updateAiMode();
  populateOwnProviderSelect();
  renderSources();
  updateChatState();
  if (!$("chatMessages")?.querySelector(".msg")) {
    renderChatEmpty();
  }
  updateSettingsVersion();
  if (showSavedStatus) {
    setStatus(t("settingsSaved"), "success");
  }
}

async function saveSettingsQuiet() {
  try {
    await chrome.storage.local.set({ settings: await getSettings() });
  } catch (err) {
    console.warn("saveSettingsQuiet:", err);
  }
}

async function saveSettings() {
  await saveSettingsQuiet();
  applyLocale(true);
}

async function getSettings() {
  saveCurrentOwnToCache();
  ensureOwnModelDefaults(getAiOwnProvider());
  const provider = resolveAiProvider();
  if (provider === "cursor") {
    ownModelsCache.cursor = normalizeCursorModelSetting(ownModelsCache.cursor || "composer-2.5");
  }
  const activeModel = getOwnModelValue();
  return {
    ...DEFAULT_SETTINGS,
    uiLang: window.AppChrome?.getUiLang() || getUiLang(),
    aiConnectionMode: getAiConnectionMode(),
    aiOwnProvider: getAiOwnProvider(),
    aiProvider: resolveAiProvider(),
    ownApiKeys: { ...ownApiKeysCache },
    ownModels: { ...ownModelsCache },
    ownApiKey: $("ownApiKey")?.value?.trim() ?? "",
    ownModel: activeModel,
    hostedApiUrl:
      typeof EXTENSION_CONFIG !== "undefined"
        ? EXTENSION_CONFIG.hostedApiUrl
        : DEFAULT_SETTINGS.hostedApiUrl,
    geminiApiKey: ownApiKeysCache.gemini ?? "",
    geminiModel: getOwnModelValue("gemini") || DEFAULT_SETTINGS.geminiModel,
    openrouterApiKey: ownApiKeysCache.openrouter ?? "",
    openrouterModel: getOwnModelValue("openrouter") || DEFAULT_SETTINGS.openrouterModel,
    openaiApiKey: ownApiKeysCache.openai ?? "",
    anthropicApiKey: ownApiKeysCache.anthropic ?? "",
    cursorApiKey: ownApiKeysCache.cursor ?? "",
    groqApiKey: ownApiKeysCache.groq ?? "",
    mistralApiKey: ownApiKeysCache.mistral ?? "",
    deepseekApiKey: ownApiKeysCache.deepseek ?? "",
    whisperLang: $("whisperLang")?.value ?? DEFAULT_SETTINGS.whisperLang,
    postLang: $("postLang")?.value ?? DEFAULT_SETTINGS.postLang,
    postStyle: $("postStyle")?.value ?? DEFAULT_SETTINGS.postStyle,
    postLength: $("postLength")?.value ?? DEFAULT_SETTINGS.postLength,
    emojiMode: $("emojiMode")?.value ?? DEFAULT_SETTINGS.emojiMode,
    perspective: $("perspective")?.value ?? DEFAULT_SETTINGS.perspective,
    temperature: Number($("temperature")?.value ?? DEFAULT_SETTINGS.temperature),
    customInstructions: $("customInstructions")?.value.trim() ?? "",
    panelWidthPercent: Number(
      $("panelWidthSlider")?.value ?? DEFAULT_SETTINGS.panelWidthPercent
    ),
  };
}

function updateAiMode() {
  updateAiProviderUI();
  if ($("chatMessages") && !$("chatMessages").querySelector(".msg")) {
    renderChatEmpty();
  }
  updateChatState();
}

function bindEvents() {
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLSelectElement)) return;

    if (SETTINGS_SELECT_IDS.includes(el.id)) {
      void saveSettingsQuiet();
    }
  });

  $("customInstructions")?.addEventListener("blur", () => saveSettingsQuiet());

  $("aiConnectionMode")?.addEventListener("change", () => {
    updateAiProviderUI();
    resetChatForProviderSwitch(getActiveAiLabel());
    void saveSettingsQuiet().then(() => {
      updateChatState();
      if (getAiConnectionMode() === "shared") {
        hostedWarmAt = 0;
        void warmHostedServer({ showStatus: false });
        startHostedKeepAlive();
      } else {
        stopHostedKeepAlive();
      }
    });
  });

  $("aiOwnProvider")?.addEventListener("mousedown", () => {
    ownProviderBeforeChange = getAiOwnProvider();
  });
  $("aiOwnProvider")?.addEventListener("change", () => {
    const prev = ownProviderBeforeChange || getAiOwnProvider();
    ownApiKeysCache[prev] = $("ownApiKey")?.value?.trim() || "";
    ownProviderBeforeChange = getAiOwnProvider();
    syncOwnProviderFieldsFromCache();
    updateAiProviderUI();
    if (getAiConnectionMode() === "own") {
      resetChatForProviderSwitch(getActiveAiLabel());
    }
    void saveSettingsQuiet().then(() => updateChatState());
  });

  $("ownApiKey")?.addEventListener("input", () => {
    if ($("ownApiKey")?.value?.trim()) ensureOwnConnectionMode();
    saveCurrentOwnToCache();
    void saveSettingsQuiet().then(() => updateChatState());
  });
  $("ownApiKey")?.addEventListener("blur", () => {
    const key = $("ownApiKey")?.value?.trim() || "";
    if (key) ensureOwnConnectionMode();
    saveCurrentOwnToCache();
    void saveSettingsQuiet().then(() => {
      updateChatState();
      if (key.length >= 8) {
        const p = getAiOwnProvider();
        const meta = globalThis.OWN_AI_PROVIDERS?.[p];
        const name = meta?.[uiLang === "uk" ? "labelUk" : "labelEn"] || p;
        setStatus(t("aiKeyReady").replace("{provider}", name), "success");
      }
    });
  });
  $("testApiBtn")?.addEventListener("click", () => void testOwnApi());

  $("mediaInput")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) addMediaSource(file);
    e.target.value = "";
  });

  $("imageInput")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) addImageSource(file);
    e.target.value = "";
  });

  $("textFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await addTextFileSource(file);
    e.target.value = "";
  });

  $("pasteTextBtn")?.addEventListener("click", () => {
    $("pasteTitle").value = "";
    $("pasteBody").value = "";
    $("pasteDialog").showModal();
  });

  $("pasteCancel")?.addEventListener("click", () => $("pasteDialog")?.close());
  $("pasteForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const body = $("pasteBody").value.trim();
    if (!body) return;
    const title = $("pasteTitle").value.trim() || t("pastedText");
    addTextSource(title, body, "paste");
    $("pasteDialog").close();
  });

  $("insertBtn")?.addEventListener("click", insertToX);
  $("reloadAssistantBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    reloadAssistant();
  });
  $("chatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendChatMessage($("chatInput").value.trim());
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!isBusy && isAiConfigured()) {
        const prompt = chip.dataset.prompt || t(chip.dataset.i18nChip);
        const mode = chip.dataset.chatMode || detectChatMode(prompt);
        if (mode === "post") resetChatForPost();
        sendChatMessage(prompt, { fresh: mode === "post", mode });
      }
    });
  });

  const dropZone = document.querySelector(".sources-panel");
  if (!dropZone) return;

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
      addMediaSource(file);
    } else if (file.type.startsWith("image/")) {
      addImageSource(file);
    } else if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
      addTextFileSource(file);
    } else {
      setStatus(t("unsupportedFiles"), "error");
    }
  });
}

function newSourceId() {
  sourceIdCounter += 1;
  return `src-${Date.now()}-${sourceIdCounter}`;
}

function hasReadySources() {
  return sources.some((s) => s.status === "ready" && s.content.trim());
}

function getReadySources() {
  return sources.filter((s) => s.status === "ready" && s.content.trim());
}

function addTextSource(name, content, type = "text") {
  sources.push({
    id: newSourceId(),
    type,
    name,
    content,
    status: "ready",
  });
  renderSources();
  updateChatState();
  setStatus(t("sourceAdded", { name }), "success");
}

async function addTextFileSource(file) {
  const text = await file.text();
  if (!text.trim()) {
    setStatus(t("fileEmpty"), "error");
    return;
  }
  addTextSource(file.name, text.trim(), "text");
}

async function imageToBase64Jpeg(file, maxDim = 1280) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function addImageSource(file) {
  const src = {
    id: newSourceId(),
    type: "image",
    name: file.name,
    content: "",
    status: "processing",
  };
  sources.push(src);
  renderSources();
  setBusy(true);

  try {
    const settings = await getSettings();

    setStatus(t("analyzingPhoto", { name: file.name }));
    setProgress(20);

    const imageBase64 = await imageToBase64Jpeg(file);
    setProgress(50);
    setStatus(t("visionWorking", { provider: t("assistantLabel") }));

    const result = await callDescribeImage(imageBase64, settings);
    if (!result?.trim()) throw new Error(t("transcribeFailed"));

    src.content = `${t("imageDescPrefix")}\n${result}`;
    src.status = "ready";
    renderSources();
    setProgress(100);
    setStatus(t("photoDone", { name: file.name }), "success");
  } catch (err) {
    src.status = "error";
    src.content = err.message;
    renderSources();
    setStatus(err.message, "error");
    setProgress(0, false);
  } finally {
    setBusy(false);
    updateChatState();
  }
}

async function addMediaSource(file) {
  const isVideo = file.type.startsWith("video/");
  const type = isVideo ? "video" : "audio";
  const src = {
    id: newSourceId(),
    type,
    name: file.name,
    content: "",
    status: "processing",
  };
  sources.push(src);
  renderSources();
  setBusy(true);

  try {
    const settings = await getSettings();
    setStatus(t("processingFile", { name: file.name }));
    setProgress(10);

    const audio = await extractAudioFromFile(file, () => {});
    setProgress(40);
    setStatus(t("transcribing"));

    const audioId = await AudioStore.put(audio);
    const tr = await runtimeSend({
      type: "TRANSCRIBE",
      audioId,
      language: settings.whisperLang,
    });
    if (tr?.error) throw new Error(tr.error);
    if (!tr?.text?.trim()) throw new Error(t("transcribeFailed"));

    src.content = tr.text.trim();
    src.status = "ready";
    renderSources();
    setProgress(100);
    setStatus(t("done", { name: file.name }), "success");
  } catch (err) {
    src.status = "error";
    src.content = err.message;
    renderSources();
    setStatus(err.message, "error");
    setProgress(0, false);
  } finally {
    setBusy(false);
    updateChatState();
  }
}

function removeSource(id) {
  sources = sources.filter((s) => s.id !== id);
  renderSources();
  updateChatState();
}

function renderSources() {
  const list = $("sourcesList");
  const count = $("sourcesCount");
  if (!list || !count) return;

  count.textContent = String(getReadySources().length);

  if (!sources.length) {
    list.innerHTML = `<p class="sources-empty">${t("noSources")}</p>`;
    return;
  }

  list.innerHTML = sources
    .map((src) => {
      const icon = SOURCE_ICONS[src.type] || "📎";
      const preview =
        src.status === "ready"
          ? escapeHtml(src.content.slice(0, 120)) + (src.content.length > 120 ? "…" : "")
          : src.status === "processing"
            ? t("processing")
            : escapeHtml(src.content.slice(0, 80));
      const durationHint =
        src.status === "ready" && (src.type === "video" || src.type === "audio")
          ? `<span class="source-duration"> · ${src.content.length} симв.</span>`
          : "";
      const statusClass =
        src.status === "ready" ? "ready" : src.status === "processing" ? "processing" : "error";

      return `
        <article class="source-card ${statusClass}" data-id="${src.id}">
          <div class="source-card-head">
            <span class="source-icon">${icon}</span>
            <div class="source-meta">
              <strong>${escapeHtml(src.name)}</strong>
              <span class="source-type">${src.type}${durationHint}</span>
            </div>
            <button type="button" class="source-remove" data-remove="${src.id}" title="${t("remove")}">×</button>
          </div>
          <p class="source-preview">${preview}</p>
        </article>`;
    })
    .join("");

  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeSource(btn.dataset.remove));
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getOwnProviderLabel(provider) {
  const p = provider || getAiOwnProvider();
  const meta = globalThis.OWN_AI_PROVIDERS?.[p];
  return meta?.[uiLang === "uk" ? "labelUk" : "labelEn"] || p || "AI";
}

function formatOwnApiError(message, provider) {
  const msg = String(message || "");
  const name = getOwnProviderLabel(provider);
  if (/exceeded your current quota|insufficient_quota|billing details|payment required/i.test(msg)) {
    return t("ownApiQuotaExceeded").replace("{provider}", name);
  }
  if (/invalid.*api.*key|incorrect api key|authentication|unauthorized|invalid_api_key/i.test(msg)) {
    return t("ownApiKeyInvalid").replace("{provider}", name);
  }
  if (/rate limit|too many requests|429|high demand|overloaded|try again|experiencing/i.test(msg)) {
    return t("ownApiRateLimit").replace("{provider}", name);
  }
  if (msg.length > 100) {
    return `${name}: ${msg.slice(0, 88)}…`;
  }
  return /^[A-Za-z ]+:/.test(msg) ? msg : `${name}: ${msg}`;
}

function setStatus(text, type = "") {
  const ownMode = getAiConnectionMode() === "own";
  if (type === "error" && !ownMode) {
    text = t("aiSharedUnavailable");
  } else if (type === "error" && (!text || text === "__silent_ai__")) {
    text = ownMode
      ? "AI не відповів. Перевірте API ключ у Налаштуваннях."
      : t("aiSharedUnavailable");
  }
  if (type === "error" && !ownMode && shouldSuppressStatusError(text)) {
    text = t("aiSharedUnavailable");
  }
  const el = $("status");
  if (el) {
    el.textContent = text;
    el.className = `status ${type}`.trim();
    el.classList.toggle("hidden", !text);
  }
  if (type === "error") {
    window.AppChrome?.setHeaderStatus("", "");
  } else {
    window.AppChrome?.setHeaderStatus(text, type);
  }
}

function flashSharedUnavailable() {
  setStatus(t("aiSharedUnavailable"), "error");
  setTimeout(() => setStatus("", ""), 3500);
}

function setProgress(value, visible = true) {
  const el = $("progress");
  el.value = value;
  el.classList.toggle("hidden", !visible);
}

function setBusy(busy) {
  isBusy = busy;
  updateChatState();
}

function updateChatState() {
  const configured = isAiConfigured();
  const canChat = !isBusy && configured;
  $("chatSendBtn").disabled = !canChat;
  $("chatInput").disabled = !canChat;
  if (!configured) {
    if (getAiConnectionMode() === "own") {
      const p = getAiOwnProvider();
      const meta = globalThis.OWN_AI_PROVIDERS?.[p];
      const name = meta?.[uiLang === "uk" ? "labelUk" : "labelEn"] || p;
      $("chatInput").placeholder = t("ownApiKeyForProvider").replace("{provider}", name);
    } else {
      $("chatInput").placeholder = t("ownApiKeyRequired");
    }
  } else {
    $("chatInput").placeholder = t("chatPlaceholder");
  }
  document.querySelectorAll(".chip").forEach((c) => {
    c.disabled = !canChat;
  });
  const reloadLabel = $("reloadAssistantBtn")?.querySelector(".btn-reload-label");
  if (reloadLabel) {
    reloadLabel.textContent = isBusy ? t("stopAssistant") : t("reloadAssistantShort");
  }
}

function renderChatEmpty() {
  $("chatMessages").innerHTML = `
    <div class="chat-empty">
      <p>${t("chatEmpty1")}</p>
      <p class="hint">${t("chatEmpty2")}</p>
    </div>`;
}

function appendMessage(role, text) {
  const empty = $("chatMessages").querySelector(".chat-empty");
  if (empty) empty.remove();

  const div = document.createElement("div");
  div.className = `msg ${role} msg-enter`;
  div.dataset.rawText = text;

  if (role === "assistant") {
    const body = document.createElement("div");
    body.className = "msg-body";
    body.textContent = text;

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-ghost btn-sm msg-copy-btn";
    copyBtn.textContent = t("copy");
    copyBtn.addEventListener("click", () => void copyMessageText(text, copyBtn));

    actions.appendChild(copyBtn);
    div.appendChild(body);
    div.appendChild(actions);
  } else {
    div.textContent = text;
  }

  $("chatMessages").appendChild(div);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

async function persistChatHistory() {
  try {
    await chrome.storage.session.set({ [CHAT_HISTORY_KEY]: chatHistory });
  } catch (_) {}
}

async function restoreChatHistory() {
  try {
    const stored = await chrome.storage.session.get(CHAT_HISTORY_KEY);
    const saved = stored?.[CHAT_HISTORY_KEY];
    if (!Array.isArray(saved) || !saved.length) return;
    chatHistory = saved.filter((m) => m?.role && m?.content);
    const box = $("chatMessages");
    if (!box) return;
    box.innerHTML = "";
    for (const msg of chatHistory) {
      appendMessage(msg.role === "assistant" ? "assistant" : "user", msg.content);
    }
  } catch (_) {}
}

function isChatAbortedError(err) {
  return err?.message === "__chat_aborted__";
}

function reloadAssistant() {
  const wasBusy = isBusy;
  chatOpGen += 1;
  clearChatStatusTicker();
  if (activeChatAbort) {
    activeChatAbort.abort();
    activeChatAbort = null;
  }
  globalThis.resetCursorChatSession?.();
  setBusy(false);
  setStatus(wasBusy ? t("chatStopped") : t("assistantReloaded"), "success");
  window.AppChrome?.setHeaderStatus?.("", "");
  void runtimeSend({ type: "WAKE_WORKER" }).catch(() => {});
}

function getActiveAiLabel() {
  if (getAiConnectionMode() === "shared") {
    return uiLang === "uk" ? "Спільний асистент" : "Shared assistant";
  }
  const p = getAiOwnProvider();
  const meta = globalThis.OWN_AI_PROVIDERS?.[p];
  return meta?.[uiLang === "uk" ? "labelUk" : "labelEn"] || p;
}

function resetChatForProviderSwitch(providerLabel) {
  chatOpGen += 1;
  if (activeChatAbort) {
    activeChatAbort.abort();
    activeChatAbort = null;
  }
  clearChatStatusTicker();
  chatHistory = [];
  globalThis.resetCursorChatSession?.();
  const box = $("chatMessages");
  if (box) box.innerHTML = "";
  renderChatEmpty();
  const label = providerLabel || getActiveAiLabel();
  setStatus(t("aiSwitchedNotice").replace("{provider}", label), "success");
  setTimeout(() => setStatus("", ""), 2500);
  void persistChatHistory();
  setBusy(false);
  updateChatState();
}

function resetChatForPost() {
  chatHistory = [];
  globalThis.resetCursorChatSession?.();
  const box = $("chatMessages");
  if (box) box.innerHTML = "";
}

function isMetaAiResponse(text) {
  return /ілюзі|prompt|підказк|промпт|not real|as an ai|я (модель|асистент|штучн)|look realistic|створен(ий|а|і) з|cannot help|не можу допомог|неправда|ніщо з цього|none of this is real|literally (been )?creat/i.test(
    text
  );
}

function lacksConcreteDetail(text) {
  const t = String(text || "").trim();
  if (t.length >= 220) return false;
  return !/\d|[$€£₴%]|\b\d+k\b|\b(API|GPT|SaaS|ROI|CTR|Whisper|Gemini|Chrome|Whop)\b/i.test(t);
}

function isMetaPostAboutAiVideo(text) {
  return /генеруват.*(відео|віор)|за допомогою промпт|нарешті.*зрозум|складніше ніж|finally understood|generat.*video|video.*prompt|realistic (video|image)|know how to (do|make) it/i.test(
    text
  );
}

function isBadPostOutput(text) {
  if (isMetaAiResponse(text)) return true;
  if (isMetaPostAboutAiVideo(text) && lacksConcreteDetail(text)) return true;
  if (/thursday night|it's nearly \d|четвер.*січн|8 вечора|8pm/i.test(text) && text.length < 220) return true;
  if (
    /не магія.*техніка|not magic.*technique|we just learned|щойно\s+(ми\s+)?(дізнал|вивчил)|важко\s+(було\s+)?повірити|як робити (віор|відео)|hard to believe|схоже на додавання макіяжу|super-?realistic images|\.?\s*дякуємо\.?\s*$/i.test(
      text
    )
  ) {
    return true;
  }
  if (text.length < 200 && lacksConcreteDetail(text)) return true;
  return false;
}

function extractPostText(text) {
  let out = String(text || "").trim();
  out = out.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");
  out = out.replace(/^(here(?:'s| is) your post:?\s*)/i, "");
  out = out.replace(/^(ось (твій |ваш )?пост:?\s*)/i, "");
  return out.trim();
}

function historyForApi(history) {
  return history.filter((m) => !(m.role === "assistant" && isBadPostOutput(m.content)));
}

function trimHistoryForApi(history) {
  const filtered = historyForApi(history);
  const maxMessages = 14;
  const maxCharsPerMessage = 6000;
  return filtered.slice(-maxMessages).map((m) => {
    const content = String(m.content || "");
    if (content.length <= maxCharsPerMessage) {
      return { role: m.role, content };
    }
    return { role: m.role, content: `${content.slice(0, maxCharsPerMessage)}…` };
  });
}

function detectChatMode(text, options = {}) {
  if (options.mode === "qa" || options.mode === "post") return options.mode;

  const s = String(text || "").trim();

  if (
    /переклад|translate|translation|на укр(айінськ(у|ою|ій)?)?|into ukrainian|to ukrainian|англ.*укр|english.*ukrainian/i.test(
      s
    )
  ) {
    return "qa";
  }

  if (/перепиш|rewrite|rephrase|адаптуй|adapt text|виправ текст|edit text/i.test(s)) {
    return "qa";
  }

  if (
    /(?:write|generate|create|make|draft).{0,24}(?:an?\s+)?(?:x\s+)?post\b|(?:напиш|згенер|зроб|створ).{0,20}пост|пост для [xх]|^пост\b|^post\b|thread of \d|тред з \d|long x post|довгий пост для [xх]|3 different angles|3 різні кути|suggest 3|ready-to-publish x post|готовий пост для x/i.test(
      s
    )
  ) {
    return "post";
  }

  if (
    /що (було|розказ|говор|сказ|йшлось|там)|про що (відео|ролик|аудіо)|що в (відео|ролику)|розкажи (детально )?про|опиши (відео|ролик|що)|summarize|summary|what (was|did).*(say|talk|discuss)|what.*in the video|explain what|ключові (ідеї|моменти)|main points|overview of/i.test(
      s
    )
  ) {
    return "qa";
  }

  if (/\?\s*$/.test(s) || /^(що|як|чому|коли|де|хто|скільки|чи)\b/i.test(s)) {
    return "qa";
  }

  if (hasMediaSources() && s.length < 100 && /^(згенер|generate|пост|post)/i.test(s)) {
    return "post";
  }

  return "qa";
}

function prepareSourcesForChat(sources, chatMode) {
  const prepPost =
    typeof prepareSourceContentForAi === "function"
      ? prepareSourceContentForAi
      : globalThis.TranscriptUtils?.prepareSourceContentForAi;
  const prepQa =
    typeof prepareSourceContentForChat === "function"
      ? prepareSourceContentForChat
      : globalThis.TranscriptUtils?.prepareSourceContentForChat;

  return sources.map((s) => ({
    type: s.type,
    name: s.name,
    content:
      chatMode === "post"
        ? prepPost
          ? prepPost(s.content, s.type)
          : s.content
        : prepQa
          ? prepQa(s.content, s.type)
          : s.content,
  }));
}

function hasMediaSources() {
  return getReadySources().some((s) => s.type === "video" || s.type === "audio");
}

function applyPostConstraintsFromUserMessage(settings, text) {
  const s = String(text || "");
  const m =
    s.match(/(?:мінімум\s+|at least\s+)?(\d{3,4})\s*(?:символ|chars?|characters|symb)/i) ||
    s.match(/від\s+(\d{3,4})\b/i);
  if (m) {
    settings.minPostChars = Number(m[1]);
    settings.postLength = Number(m[1]) >= 400 ? "long" : "medium";
  } else if (/\b500\b|довгий пост|long post/i.test(s)) {
    settings.minPostChars = 500;
    settings.postLength = "long";
  }
  if (/більш|довш|longer|розшир|expand/i.test(s) && /пост/i.test(s)) {
    settings.minPostChars = Math.max(settings.minPostChars || 0, 450);
    settings.postLength = "long";
  }
  if (settings.minPostChars >= 400) {
    settings.maxOutputTokens = 1800;
  }
  return settings;
}

function getLastAssistantDraft() {
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i]?.role === "assistant" && chatHistory[i]?.content?.trim()) {
      return chatHistory[i].content.trim();
    }
  }
  return "";
}

function shouldExpandDraft(text, settings) {
  const draft = getLastAssistantDraft();
  if (!draft) return false;
  if (isExpandPostRequest(text)) return true;
  if (settings.minPostChars >= 350) return true;
  if (/від\s+\d{3,4}|^\d{3,4}\s*символ/i.test(String(text || "").trim())) return true;
  return false;
}

function isExpandPostRequest(text) {
  return /більш|довш|longer|розшир|expand/i.test(String(text || "")) && /пост/i.test(String(text || ""));
}

async function expandExistingPost(settings, userPrompt, signal) {
  const draft = getLastAssistantDraft();
  const mediaSources = prepareSourcesForChat(getReadySources(), "qa");
  const sources = draft
    ? [...mediaSources, { type: "text", name: "Current draft", content: draft }]
    : mediaSources;

  setStatus(t("aiThinking"));
  const minLen = settings.minPostChars || 450;
  const postSettings = {
    ...settings,
    chatMode: "post",
    maxOutputTokens: 1800,
    postLength: "long",
    temperature: 0.55,
  };
  const prompt = `${userPrompt}

Expand into a LONGER ready-to-publish X post. MINIMUM ${minLen} characters — count before finishing.
Keep the same angle as the current draft. Add steps, tool names, and specifics from video sources.
${settings.postLang === "uk" ? "Ukrainian." : settings.postLang === "en" ? "English." : "Match user language."}
Post text only.`;

  return extractPostText(
    await callChatWithSources(sources, postSettings, [{ role: "user", content: prompt }], signal)
  );
}

function postLengthInstruction(settings) {
  const min = settings.minPostChars;
  if (min >= 500) {
    return `LONG POST: minimum ${min} characters (count carefully). Structure:
- Hook (1-2 lines)
- What the tactic is (2-3 lines with tool names from transcript)
- Steps or how it works (2-4 lines)
- Punchy takeaway (1-2 lines)
Use line breaks between blocks. Pull facts from transcript — Weave Speed AI, Clink AI, etc. if mentioned.`;
  }
  if (min >= 400) {
    return `Minimum ${min} characters. Several short paragraphs with concrete details from the video.`;
  }
  return "Aim for 140–280 characters with concrete details.";
}

function buildVideoPostPrompt(userPrompt, settings) {
  const min = settings.minPostChars || 0;
  return `${userPrompt}

Read the video transcript in SOURCES. Skip empty intro hooks ("stupid way", narrator fluff).
Write as the USER (creator on X), not the video narrator.
Include tool names, steps, and claims FROM the transcript.
${postLengthInstruction(settings)}
${min >= 500 ? `CRITICAL: output MUST be at least ${min} characters. Do not stop early.` : ""}
${settings.postLang === "uk" ? "Ukrainian." : settings.postLang === "en" ? "English." : "Match user language."}
Post text only — no title, no "here is your post".`;
}

async function generatePostFromVideo(settings, userPrompt, signal) {
  const readySources = prepareSourcesForChat(getReadySources(), "qa");
  const minLen = settings.minPostChars || 0;
  const postSettings = {
    ...settings,
    chatMode: "post",
    maxOutputTokens: minLen >= 500 ? 1800 : 900,
    postLength: minLen >= 400 ? "long" : settings.postLength,
  };
  const prompt = buildVideoPostPrompt(userPrompt, settings);

  setStatus(t("aiThinking"));
  let reply = extractPostText(
    await callChatWithSources(readySources, postSettings, [{ role: "user", content: prompt }], signal)
  );

  if (minLen && reply.length < minLen * 0.85) {
    reply = await expandExistingPost({ ...settings, minPostChars: minLen }, userPrompt, signal);
  } else if (isBadPostOutput(reply)) {
    reply = extractPostText(
      await callChatWithSources(readySources, { ...postSettings, temperature: 0.5 }, [
        { role: "user", content: prompt + "\nUse specific tool names and steps from the transcript." },
      ], signal)
    );
  }

  return reply;
}

async function retryPostFromFullTranscript(settings, userPrompt, signal) {
  const fullSources = prepareSourcesForChat(getReadySources(), "qa");
  const retrySettings = {
    ...settings,
    chatMode: "post",
    temperature: 0.5,
    postStyle: "punchy",
    postLength: "short",
  };
  const retryPrompt = `${userPrompt}

Прочитай ВЕСЬ транскрипт у SOURCES. Ігноруй вступ відео (четвер, 8 вечора, «мене зробили з промпта», реалістичні віори).
Знайди ГОЛОВНУ ТЕМУ в середині/кінці — тактика, інструмент, гроші, кроки, інсайт.
Напиши пост для X від імені автора: сильний хук + мінімум 2 конкретні факти з джерела (цифри, інструменти, кроки).
Мінімум 120 символів. Без «щойно дізнались» / «важко повірити» / «дякуємо». Тільки текст поста.`;

  const text = await callChatWithSources(fullSources, retrySettings, [
    { role: "user", content: retryPrompt },
  ], signal);
  return extractPostText(text);
}

async function sendChatMessage(text, options = {}) {
  if (!text || isBusy) return;
  if (!isAiConfigured()) {
    setStatus(t("ownApiKeyRequired"), "error");
    openOwnKeySettings();
    return;
  }

  saveCurrentOwnToCache();
  void saveSettingsQuiet();

  if (options.fresh) {
    chatHistory = [];
    globalThis.resetCursorChatSession?.();
    void persistChatHistory();
  }

  $("chatInput").value = "";
  appendMessage("user", options.displayText || text);
  chatHistory.push({ role: "user", content: text });
  void persistChatHistory();

  const opId = ++chatOpGen;
  const abort = new AbortController();
  activeChatAbort = abort;
  let signal = abort.signal;

  setBusy(true);

  try {
    const chatMode = detectChatMode(text, options);
    const settings = await getSettings();
    settings.chatMode = chatMode;
    applyPostConstraintsFromUserMessage(settings, text);

    const cursorModel =
      settings.ownModels?.cursor || settings.ownModel || normalizeCursorModelSetting("");
    if (settings.aiProvider === "hosted" && Date.now() - hostedWarmAt >= HOSTED_WARM_TTL_MS) {
      setStatus(t("serverWaking"), "");
      await warmHostedServer({ showStatus: false });
    }

    startChatStatusTicker(settings.aiProvider, cursorModel);

    if (settings.aiProvider === "cursor") {
      const cursorTimeoutMs = chatMode === "qa" ? 120000 : 150000;
      signal = mergeAbortSignals(abort.signal, cursorTimeoutMs);
      settings._onCursorProgress = (preview) => {
        const short = String(preview || "").replace(/\s+/g, " ").trim();
        if (short) {
          clearChatStatusTicker();
          setStatus(short.length > 72 ? `${short.slice(0, 72)}…` : short, "");
        } else {
          setStatus(t("cursorThinking"), "");
        }
      };
    } else if (settings.aiProvider === "hosted") {
      signal = mergeAbortSignals(abort.signal, 90000);
    }

    const readySources = prepareSourcesForChat(getReadySources(), chatMode);

    let replyText;

    if (chatMode === "post") {
      if (shouldExpandDraft(text, settings)) {
        replyText = await expandExistingPost(settings, text, signal);
      } else if (hasMediaSources()) {
        replyText = await generatePostFromVideo(settings, text, signal);
      } else {
        const apiHistory = historyForApi(chatHistory);
        replyText = await callChatWithSources(readySources, settings, apiHistory, signal);
        if (isBadPostOutput(replyText) && hasReadySources() && !options._noRetry) {
          replyText = await retryPostFromFullTranscript(settings, text, signal);
        }
        replyText = extractPostText(replyText);
      }
    } else {
      replyText = await callChatWithSources(readySources, settings, chatHistory, signal);
    }

    if (opId !== chatOpGen) return;
    if (!replyText) throw new Error(t("transcribeFailed"));

    chatHistory.push({ role: "assistant", content: replyText });
    appendMessage("assistant", replyText);
    void persistChatHistory();
    setStatus(t("ready"), "success");
  } catch (err) {
    if (opId !== chatOpGen) return;
    if (isChatAbortedError(err) && abort.signal.aborted) {
      setStatus(t("chatStopped"), "");
      chatHistory.pop();
      void persistChatHistory();
      return;
    }
    let msg = err?.message || "";
    if (getAiConnectionMode() === "shared") {
      flashSharedUnavailable();
    } else if (msg === "__silent_ai__") {
      flashSharedUnavailable();
    } else if (msg) {
      setStatus(formatOwnApiError(msg, getAiOwnProvider()), "error");
      setTimeout(() => setStatus("", ""), 5000);
    } else {
      setStatus(
        "AI не відповів. Перевірте API ключ, модель composer-2.5 і Reload розширення.",
        "error"
      );
    }
    void persistChatHistory();
  } finally {
    clearChatStatusTicker();
    if (activeChatAbort === abort) activeChatAbort = null;
    if (opId === chatOpGen) setBusy(false);
  }
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      ta.remove();
    }
    return ok;
  }
}

function getTextForInsert() {
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i]?.role === "assistant") {
      const content = chatHistory[i].content;
      if (content != null && String(content).trim()) return String(content);
    }
  }

  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i]?.role === "user") {
      const content = chatHistory[i].content;
      if (content != null && String(content).trim()) return String(content);
    }
  }

  const chatInput = $("chatInput")?.value;
  if (chatInput != null && String(chatInput).trim()) return String(chatInput);

  const msgs = $("chatMessages");
  if (msgs) {
    const nodes = msgs.querySelectorAll(".msg.assistant");
    for (let i = nodes.length - 1; i >= 0; i--) {
      const raw =
        nodes[i]?.dataset?.rawText ??
        nodes[i]?.querySelector(".msg-body")?.textContent ??
        "";
      if (String(raw).trim()) return String(raw);
    }
  }

  return "";
}

function hasInsertableText(text) {
  return String(text || "").trim().length > 0;
}

function flashActionStatus(text, type = "success") {
  setStatus(text, type);
  window.AppChrome?.setHeaderStatus?.(text, type);
  if (type === "success") {
    setTimeout(() => {
      setStatus(t("ready"), "success");
      window.AppChrome?.setHeaderStatus?.("", "");
    }, 2200);
  }
}

async function copyMessageText(text, btn) {
  const ok = await copyTextToClipboard(text);
  if (!ok) {
    flashActionStatus(t("copyFailed"), "error");
    return;
  }
  const prev = btn.textContent;
  btn.textContent = t("copied");
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = prev || t("copy");
    btn.disabled = false;
  }, 1600);
}

async function insertToX() {
  const text = getTextForInsert();
  if (!hasInsertableText(text)) {
    flashActionStatus(t("noTextToInsert"), "error");
    return;
  }
  flashActionStatus(t("insertingX"), "");
  const result = await runtimeSend({ type: "INSERT_TWEET", text });
  if (result?.error) {
    flashActionStatus(result.error, "error");
    return;
  }
  flashActionStatus(t("insertedX"), "success");
}
