/** Shared AI prompt modifiers — loaded by ai-client.js (importScripts) */
const POST_STYLE_HINTS = {
  punchy:
    "Style: sharp Twitter/X voice. Strong hook in the first line. Short lines, one idea per line. Concrete details from sources — no vague summaries.",
  casual:
    "Style: personal, conversational, like texting a smart friend. First person is OK. Light humor OK if it fits the sources.",
  expert:
    "Style: authoritative but readable. One clear insight or takeaway. No buzzwords. Sound like a practitioner, not a press release.",
  story:
    "Style: mini-story or scene from the sources. Start in the middle of the action. End with a punchline or lesson.",
  news:
    "Style: news headline energy. Lead with the most newsworthy fact. Neutral tone, tight wording.",
  minimal:
    "Style: ultra-short. 1–3 sentences max unless the user asks for more. Every word must earn its place.",
  sarcastic:
    "Style: dry wit and light sarcasm — never mean or punch down. Smart observations, ironic twists, still grounded in source facts.",
  motivational:
    "Style: energizing and forward-looking. Turn insights into a clear takeaway the reader can act on. No toxic positivity.",
  provocative:
    "Style: bold, contrarian angle that challenges a common assumption — but stay factual and defensible from the sources.",
  poetic:
    "Style: vivid imagery and rhythm. Metaphors OK if they clarify, not decorate. Still readable on a phone screen.",
  technical:
    "Style: builder/dev energy. Precise terms, concrete mechanisms, what actually happens under the hood. No hand-waving.",
  degen:
    "Style: crypto-Twitter / internet-native voice. Punchy, slightly irreverent, insider tone — only if the sources support it.",
  warm:
    "Style: empathetic, human, encouraging. Acknowledge the reader's situation. Gentle but not cheesy.",
  contrarian:
    "Style: 'everyone thinks X, but actually Y' framing. One sharp reframe backed by specifics from the sources.",
};

const POST_LENGTH_HINTS = {
  auto: "Length: match what the user asks for; default to one strong tweet unless they want more.",
  micro: "Length: ultra-compact — aim for under 120 characters when possible.",
  short: "Length: one tweet, under 280 characters.",
  medium: "Length: 2–4 short paragraphs or a mini-thread feel in one post.",
  long: "Length: long-form X post — several short paragraphs, room for nuance.",
};

const EMOJI_HINTS = {
  none: "Emojis: do not use any emojis.",
  light: "Emojis: at most 1 emoji, only if it adds clarity or tone.",
  normal: "Emojis: sparingly, 1–3 max, never every line.",
};

const PERSPECTIVE_HINTS = {
  auto: "Perspective: match the natural voice of the sources.",
  first: "Perspective: write in first person (I / we).",
  second: "Perspective: write in second person (you) — direct address to the reader.",
  third: "Perspective: neutral third person — no I/you unless quoting sources.",
};

function languageHint(postLang) {
  if (postLang === "en") return "Write in English unless the user asks otherwise.";
  if (postLang === "uk") return "Пиши українською, якщо користувач не просить іншу мову.";
  return "Match the language of the sources or the user's message.";
}

function styleHint(postStyle) {
  return POST_STYLE_HINTS[postStyle] || POST_STYLE_HINTS.punchy;
}

function lengthHint(postLength) {
  return POST_LENGTH_HINTS[postLength] || POST_LENGTH_HINTS.auto;
}

function emojiHint(emojiMode) {
  return EMOJI_HINTS[emojiMode] || EMOJI_HINTS.light;
}

function perspectiveHint(perspective) {
  return PERSPECTIVE_HINTS[perspective] || PERSPECTIVE_HINTS.auto;
}

function buildStyleDirectives(settings = {}) {
  return [
    languageHint(settings.postLang),
    styleHint(settings.postStyle),
    lengthHint(settings.postLength),
    emojiHint(settings.emojiMode),
    perspectiveHint(settings.perspective),
  ].join("\n- ");
}

if (typeof globalThis !== "undefined") {
  globalThis.PromptHints = {
    POST_STYLE_HINTS,
    buildStyleDirectives,
    languageHint,
    styleHint,
    lengthHint,
    emojiHint,
    perspectiveHint,
  };
}
