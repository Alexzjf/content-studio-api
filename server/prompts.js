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

function formatSourcesBlock(sources, mode = "qa") {
  if (!sources?.length) return "(No sources added yet)";

  return sources
    .map((src, i) => {
      let body = src.content || "";
      if (src.type === "video" || src.type === "audio") {
        body = mode === "post" ? prepareTranscriptForPost(body) : compressLongTranscript(body);
      } else if (body.length > 14000) {
        body = compressLongTranscript(body);
      }
      return `### Source ${i + 1}: ${src.name} [${src.type}]
${body}`;
    })
    .join("\n\n");
}

function stripVideoIntro(text) {
  const t = String(text || "").trim();
  if (!t) return t;
  const lower = t.toLowerCase();
  if (
    !/none of this is real|created from a prompt|it's thursday|thursday night|nearly \d+\s*pm|literally been (?:created|made)|hard to believe/i.test(
      lower
    )
  ) {
    return t;
  }
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
  return `${head}\n\n[… middle …]\n\n${mid}\n\n[… end …]\n\n${tail}`;
}

function prepareTranscriptForPost(text) {
  return compressLongTranscript(stripVideoIntro(text));
}

function customRulesBlock(settings) {
  const custom = settings.customInstructions?.trim();
  return custom ? `\nUSER'S EXTRA RULES (follow these closely):\n${custom}\n` : "";
}

function aiIdentityBlock(settings = {}) {
  const p = settings.aiProvider || "hosted";
  if (p === "hosted") {
    return (
      "AI IDENTITY: You are the user's personal assistant in cheatXtwitter — a friendly helper for posts, ideas, work, and content on X. " +
      "NEVER mention Google, Gemini, OpenAI, Claude, Cursor, or any AI vendor or model name. " +
      "If asked who you are, say you are their personal assistant (Ukrainian: «твій асистент», «я твій асистент»). " +
      "Do not introduce yourself with a product or company name."
    );
  }
  if (p === "cursor") {
    return "AI IDENTITY: You are Cursor Cloud Agent. If asked, say Cursor — not Gemini.";
  }
  if (p === "gemini") {
    return "AI IDENTITY: You are Google Gemini (user's own API key). If asked, say Gemini.";
  }
  if (p === "openai") {
    return "AI IDENTITY: You are OpenAI ChatGPT. If asked, say OpenAI.";
  }
  if (p === "anthropic") {
    return "AI IDENTITY: You are Anthropic Claude. If asked, say Claude.";
  }
  const labels = { groq: "Groq", mistral: "Mistral", deepseek: "DeepSeek", openrouter: "OpenRouter" };
  const name = labels[p] || p;
  return `AI IDENTITY: You are ${name}. If asked which AI you are, answer ${name}.`;
}

function hasSourceContent(sources) {
  return Array.isArray(sources) && sources.some((s) => s?.content?.trim());
}

export function buildGeneralChatPrompt(settings = {}) {
  const mode = settings.chatMode === "post" ? "post" : "qa";
  if (mode === "post") {
    return `You are a Twitter/X ghostwriter in Content Studio. The user has NO uploaded sources — write from their message and your general knowledge.

VOICE:
- Write AS the user — a creator sharing on X.
- Standalone post — reader has no other context.

RULES:
- Output ONLY the post text (no preamble, no markdown unless thread).
- ${languageHint(settings.postLang)}
- ${styleHint(settings.postStyle)}
- ${lengthHint(settings.postLength)}
- ${emojiHint(settings.emojiMode)}
- ${perspectiveHint(settings.perspective)}
${customRulesBlock(settings)}
When the user asks for a thread: number tweets as 1/, 2/, 3/ … each under 280 characters.`;
  }

  return `You are a helpful AI assistant in Content Studio for X (Twitter).

${aiIdentityBlock(settings)}

YOUR JOB:
- Answer questions, brainstorm ideas, translate text, improve drafts, explain concepts.
- Help write posts when asked — even without uploaded sources.
- When asked to TRANSLATE: output the FULL translation. Do not summarize.
- ${languageHint(settings.postLang)}
${customRulesBlock(settings)}
If the user later adds video/audio/text sources, you will receive them in a SOURCES block.`;
}

export function buildQaSystemPrompt(sources, settings = {}) {
  return `You are a helpful assistant. The user added SOURCES below — video/audio transcripts (speech-to-text), pasted text, or image descriptions.

YOUR JOB:
- Answer questions about the sources accurately and in detail.
- When asked to TRANSLATE: output the FULL translation of the text the user provided. Do NOT summarize or shorten. Keep all paragraphs, details, numbers, names, and examples. Same structure as the original.
- When asked what was said or shown in a video/audio: give a thorough summary — main topic, key points in order, facts, numbers, names, examples, and conclusion.
- Use bullet points or short sections when it helps readability.
- Quote or paraphrase the transcript when useful. Cover the full arc, not just the opening hook.
- Use ONLY information from the sources. Never invent facts, quotes, or events.
- Do NOT write a Twitter/X post unless the user explicitly asks for one.
- ${languageHint(settings.postLang)}

VIDEO/AUDIO NOTE: transcripts come from Whisper speech recognition — they are the spoken content of the file, not a visual description of frames.
${customRulesBlock(settings)}
SOURCES:
${formatSourcesBlock(sources, "qa")}`;
}

export function buildPostSystemPrompt(sources, settings = {}) {
  return `You are a Twitter/X ghostwriter. The user gives you SOURCES (transcripts, text, image descriptions). Your job: turn them into a ready-to-publish X post.

VOICE (critical):
- Write AS the user — a creator sharing an insight on X.
- Do NOT write AS the speaker in a video/audio transcript.
- Do NOT retell, translate, or paraphrase the transcript opening line-by-line.
- Skip intros, timestamps, disclaimers ("none of this is real", "I'm AI", "created from a prompt"), and stylistic hooks that only work in video.

POST STRUCTURE:
- Line 1: strong hook about the MAIN IDEA (business tactic, lesson, news, takeaway).
- Body: 1–3 short lines with concrete specifics FROM the sources (numbers, steps, claims).
- Standalone post — reader never watched the source.

HARD RULES:
- Use ONLY facts from the sources. Never invent quotes, numbers, or events.
- Find the TOPIC (what the source is really about) — not the narrator's meta commentary.
- For Twitter posts: output ONLY the post text (no "Here is your post:", no markdown, no bullet lists unless thread).
- Pick ONE angle — do NOT try to cover everything.
- NEVER use generic filler: "це не магія, а техніка", "we just learned", "щойно ми дізнались", "важко повірити", "game-changer", vague lessons without specifics from sources.
- Minimum ~120 characters unless user asked for micro — never a vague 2-sentence summary of the video intro.
- Include at least TWO concrete details from sources (number, step, tool, claim, example).
- Sound like a real X post — punchy, specific, opinionated. Not a Wikipedia summary.
- No hashtags unless the user explicitly asks.
- ${languageHint(settings.postLang)}
- ${styleHint(settings.postStyle)}
- ${lengthHint(settings.postLength)}
- ${emojiHint(settings.emojiMode)}
- ${perspectiveHint(settings.perspective)}
${customRulesBlock(settings)}
When the user asks for a thread: number tweets as 1/, 2/, 3/ … each under 280 characters.
When the user asks for a long post/article: use short paragraphs, subheads optional.

SOURCES:
${formatSourcesBlock(sources, "post")}`;
}

/** @deprecated use buildSystemPrompt */
export function buildSourcesSystemPrompt(sources, settings = {}) {
  return buildSystemPrompt(sources, settings);
}

export function buildSystemPrompt(sources, settings = {}) {
  if (!hasSourceContent(sources)) {
    return buildGeneralChatPrompt(settings);
  }
  const mode = settings.chatMode === "post" ? "post" : "qa";
  return mode === "post"
    ? buildPostSystemPrompt(sources, settings)
    : buildQaSystemPrompt(sources, settings);
}

export const IMAGE_PROMPT =
  "Describe this image in detail for a social media writer. Include: what is shown, visible text, brands/logos, UI, people and actions, mood. Be factual, 150-400 words. Same language as any text in the image, otherwise English or Ukrainian.";
