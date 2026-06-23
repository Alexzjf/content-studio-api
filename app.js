const APP_VERSION = "1.27.1";

const DEFAULT_SETTINGS = {
  uiLang: "en",
  aiProvider: "hosted",
  hostedApiUrl:
    typeof EXTENSION_CONFIG !== "undefined" ? EXTENSION_CONFIG.hostedApiUrl : "http://localhost:8787",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash-lite",
  openrouterApiKey: "",
  openrouterModel: "google/gemini-2.0-flash-exp:free",
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
let sourceIdCounter = 0;
let uiLang = "en";

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
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        const msg = err.message || "Extension error";
        reject(
          new Error(
            msg.includes("parsed") || msg.includes("empty")
              ? "Зв’язок з розширенням перервався. Reload на chrome://extensions"
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
  });
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
  if (!/localhost|127\.0\.0\.1/.test(primary)) {
    bases.push("http://localhost:8787");
  }
  return [...new Set(bases)];
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

function formatApiError(status, data, base) {
  const raw = data?.error || "";
  if (/Ліміт сервера|Daily limit reached/i.test(raw)) {
    return raw;
  }
  if (/gemini-1\.5|not found for API version|not supported for generateContent/i.test(raw)) {
    return "Сервер AI застарів. Перезапустіть у терміналі: cd server && npm start";
  }
  if (/high demand|overloaded|try again later/i.test(raw)) {
    return "Gemini перевантажений. Зачекайте 30–60 сек і натисніть ще раз.";
  }
  if (status === 503) {
    if (base.includes("localhost") || base.includes("127.0.0.1")) {
      return "Локальний сервер AI не запущений. У терміналі: cd server && npm start";
    }
    return t("serverOffline");
  }
  if (status === 502 && raw) {
    if (/Ліміт Gemini|quota|rate limit|resource.?exhausted/i.test(raw)) {
      return raw;
    }
    return raw;
  }
  if (status === 404) {
    if (base.includes("localhost") || base.includes("127.0.0.1")) {
      return "Локальний сервер застарів. Перезапустіть: cd server && npm start";
    }
    return t("serverWrongUrl");
  }
  if (status === 429 && /Ліміт сервера/i.test(raw)) return raw;
  return raw || `API помилка (${status})`;
}

function wrapNetworkError(err) {
  const msg = err?.message || String(err);
  if (/failed to fetch|networkerror|network error|load failed|err_connection_refused/i.test(msg)) {
    return new Error(t("serverOffline"));
  }
  return err instanceof Error ? err : new Error(msg);
}

function isRetryableAiError(status, raw) {
  const msg = String(raw || "");
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    /Ліміт Gemini|тимчасово зайнятий|high demand|overloaded|quota|rate limit|resource.?exhausted|зачекайте/i.test(
      msg
    )
  );
}

function retryWaitSec(status, data, raw) {
  return Math.min(
    20,
    data?.retryAfterSec ||
      Number(String(raw).match(/~(\d+)\s*сек/i)?.[1]) ||
      Number(String(raw).match(/retry in ([\d.]+)s/i)?.[1]) ||
      (status === 429 ? 3 : 4)
  );
}

async function hostedApiPost(path, body, settings, timeoutMs = 120000) {
  const bases = getHostedApiBases(settings);
  let lastError = null;

  for (const base of bases) {
    for (let rateTry = 0; rateTry < 6; rateTry++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: hostedApiHeaders(base),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const raw = data?.error || "";
          if (isRetryableAiError(response.status, raw) && rateTry < 5) {
            const sec = retryWaitSec(response.status, data, raw);
            setStatus(t("rateLimitWait", { sec }));
            await new Promise((r) => setTimeout(r, sec * 1000 + 400));
            continue;
          }
          const err = new Error(formatApiError(response.status, data, base));
          if ((response.status === 503 || response.status === 404) && bases.length > 1) {
            lastError = err;
            break;
          }
          throw err;
        }
        return data;
      } catch (err) {
        if (err.name === "AbortError") {
          throw new Error(t("aiTimeout"));
        }
        if (bases.length > 1 && /503|fetch|tunnel/i.test(err.message)) {
          lastError = wrapNetworkError(err);
          break;
        }
        throw wrapNetworkError(err);
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw lastError || new Error(t("serverOffline"));
}

async function checkAiServer() {
  const provider = $("aiProvider")?.value || "hosted";
  if (provider !== "hosted") return;
  const settings = await getSettings();
  const bases = getHostedApiBases(settings);
  let cloudBad = false;

  for (const base of bases) {
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error("bad health");
      const data = await r.json();
      if (!data.ok) {
        if (!/localhost|127\.0\.0\.1/.test(base)) {
          cloudBad = true;
          continue;
        }
        throw new Error("wrong api");
      }
      if (data.apiVersion && data.apiVersion < "1.27.1") {
        setStatus(t("serverOutdated"), "error");
        return;
      }
      if (cloudBad && /localhost|127\.0\.0\.1/.test(base)) {
        setStatus(t("serverCloudFallback"), "success");
      }
      return;
    } catch {
      if (/localhost|127\.0\.0\.1/.test(base)) {
        setStatus(t("serverOffline"), "error");
        return;
      }
      cloudBad = true;
    }
  }
  if (cloudBad) setStatus(t("serverWrongUrl"), "error");
}

async function hostedChatDirect(sources, settings, history) {
  const data = await hostedApiPost("/v1/chat", { sources, settings, history }, settings);
  if (!data.text?.trim()) throw new Error("Empty AI response");
  return data.text.trim();
}

async function hostedDescribeDirect(imageBase64, settings) {
  const data = await hostedApiPost("/v1/describe-image", { imageBase64, settings }, settings);
  if (!data.text?.trim()) throw new Error("Empty AI response");
  return data.text.trim();
}

function getAiChatFn() {
  return globalThis.chatWithSources;
}

function getAiDescribeFn() {
  return globalThis.describeImage;
}

async function callChatWithSources(sources, settings, history) {
  const fn = getAiChatFn();
  if (typeof fn === "function") {
    return fn(sources, settings, history);
  }

  if ((settings.aiProvider || "hosted") === "hosted") {
    return hostedChatDirect(sources, settings, history);
  }

  const res = await runtimeSend({ type: "CHAT", sources, settings, history });
  if (res?.error) throw new Error(res.error);
  return res.text;
}

async function callDescribeImage(imageBase64, settings) {
  const fn = getAiDescribeFn();
  if (typeof fn === "function") {
    return fn(imageBase64, settings);
  }

  if ((settings.aiProvider || "hosted") === "hosted") {
    return hostedDescribeDirect(imageBase64, settings);
  }

  const res = await runtimeSend({ type: "DESCRIBE_IMAGE", imageBase64, settings });
  if (res?.error) throw new Error(res.error);
  return res.text;
}

const SETTINGS_SELECT_IDS = [
  "aiProvider",
  "geminiModel",
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
    renderSources();
    updateCharCount();
    updateSettingsVersion();
    $("settingsDetails")?.setAttribute("open", "");
    applyLocale(false);
    bindEvents();
    void checkAiServer();
  } catch (err) {
    console.error("Content Studio init failed:", err);
    window.AppChrome?.setHeaderStatus(`Init: ${err.message}`, "error");
    setStatus(`Init: ${err.message}`, "error");
  }
}

function getUiLang() {
  return uiLang;
}

function setUiLangToggle(lang) {
  document.querySelectorAll("#uiLangToggle [data-lang]").forEach((btn) => {
    const active = btn.dataset.lang === lang;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

async function setUiLang(lang, persist = true) {
  if (!lang) return;
  uiLang = lang === "uk" ? "uk" : "en";
  setUiLangToggle(uiLang);

  if (uiLang === "uk" && $("postLang")?.value === "auto") {
    setSelectValue("postLang", "uk");
  }

  if (typeof I18n !== "undefined") {
    I18n.setLocale(uiLang);
    document.documentElement.lang = uiLang === "uk" ? "uk" : "en";
    I18n.applyPageI18n();
    document.title = `${I18n.t("brandTitle")} for X`;
  }

  updateAiMode();
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
    settings = stored.settings || {};
  } catch (_) {
    settings = {};
  }

  uiLang = settings.uiLang ?? (typeof I18n !== "undefined" ? I18n.detectLocale() : "en");
  window.__uiLang = uiLang;
  setUiLangToggle(uiLang);

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
  setSelectValue("aiProvider", settings.aiProvider ?? DEFAULT_SETTINGS.aiProvider);
  setSelectValue("geminiModel", settings.geminiModel ?? DEFAULT_SETTINGS.geminiModel);

  const geminiKey = $("geminiApiKey");
  if (geminiKey) geminiKey.value = settings.geminiApiKey ?? "";

  const openrouterKey = $("openrouterApiKey");
  if (openrouterKey) openrouterKey.value = settings.openrouterApiKey ?? "";

  const openrouterModel = $("openrouterModel");
  if (openrouterModel) {
    openrouterModel.value = settings.openrouterModel ?? DEFAULT_SETTINGS.openrouterModel;
  }

  const custom = $("customInstructions");
  if (custom) custom.value = settings.customInstructions ?? DEFAULT_SETTINGS.customInstructions;

  const widthPct = settings.panelWidthPercent ?? DEFAULT_SETTINGS.panelWidthPercent;
  if ($("panelWidthSlider")) $("panelWidthSlider").value = String(widthPct);
  if ($("panelWidthValue")) $("panelWidthValue").textContent = `${widthPct}%`;

  updateAiProviderUI();
}

function getAiProvider() {
  return $("aiProvider")?.value || DEFAULT_SETTINGS.aiProvider;
}

function isAiConfigured() {
  const provider = getAiProvider();
  if (provider === "gemini") {
    return Boolean($("geminiApiKey")?.value?.trim());
  }
  if (provider === "openrouter") {
    return Boolean($("openrouterApiKey")?.value?.trim());
  }
  return true;
}

function updateAiProviderUI() {
  const provider = getAiProvider();
  $("aiProviderHostedHint")?.classList.toggle("hidden", provider !== "hosted");
  $("aiProviderGeminiFields")?.classList.toggle("hidden", provider !== "gemini");
  $("aiProviderOpenrouterFields")?.classList.toggle("hidden", provider !== "openrouter");

  const hint = $("aiModeHint");
  if (!hint) return;
  const hintKey =
    provider === "gemini"
      ? "aiOnHintOwnKey"
      : provider === "openrouter"
        ? "aiOnHintOpenRouter"
        : "aiOnHintHosted";
  hint.textContent = t(hintKey);
}

function applyLocale(showSavedStatus = false) {
  const lang = window.AppChrome?.getUiLang() || getUiLang() || I18n.getLocale() || I18n.detectLocale();
  uiLang = lang === "uk" ? "uk" : "en";
  window.AppChrome?.applyUiLang(uiLang);
  setUiLangToggle(uiLang);
  I18n.setLocale(uiLang);
  document.documentElement.lang = uiLang === "uk" ? "uk" : "en";
  I18n.applyPageI18n();
  document.title = `${I18n.t("brandTitle")} for X`;
  updateAiMode();
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
  return {
    ...DEFAULT_SETTINGS,
    uiLang: window.AppChrome?.getUiLang() || getUiLang(),
    aiProvider: getAiProvider(),
    hostedApiUrl:
      typeof EXTENSION_CONFIG !== "undefined"
        ? EXTENSION_CONFIG.hostedApiUrl
        : DEFAULT_SETTINGS.hostedApiUrl,
    geminiApiKey: $("geminiApiKey")?.value?.trim() ?? "",
    geminiModel: $("geminiModel")?.value ?? DEFAULT_SETTINGS.geminiModel,
    openrouterApiKey: $("openrouterApiKey")?.value?.trim() ?? "",
    openrouterModel: $("openrouterModel")?.value?.trim() || DEFAULT_SETTINGS.openrouterModel,
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
  $("geminiApiKey")?.addEventListener("blur", () => {
    void saveSettingsQuiet().then(() => updateChatState());
  });
  $("openrouterApiKey")?.addEventListener("blur", () => {
    void saveSettingsQuiet().then(() => updateChatState());
  });
  $("openrouterModel")?.addEventListener("blur", () => saveSettingsQuiet());
  $("aiProvider")?.addEventListener("change", () => {
    updateAiProviderUI();
    void saveSettingsQuiet().then(() => checkAiServer());
  });

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

  $("copyBtn")?.addEventListener("click", copyDraft);
  $("insertBtn")?.addEventListener("click", insertToX);
  $("chatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendChatMessage($("chatInput").value.trim());
  });
  $("postText")?.addEventListener("input", updateCharCount);

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

function setStatus(text, type = "") {
  const el = $("status");
  if (el) {
    el.textContent = text;
    el.className = `status ${type}`.trim();
    el.classList.remove("hidden");
  }
  window.AppChrome?.setHeaderStatus(text, type);
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
    const provider = getAiProvider();
    $("chatInput").placeholder =
      provider === "openrouter" ? t("openrouterKeyRequired") : t("geminiKeyRequired");
  } else {
    $("chatInput").placeholder = t("chatPlaceholder");
  }
  document.querySelectorAll(".chip").forEach((c) => {
    c.disabled = !canChat;
  });
}

function updateCharCount() {
  const post = $("postText");
  const count = $("charCount");
  if (!post || !count) return;
  count.textContent = String(post.value.length);
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
  div.textContent = text;
  $("chatMessages").appendChild(div);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function resetChatForPost() {
  chatHistory = [];
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

function shouldExpandDraft(text, settings) {
  const draft = $("postText")?.value?.trim();
  if (!draft) return false;
  if (isExpandPostRequest(text)) return true;
  if (settings.minPostChars >= 350) return true;
  if (/від\s+\d{3,4}|^\d{3,4}\s*символ/i.test(String(text || "").trim())) return true;
  return false;
}

function isExpandPostRequest(text) {
  return /більш|довш|longer|розшир|expand/i.test(String(text || "")) && /пост/i.test(String(text || ""));
}

async function expandExistingPost(settings, userPrompt) {
  const draft = $("postText")?.value?.trim();
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
    await callChatWithSources(sources, postSettings, [{ role: "user", content: prompt }])
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

async function generatePostFromVideo(settings, userPrompt) {
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
    await callChatWithSources(readySources, postSettings, [{ role: "user", content: prompt }])
  );

  if (minLen && reply.length < minLen * 0.85) {
    $("postText").value = reply;
    reply = await expandExistingPost({ ...settings, minPostChars: minLen }, userPrompt);
  } else if (isBadPostOutput(reply)) {
    reply = extractPostText(
      await callChatWithSources(readySources, { ...postSettings, temperature: 0.5 }, [
        { role: "user", content: prompt + "\nUse specific tool names and steps from the transcript." },
      ])
    );
  }

  return reply;
}

async function retryPostFromFullTranscript(settings, userPrompt) {
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
  ]);
  return extractPostText(text);
}

async function sendChatMessage(text, options = {}) {
  if (!text || isBusy) return;
  if (!isAiConfigured()) return;

  if (options.fresh) {
    chatHistory = [];
  }

  $("chatInput").value = "";
  appendMessage("user", options.displayText || text);
  chatHistory.push({ role: "user", content: text });

  setBusy(true);
  setStatus(t("aiThinking"));

  try {
    const chatMode = detectChatMode(text, options);
    const settings = await getSettings();
    settings.chatMode = chatMode;
    applyPostConstraintsFromUserMessage(settings, text);

    const readySources = prepareSourcesForChat(getReadySources(), chatMode);

    let replyText;

    if (chatMode === "post") {
      if (shouldExpandDraft(text, settings)) {
        replyText = await expandExistingPost(settings, text);
      } else if (hasMediaSources()) {
        replyText = await generatePostFromVideo(settings, text);
      } else {
        const apiHistory = historyForApi(chatHistory);
        replyText = await callChatWithSources(readySources, settings, apiHistory);
        if (isBadPostOutput(replyText) && hasReadySources() && !options._noRetry) {
          replyText = await retryPostFromFullTranscript(settings, text);
        }
        replyText = extractPostText(replyText);
      }
      $("postText").value = replyText;
      updateCharCount();
    } else {
      replyText = await callChatWithSources(readySources, settings, chatHistory);
    }

    if (!replyText) throw new Error(t("transcribeFailed"));

    chatHistory.push({ role: "assistant", content: replyText });
    appendMessage("assistant", replyText);
    setStatus(t("ready"), "success");
  } catch (err) {
    setStatus(err.message, "error");
    chatHistory.pop();
  } finally {
    setBusy(false);
  }
}

async function copyDraft() {
  const text = $("postText").value;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  setStatus(t("copied"), "success");
}

async function insertToX() {
  const text = $("postText").value;
  if (!text) return;
  const result = await runtimeSend({ type: "INSERT_TWEET", text });
  if (result?.error) {
    setStatus(result.error, "error");
    return;
  }
  setStatus(t("insertedX"), "success");
}
