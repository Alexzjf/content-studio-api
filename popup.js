const DEFAULT_SETTINGS = {
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.2:latest",
  whisperLang: "auto",
  postStyle: "engaging",
};

let selectedFile = null;
let lastTranscript = "";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  bindEvents();
});

async function loadSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  $("ollamaUrl").value = settings.ollamaUrl ?? DEFAULT_SETTINGS.ollamaUrl;
  $("ollamaModel").value = settings.ollamaModel ?? DEFAULT_SETTINGS.ollamaModel;
  $("whisperLang").value = settings.whisperLang ?? DEFAULT_SETTINGS.whisperLang;
  $("postStyle").value = settings.postStyle ?? DEFAULT_SETTINGS.postStyle;
}

async function saveSettings() {
  const settings = {
    ollamaUrl: $("ollamaUrl").value.trim(),
    ollamaModel: $("ollamaModel").value.trim(),
    whisperLang: $("whisperLang").value,
    postStyle: $("postStyle").value,
  };
  await chrome.storage.local.set({ settings });
  setStatus("Налаштування збережено", "success");
}

function bindEvents() {
  const videoInput = $("videoInput");
  const dropZone = $("dropZone");

  videoInput.addEventListener("change", () => {
    if (videoInput.files[0]) selectFile(videoInput.files[0]);
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  });

  $("saveSettings").addEventListener("click", saveSettings);
  $("generateBtn").addEventListener("click", generate);
  $("copyBtn").addEventListener("click", copyPost);
  $("insertBtn").addEventListener("click", insertToX);
  $("regenerateBtn").addEventListener("click", () => regeneratePost());
}

function selectFile(file) {
  selectedFile = file;
  $("fileName").textContent = file.name;
  $("generateBtn").disabled = false;
  $("resultSection").classList.add("hidden");
}

function setStatus(text, type = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${type}`.trim();
  el.classList.remove("hidden");
}

function setProgress(value, visible = true) {
  const el = $("progress");
  el.value = value;
  el.classList.toggle("hidden", !visible);
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function generate() {
  if (!selectedFile) return;

  $("generateBtn").disabled = true;
  $("resultSection").classList.add("hidden");
  setProgress(5);

  try {
    const settings = await getSettings();

    setStatus("Крок 1/3: Витягую аудіо з відео...");
  setProgress(15);
    const audio = await extractAudioFromFile(selectedFile, (msg) => setStatus(`Крок 1/3: ${msg}`));

    setStatus("Крок 2/3: Транскрибую (Whisper локально, перший раз — завантаження моделі ~40MB)...");
    setProgress(40);

    const transcriptResponse = await chrome.runtime.sendMessage({
      type: "TRANSCRIBE",
      audio: Array.from(audio),
      language: settings.whisperLang,
    });

    if (transcriptResponse?.error) throw new Error(transcriptResponse.error);
    if (!transcriptResponse?.text) throw new Error("Транскрипт порожній — перевірте чи є звук у відео");

    lastTranscript = transcriptResponse.text;
    $("transcript").textContent = lastTranscript;

    setStatus("Крок 3/3: Генерую пост через Ollama (перший раз 1–2 хв — не закривайте popup)...");
    setProgress(75);

    const postResponse = await chrome.runtime.sendMessage({
      type: "GENERATE_POST",
      transcript: lastTranscript,
      settings,
    });
    if (postResponse?.error) throw new Error(postResponse.error);
    const post = postResponse.text;

    $("postText").value = post;
    $("resultSection").classList.remove("hidden");
    setProgress(100);
    setStatus("Готово!", "success");
  } catch (err) {
    setStatus(err.message, "error");
    setProgress(0, false);
  } finally {
    $("generateBtn").disabled = false;
  }
}

async function regeneratePost() {
  if (!lastTranscript) return;
  const settings = await getSettings();
  $("regenerateBtn").disabled = true;
  setStatus("Перегенеровую пост (може зайняти до 1–2 хв)...");
  try {
    const postResponse = await chrome.runtime.sendMessage({
      type: "GENERATE_POST",
      transcript: lastTranscript,
      settings,
    });
    if (postResponse?.error) throw new Error(postResponse.error);
    $("postText").value = postResponse.text;
    setStatus("Пост оновлено", "success");
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    $("regenerateBtn").disabled = false;
  }
}

async function copyPost() {
  await navigator.clipboard.writeText($("postText").value);
  setStatus("Скопійовано!", "success");
}

async function insertToX() {
  const text = $("postText").value;
  const result = await chrome.runtime.sendMessage({ type: "INSERT_TWEET", text });
  if (result?.error) {
    setStatus(result.error, "error");
    return;
  }
  setStatus("Вставлено на x.com!", "success");
}
