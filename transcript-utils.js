/**
 * Prepare video/audio transcripts for post generation.
 */
const HOOKY_INTRO_RE =
  /none of this is real|created from a prompt|it's thursday|thursday night|nearly \d+\s*pm|literally been (?:created|made)|я виглядаю реалістично|hard to believe|look realistic/i;

function stripVideoIntro(text) {
  const t = String(text || "").trim();
  if (!t) return t;

  if (!HOOKY_INTRO_RE.test(t.toLowerCase())) return t;

  const sentences = t.match(/[^.!?…]+[.!?…]+[\s]*/g) || [t];

  if (sentences.length > 6) {
    const skip = Math.min(8, Math.max(5, Math.floor(sentences.length * 0.3)));
    const rest = sentences.slice(skip).join("").trim();
    if (rest.length > 250) return rest;
  }

  if (sentences.length > 4) {
    const rest = sentences.slice(4).join("").trim();
    if (rest.length > 200) return rest;
  }

  const cut = t.slice(Math.floor(t.length * 0.22)).trim();
  return cut.length > 200 ? cut : t;
}

function compressLongTranscript(text, maxLen = 14000) {
  const t = String(text || "").trim();
  if (t.length <= maxLen) return t;

  const head = t.slice(0, 2000);
  const midPos = Math.floor(t.length * 0.45);
  const mid = t.slice(midPos, midPos + 3500);
  const tail = t.slice(-2500);

  return `${head}\n\n[… середина транскрипту …]\n\n${mid}\n\n[… кінець транскрипту …]\n\n${tail}`;
}

function prepareTranscriptForPost(text) {
  return compressLongTranscript(stripVideoIntro(text));
}

function prepareSourceContentForChat(content, type) {
  const text = String(content || "").trim();
  if (!text) return text;
  return compressLongTranscript(text);
}

function prepareSourceContentForAi(content, type) {
  const text = String(content || "").trim();
  if (!text) return text;
  if (type === "video" || type === "audio") {
    return prepareTranscriptForPost(text);
  }
  return compressLongTranscript(text);
}

if (typeof window !== "undefined") {
  window.TranscriptUtils = {
    stripVideoIntro,
    compressLongTranscript,
    prepareTranscriptForPost,
    prepareSourceContentForChat,
    prepareSourceContentForAi,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.TranscriptUtils = globalThis.TranscriptUtils || {
    stripVideoIntro,
    compressLongTranscript,
    prepareTranscriptForPost,
    prepareSourceContentForChat,
    prepareSourceContentForAi,
  };
}
