/**
 * Extract JPEG frames from video — 1 frame per second of duration.
 */
async function captureFrame(video, maxDim = 720) {
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
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.65 });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
  return btoa(binary);
}

async function extractVideoFramesPerSecond(file, maxDim = 720) {
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

    const frameCount = Math.max(1, Math.ceil(duration));
    const frames = [];

    for (let sec = 0; sec < frameCount; sec++) {
      const time = Math.min(Math.max(sec, 0), Math.max(duration - 0.04, 0));
      video.currentTime = time;
      await new Promise((resolve, reject) => {
        video.addEventListener("seeked", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
      });
      const base64 = await captureFrame(video, maxDim);
      if (base64) frames.push({ base64, second: sec });
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

globalThis.extractVideoFrames = extractVideoFrames;
globalThis.extractVideoFramesPerSecond = extractVideoFramesPerSecond;
