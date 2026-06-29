/**
 * Adaptive frame rate by clip length:
 * ≤30s → 15 fps | ≤90s → 10 fps | >90s → 5 fps
 */
const VIDEO_MICRO_MAX_SEC = 30;
const VIDEO_SHORT_MAX_SEC = 90;
const VIDEO_FPS_MICRO = 15;
const VIDEO_FPS_SHORT = 10;
const VIDEO_FPS_LONG = 5;

function getVideoFrameRate(durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return VIDEO_FPS_LONG;
  if (durationSec <= VIDEO_MICRO_MAX_SEC) return VIDEO_FPS_MICRO;
  if (durationSec <= VIDEO_SHORT_MAX_SEC) return VIDEO_FPS_SHORT;
  return VIDEO_FPS_LONG;
}

async function captureFrame(video, maxDim = 960) {
  let w = video.videoWidth;
  let h = video.videoHeight;
  if (!w || !h) return null;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
  return btoa(binary);
}

async function extractVideoFramesPerSecond(file, maxDim = 960) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Video load failed")), { once: true });
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Invalid video duration");
    }

    const fps = getVideoFrameRate(duration);
    const sampleCount = Math.max(1, Math.ceil(duration * fps));
    const interval = duration / sampleCount;
    const frames = [];

    for (let i = 0; i < sampleCount; i++) {
      const time = Math.min(Math.max(i * interval, 0), Math.max(duration - 0.04, 0));
      video.currentTime = time;
      await new Promise((resolve, reject) => {
        video.addEventListener("seeked", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
      });
      const base64 = await captureFrame(video, maxDim);
      if (base64) {
        frames.push({ base64, second: Math.round(time * 10) / 10, fps });
      }
    }

    if (!frames.length) throw new Error("No video frames");
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractVideoFrames(file) {
  const data = await extractVideoFramesPerSecond(file);
  return data.map((f) => f.base64);
}

globalThis.VIDEO_MICRO_MAX_SEC = VIDEO_MICRO_MAX_SEC;
globalThis.VIDEO_SHORT_MAX_SEC = VIDEO_SHORT_MAX_SEC;
globalThis.VIDEO_FPS_MICRO = VIDEO_FPS_MICRO;
globalThis.VIDEO_FPS_SHORT = VIDEO_FPS_SHORT;
globalThis.VIDEO_FPS_LONG = VIDEO_FPS_LONG;
globalThis.getVideoFrameRate = getVideoFrameRate;
globalThis.extractVideoFrames = extractVideoFrames;
globalThis.extractVideoFramesPerSecond = extractVideoFramesPerSecond;
