/**
 * Sample JPEG frames from a video file for visual analysis (silent videos).
 */
async function extractVideoFrames(file, frameCount = 6, maxDim = 1280) {
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

    const frames = [];
    const count = Math.max(2, Math.min(frameCount, 8));

    for (let i = 0; i < count; i++) {
      const time = Math.min(
        Math.max((duration * (i + 0.5)) / count, 0),
        Math.max(duration - 0.05, 0)
      );
      video.currentTime = time;
      await new Promise((resolve, reject) => {
        video.addEventListener("seeked", resolve, { once: true });
        video.addEventListener("error", reject, { once: true });
      });

      let w = video.videoWidth;
      let h = video.videoHeight;
      if (!w || !h) continue;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
      frames.push(btoa(binary));
    }

    if (!frames.length) throw new Error("No video frames");
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

globalThis.extractVideoFrames = extractVideoFrames;
