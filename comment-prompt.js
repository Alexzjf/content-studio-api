/**
 * AI prompts for X reply comments (loaded in background via importScripts).
 */
function commentLanguageHint(settings = {}) {
  const lang = settings.commentLang || "auto";
  const map = {
    uk: "Write the comment in Ukrainian.",
    en: "Write the comment in English.",
    ru: "Write the comment in Russian.",
    pl: "Write the comment in Polish.",
    de: "Write the comment in German.",
    es: "Write the comment in Spanish.",
    fr: "Write the comment in French.",
  };
  if (lang === "auto") {
    return "Match the language of the post (Ukrainian post → Ukrainian reply, etc.).";
  }
  return map[lang] || map.en;
}

function commentLengthHint(settings = {}) {
  const min = Math.max(20, Number(settings.commentMinLen) || 50);
  const max = Math.min(500, Number(settings.commentMaxLen) || 280);
  return `Length: ${min}–${max} characters. Stay within this range.`;
}

function commentEmojiHint(settings = {}) {
  const mode = settings.commentEmoji || "light";
  if (mode === "none") return "No emojis.";
  if (mode === "normal") return "Emojis allowed sparingly (1–3 max).";
  return "At most one emoji, only if it fits naturally.";
}

function commentStyleHint(settings = {}) {
  const style = settings.commentStyle || "sharp";
  const hints = {
    sharp: "Sharp, concise, opinionated — no fluff.",
    friendly: "Warm and approachable, still specific to the post.",
    witty: "Clever and lightly witty, never cringe or mean.",
    expert: "Knowledgeable insider tone, add one concrete insight.",
    casual: "Relaxed conversational tone, like texting a smart friend.",
  };
  return hints[style] || hints.sharp;
}

function commentExtrasHint(settings = {}) {
  const lines = [];
  if (settings.commentEndWithQuestion) {
    lines.push("When it fits, end with one sharp question — not every time.");
  }
  const custom = settings.commentCustomInstructions?.trim();
  if (custom) {
    lines.push(`USER COMMENT RULES:\n${custom}`);
  }
  return lines.join("\n");
}

function buildCommentSystemPrompt(sources, settings = {}) {
  const style = globalThis.PromptHints?.buildStyleDirectives?.(settings) || "";
  const sourcesBlock = globalThis.formatSourcesBlock
    ? globalThis.formatSourcesBlock(sources, "qa")
    : "(context from post)";

  return `You write ONE reply comment for X/Twitter under someone else's post.

RULES:
- Output ONLY the comment text — no quotes, no "Comment:", no markdown headers.
- ${commentLengthHint(settings)}
- ${commentLanguageHint(settings)}
- ${commentEmojiHint(settings)}
- Style: ${commentStyleHint(settings)}
- Be relevant and specific to the post — add insight, a sharp question, or a witty take grounded in facts.
- Never generic spam ("great post", "thanks for sharing", fire emojis only).
- Do NOT @mention the author unless it feels natural.
- No hashtag spam.
${commentExtrasHint(settings) ? `- ${commentExtrasHint(settings).replace(/\n/g, "\n- ")}` : ""}
${style ? `\nPOST STYLE (if compatible):\n- ${style.replace(/\n/g, "\n- ")}` : ""}

CONTEXT (post + media):
${sourcesBlock}`;
}

function buildCommentUserMessage(context = {}) {
  const author = context.author ? `@${context.author.replace(/^@/, "")}` : "unknown";
  const lines = [`Write a reply comment to this X post by ${author}.`, ""];

  if (context.postText?.trim()) {
    lines.push("POST TEXT:", context.postText.trim(), "");
  }

  if (context.note?.trim()) {
    lines.push("NOTE:", context.note.trim(), "");
  }

  lines.push("Return only the comment body.");
  return lines.join("\n");
}

function extractCommentText(raw, settings = {}) {
  if (!raw) return "";
  let text = String(raw).trim();
  text = text.replace(/^```[\w]*\n?/i, "").replace(/\n?```$/i, "");
  text = text.replace(/^["'«»]|["'«»]$/g, "").trim();
  const max = Math.min(500, Math.max(80, Number(settings.commentMaxLen) || 280));
  if (text.length > max) text = text.slice(0, max).trim();
  return text;
}

function buildAuthorReplySystemPrompt(sources, settings = {}) {
  const style = globalThis.PromptHints?.buildStyleDirectives?.(settings) || "";
  const sourcesBlock = globalThis.formatSourcesBlock
    ? globalThis.formatSourcesBlock(sources, "qa")
    : "(context from post and comment)";

  return `You write ONE reply as the ORIGINAL POST AUTHOR responding to a comment under your X/Twitter post.

RULES:
- Output ONLY the reply text — no quotes, no "Reply:", no markdown headers.
- You ARE the post author — first person, your voice, your brand.
- ${commentLengthHint(settings)}
- ${commentLanguageHint(settings)}
- ${commentEmojiHint(settings)}
- Style: ${commentStyleHint(settings)}
- Acknowledge what the commenter said — answer questions, thank them, push back politely, or add value.
- Be specific to their comment and your original post — never generic "thanks!" spam.
- Do NOT repeat your entire post verbatim.
- @mention the commenter only if it feels natural.
- No hashtag spam.
${commentExtrasHint(settings) ? `- ${commentExtrasHint(settings).replace(/\n/g, "\n- ")}` : ""}
${style ? `\nPOST STYLE (if compatible):\n- ${style.replace(/\n/g, "\n- ")}` : ""}

CONTEXT (your post + their comment + media):
${sourcesBlock}`;
}

function buildAuthorReplyUserMessage(context = {}) {
  const commenter = context.commentAuthor
    ? `@${context.commentAuthor.replace(/^@/, "")}`
    : "a commenter";
  const lines = [
    `Write a reply as the post author to ${commenter}'s comment under your X post.`,
    "",
  ];

  if (context.postText?.trim()) {
    lines.push("YOUR ORIGINAL POST:", context.postText.trim(), "");
  }

  if (context.commentText?.trim()) {
    lines.push("THEIR COMMENT:", context.commentText.trim(), "");
  }

  if (context.note?.trim()) {
    lines.push("NOTE:", context.note.trim(), "");
  }

  lines.push("Return only the reply body.");
  return lines.join("\n");
}

if (typeof globalThis !== "undefined") {
  globalThis.CommentPrompt = {
    buildCommentSystemPrompt,
    buildCommentUserMessage,
    buildAuthorReplySystemPrompt,
    buildAuthorReplyUserMessage,
    extractCommentText,
  };
}
