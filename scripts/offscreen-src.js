import { pipeline, env } from "@huggingface/transformers";

env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("wasm/");
env.backends.onnx.wasm.numThreads = 1;
env.allowLocalModels = false;
env.useBrowserCache = true;

const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 28;
const CHUNK_SAMPLES = CHUNK_SECONDS * SAMPLE_RATE;

let transcriber = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "OFFSCREEN_TRANSCRIBE" || message.target !== "offscreen") {
    return false;
  }

  transcribe(message.audioId, message.language)
    .then((text) => sendResponse({ text }))
    .catch((err) => sendResponse({ error: err.message }));

  return true;
});

async function getTranscriber() {
  if (!transcriber) {
    transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
      dtype: "q8",
    });
  }
  return transcriber;
}

function whisperOptions(language) {
  const options = { chunk_length_s: 28, stride_length_s: 4 };
  if (language && language !== "auto") {
    options.language = language;
    options.task = "transcribe";
  }
  return options;
}

async function transcribeChunk(pipe, chunk, language) {
  const result = await pipe(chunk, whisperOptions(language));
  return String(result?.text || result?.chunks?.map((c) => c.text).join(" ") || "").trim();
}

async function transcribe(audioId, language) {
  if (!audioId) throw new Error("Missing audio data");

  const stored = await AudioStore.get(audioId);
  if (!stored) throw new Error("Audio data not found. Try uploading again.");

  try {
    const pipe = await getTranscriber();
    const audio = stored instanceof Float32Array ? stored : new Float32Array(stored);
    const durationSec = Math.round(audio.length / SAMPLE_RATE);

    let text = "";

    if (audio.length <= CHUNK_SAMPLES * 1.2) {
      text = await transcribeChunk(pipe, audio, language);
    } else {
      const parts = [];
      for (let start = 0; start < audio.length; start += CHUNK_SAMPLES) {
        const chunk = audio.subarray(start, Math.min(start + CHUNK_SAMPLES, audio.length));
        const part = await transcribeChunk(pipe, chunk, language);
        if (part) parts.push(part);
      }
      text = mergeTranscriptParts(parts);
    }

    if (!text) {
      throw new Error(`Транскрипт порожній (${durationSec}s аудіо). Перевірте звук у відео.`);
    }

    return text;
  } finally {
    await AudioStore.remove(audioId).catch(() => {});
  }
}

function mergeTranscriptParts(parts) {
  if (!parts.length) return "";
  let merged = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const prev = merged.toLowerCase();
    const next = parts[i];
    const overlap = findOverlapSuffixPrefix(prev, next.toLowerCase());
    merged += overlap > 0 ? next.slice(overlap) : ` ${next}`;
  }
  return merged.replace(/\s+/g, " ").trim();
}

function findOverlapSuffixPrefix(a, b, max = 80) {
  const len = Math.min(max, a.length, b.length);
  for (let size = len; size >= 12; size--) {
    if (a.slice(-size) === b.slice(0, size)) return size;
  }
  return 0;
}
