/**
 * Extract mono 16kHz Float32Array from video/audio file for Whisper.
 */
async function extractAudioFromFile(file, onProgress) {
  onProgress?.("Декодую аудіо...");

  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });

  let audioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioContext.close();
  }

  onProgress?.("Конвертую в mono 16kHz...");

  const mono = mixToMono(audioBuffer);
  const resampled = resampleTo16k(mono, audioBuffer.sampleRate);

  return resampled;
}

function mixToMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleTo16k(samples, sourceRate) {
  const targetRate = 16000;
  if (sourceRate === targetRate) return samples;

  const ratio = sourceRate / targetRate;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    const s0 = samples[idx] ?? 0;
    const s1 = samples[idx + 1] ?? s0;
    result[i] = s0 + frac * (s1 - s0);
  }

  return result;
}

window.extractAudioFromFile = extractAudioFromFile;
