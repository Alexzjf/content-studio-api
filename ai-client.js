const HOSTED_API_URL =
  typeof EXTENSION_CONFIG !== "undefined" && EXTENSION_CONFIG.hostedApiUrl
    ? EXTENSION_CONFIG.hostedApiUrl
    : "http://localhost:8787";

function languageHint(postLang) {
  return globalThis.PromptHints?.languageHint(postLang) || "Match the language of the sources or the user's message.";
}

function styleHint(postStyle) {
  return (
    globalThis.PromptHints?.styleHint(postStyle) ||
    globalThis.PromptHints?.POST_STYLE_HINTS?.punchy ||
    ""
  );
}

function lengthHint(postLength) {
  return globalThis.PromptHints?.lengthHint(postLength) || "";
}

function emojiHint(emojiMode) {
  return globalThis.PromptHints?.emojiHint(emojiMode) || "";
}

function perspectiveHint(perspective) {
  return globalThis.PromptHints?.perspectiveHint(perspective) || "";
}

function formatSourcesBlock(sources, mode = "qa") {
  if (!sources?.length) return "(No sources added yet)";

  return sources
    .map((src, i) => {
      let body = src.content || "";
      if ((src.type === "video" || src.type === "audio") && globalThis.TranscriptUtils) {
        body =
          mode === "post"
            ? globalThis.TranscriptUtils.prepareTranscriptForPost(body)
            : globalThis.TranscriptUtils.compressLongTranscript(body);
      } else if (body.length > 14000 && globalThis.TranscriptUtils) {
        body = globalThis.TranscriptUtils.compressLongTranscript(body);
      } else if (body.length > 14000) {
        body = `${body.slice(0, 14000)}…`;
      }
      return `### Source ${i + 1}: ${src.name} [${src.type}]
${body}`;
    })
    .join("\n\n");
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
    return (
      "AI IDENTITY: You are Cursor Cloud Agent. If asked which AI you are, say Cursor — not Gemini."
    );
  }
  if (p === "gemini") {
    return "AI IDENTITY: You are Google Gemini (user's own API key). If asked, say Gemini.";
  }
  if (p === "openai") {
    return "AI IDENTITY: You are OpenAI ChatGPT. If asked, say OpenAI — not Cursor or Gemini.";
  }
  if (p === "anthropic") {
    return "AI IDENTITY: You are Anthropic Claude. If asked, say Claude.";
  }
  const labels = {
    groq: "Groq",
    mistral: "Mistral",
    deepseek: "DeepSeek",
    openrouter: "OpenRouter",
  };
  const name = labels[p] || p;
  return `AI IDENTITY: You are ${name}. If asked which AI you are, answer ${name}.`;
}

function hasSourceContent(sources) {
  return Array.isArray(sources) && sources.some((s) => s?.content?.trim());
}

function buildGeneralChatPrompt(settings) {
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

function buildQaSystemPrompt(sources, settings) {
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

function buildPostSystemPrompt(sources, settings) {
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

function buildSystemPrompt(sources, settings) {
  if (settings.commentMode && globalThis.CommentPrompt?.buildCommentSystemPrompt) {
    return globalThis.CommentPrompt.buildCommentSystemPrompt(sources, settings);
  }
  if (!hasSourceContent(sources)) {
    return buildGeneralChatPrompt(settings);
  }
  const mode = settings.chatMode === "post" ? "post" : "qa";
  return mode === "post"
    ? buildPostSystemPrompt(sources, settings)
    : buildQaSystemPrompt(sources, settings);
}

function buildSourcesSystemPrompt(sources, settings) {
  return buildSystemPrompt(sources, settings);
}

function normalizeModelName(raw, fallback) {
  if (!raw?.trim()) return fallback;
  const cleaned = raw.trim().split(/\s+[—–|-]\s+/)[0].trim();
  const match = cleaned.match(/^[a-zA-Z0-9][a-zA-Z0-9._:/+\-]*$/);
  return match ? match[0] : fallback;
}

function temperature(settings) {
  return Number(settings.temperature ?? 0.85);
}

async function fetchWithTimeout(url, options, ms, providerLabel, externalSignal) {
  if (externalSignal?.aborted) {
    throw new Error("__chat_aborted__");
  }
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (externalSignal?.aborted) {
      throw new Error("__chat_aborted__");
    }
    if (err.name === "AbortError") {
      throw new Error(`${providerLabel} занадто довго відповідає. Спробуйте ще раз або змініть модель.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

function normalizeGeminiModel(raw, fallback) {
  const cleaned = normalizeModelName(raw, fallback);
  if (/gemini-1\.5/i.test(cleaned)) return "gemini-2.5-flash";
  return cleaned;
}

function geminiModelsToTry(settings) {
  const preferred = normalizeGeminiModel(settings.geminiModel, "gemini-2.5-flash");
  return [...new Set([preferred, ...GEMINI_FALLBACK_MODELS])];
}

function parseGeminiError(body, status) {
  let errMsg = body;
  try {
    errMsg = JSON.parse(body)?.error?.message || body;
  } catch {
    /* keep raw */
  }
  return { errMsg, status };
}

function formatGeminiError(status, errMsg, model) {
  if (status === 400 && /API key/i.test(errMsg)) {
    return "Невірний Gemini API ключ. Перевірте ключ на aistudio.google.com/apikey";
  }
  if (/limit:\s*0/i.test(errMsg)) {
    return `Модель "${model}" недоступна на безкоштовному tier (ліміт 0). Оберіть gemini-2.5-flash у Налаштуваннях.`;
  }
  if (
    status === 429 ||
    /high demand|overloaded|try again later|experiencing|resource.?exhausted|rate limit|too many requests/i.test(
      errMsg
    )
  ) {
    return "Асистент тимчасово зайнятий. Спробуйте ще раз.";
  }
  if (/not found|not supported|does not exist/i.test(errMsg)) {
    return "Модель Gemini недоступна. Використовуйте gemini-2.5-flash.";
  }
  return `Gemini: ${errMsg}`;
}

function geminiSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableGeminiError(status, errMsg) {
  if (/not found|not supported|does not exist/i.test(errMsg)) return true;
  if (/high demand|overloaded|try again later|experiencing|unavailable|resource.?exhausted/i.test(errMsg)) {
    return true;
  }
  return status === 429 || status === 503 || /limit:\s*0/i.test(errMsg);
}

async function geminiCallModel(apiKey, model, payload, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    90000,
    "Gemini",
    signal
  );
  const body = await response.text();
  return { response, body, model };
}

async function geminiGenerate(settings, { systemText, history, userParts }, signal) {
  const apiKey = ownApiKey(settings, "gemini");
  if (!apiKey) {
    throw new Error("Вкажіть Gemini API ключ у Налаштуваннях (aistudio.google.com/apikey)");
  }

  const contents = [];
  for (const msg of history) {
    if (msg.role === "system") continue;
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }
  if (userParts) {
    contents.push({ role: "user", parts: userParts });
  }

  const payload = {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents,
    generationConfig: { temperature: temperature(settings) },
  };

  const models = geminiModelsToTry(settings);
  let lastError = "";

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    for (let attempt = 0; attempt < 3; attempt++) {
      const { response, body } = await geminiCallModel(apiKey, model, payload, signal);

      if (response.ok) {
        const data = JSON.parse(body);
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
        if (!text) throw new Error("Gemini повернув порожню відповідь");
        return text;
      }

      const { errMsg, status } = parseGeminiError(body, response.status);
      lastError = formatGeminiError(status, errMsg, model);

      const retryable = isRetryableGeminiError(status, errMsg);
      if (retryable && attempt < 2) {
        await geminiSleep(700 + attempt * 800);
        continue;
      }
      if (retryable && i < models.length - 1) break;
      if (!retryable) break;
    }
  }

  throw new Error(lastError || "Gemini: не вдалось отримати відповідь");
}

function ownApiKey(settings, provider) {
  const p = provider || settings.aiProvider;
  if (settings.ownApiKeys?.[p]?.trim()) return settings.ownApiKeys[p].trim();
  if (settings.aiOwnProvider === p && settings.ownApiKey?.trim()) return settings.ownApiKey.trim();
  if (p === "gemini" && settings.geminiApiKey?.trim()) return settings.geminiApiKey.trim();
  if (p === "openrouter" && settings.openrouterApiKey?.trim()) return settings.openrouterApiKey.trim();
  if (p === "openai" && settings.openaiApiKey?.trim()) return settings.openaiApiKey.trim();
  if (p === "anthropic" && settings.anthropicApiKey?.trim()) return settings.anthropicApiKey.trim();
  if (p === "cursor" && settings.cursorApiKey?.trim()) return settings.cursorApiKey.trim();
  if (p === "groq" && settings.groqApiKey?.trim()) return settings.groqApiKey.trim();
  if (p === "mistral" && settings.mistralApiKey?.trim()) return settings.mistralApiKey.trim();
  if (p === "deepseek" && settings.deepseekApiKey?.trim()) return settings.deepseekApiKey.trim();
  return "";
}

function ownModel(settings, provider, fallback) {
  const p = provider || settings.aiProvider;
  if (settings.ownModels?.[p]?.trim()) return settings.ownModels[p].trim();
  if (settings.aiOwnProvider === p && settings.ownModel?.trim()) return settings.ownModel.trim();
  if (p === "gemini" && settings.geminiModel) return settings.geminiModel;
  if (p === "openrouter" && settings.openrouterModel) return settings.openrouterModel;
  const meta = globalThis.OWN_AI_PROVIDERS?.[p];
  return fallback || meta?.defaultModel || "gpt-4o-mini";
}

async function openaiCompatibleChat(settings, messages, { url, label, provider }, signal) {
  const apiKey = ownApiKey(settings, provider);
  if (!apiKey) throw new Error(`Вкажіть API ключ ${label} у Налаштуваннях`);
  const model = ownModel(settings, provider, globalThis.OWN_AI_PROVIDERS?.[provider]?.defaultModel);
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: temperature(settings) }),
    },
    90000,
    label,
    signal
  );
  const body = await response.text();
  if (!response.ok) {
    let errMsg = body;
    try {
      errMsg = JSON.parse(body)?.error?.message || JSON.parse(body)?.error || body;
    } catch {
      /* keep */
    }
    throw new Error(`${label}: ${errMsg}`);
  }
  const data = JSON.parse(body);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${label} повернув порожню відповідь`);
  return text;
}

async function anthropicChat(settings, systemText, history, signal) {
  const apiKey = ownApiKey(settings, "anthropic");
  if (!apiKey) throw new Error("Вкажіть Claude API ключ у Налаштуваннях (console.anthropic.com)");
  const model = ownModel(settings, "anthropic", "claude-3-5-haiku-latest");
  const messages = history
    .filter((m) => m.role !== "system" && m.content?.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const response = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemText || undefined,
        messages,
        temperature: temperature(settings),
      }),
    },
    90000,
    "Claude",
    signal
  );
  const body = await response.text();
  if (!response.ok) {
    let errMsg = body;
    try {
      errMsg = JSON.parse(body)?.error?.message || body;
    } catch {
      /* keep */
    }
    throw new Error(`Claude: ${errMsg}`);
  }
  const data = JSON.parse(body);
  const text = data?.content?.map((b) => b.text).join("").trim();
  if (!text) throw new Error("Claude повернув порожню відповідь");
  return text;
}

async function anthropicDescribeImage(imageBase64, settings, prompt) {
  const apiKey = ownApiKey(settings, "anthropic");
  const model = ownModel(settings, "anthropic", "claude-3-5-haiku-latest");
  const response = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    },
    90000,
    "Claude"
  );
  const body = await response.text();
  if (!response.ok) {
    let errMsg = body;
    try {
      errMsg = JSON.parse(body)?.error?.message || body;
    } catch {
      /* keep */
    }
    throw new Error(`Claude: ${errMsg}`);
  }
  const data = JSON.parse(body);
  return data?.content?.map((b) => b.text).join("").trim() || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CURSOR_TERMINAL = new Set(["FINISHED", "ERROR", "CANCELLED", "EXPIRED"]);
let cursorChatSession = { agentId: null };

function resetCursorChatSession() {
  cursorChatSession = { agentId: null };
}

function cursorAuthHeader(apiKey) {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

function normalizeCursorModel(raw) {
  const fallback = globalThis.OWN_AI_PROVIDERS?.cursor?.defaultModel || "composer-2.5";
  const cleaned = normalizeModelName(raw, fallback);
  const aliases = {
    composer: "composer-2.5",
    "composer-latest": "composer-2.5",
    "composer-2": "composer-2.5",
    "composer-2-5": "composer-2.5",
    "composer-0": "composer-2.5",
    "composer-1": "composer-2.5",
    "composer-0.5": "composer-2.5",
    auto: "composer-2.5",
    default: "composer-2.5",
    "claude-4-sonnet-thinking": "claude-opus-4-8",
    "gpt-4o": "composer-2.5",
    "gemini-2.5-flash": "composer-2.5",
  };
  if (aliases[cleaned]) return aliases[cleaned];
  const known = globalThis.OWN_AI_PROVIDERS?.cursor?.models || [];
  if (known.includes(cleaned)) return cleaned;
  return fallback;
}

function parseCursorApiError(body, fallback = "помилка API") {
  try {
    const data = JSON.parse(body);
    return data?.error?.message || data?.message || data?.error || fallback;
  } catch {
    return body?.trim() || fallback;
  }
}

function buildCursorPrompt(systemText, history) {
  const parts = [];
  if (systemText?.trim()) parts.push(`Instructions:\n${systemText.trim()}`);
  for (const msg of history || []) {
    if (msg.role === "system") continue;
    const label = msg.role === "assistant" ? "Assistant" : "User";
    parts.push(`${label}: ${msg.content}`);
  }
  return parts.join("\n\n").trim();
}

function lastUserMessage(history) {
  for (let i = (history || []).length - 1; i >= 0; i--) {
    if (history[i]?.role === "user" && history[i].content?.trim()) {
      return history[i].content.trim();
    }
  }
  return "";
}

function attachCursorImages(prompt, images) {
  if (!images?.length) return;
  prompt.images = images.map((data) => ({ data, mimeType: "image/jpeg" }));
}

async function waitForCursorRun(apiKey, agentId, runId, signal, onProgress, options = {}) {
  const qaMode = Boolean(options.qaMode);
  const maxPolls = qaMode ? 40 : 50;
  const pollMs = qaMode ? 2000 : 2500;

  onProgress?.(qaMode ? "Cursor запускає чат…" : "Cursor запускає агента…");

  for (let i = 0; i < maxPolls; i++) {
    if (signal?.aborted) throw new Error("__chat_aborted__");
    if (i > 0) await sleep(pollMs);

    if (i === 0 || i % 2 === 0) {
      const secs = i * (pollMs / 1000);
      onProgress?.(
        qaMode
          ? `Cursor думає… ${Math.round(secs)}с (зазвичай 30–120с)`
          : `Cursor думає… (~${Math.min(300, Math.round(secs))}с)`
      );
    }

    const statusRes = await fetchWithTimeout(
      `https://api.cursor.com/v1/agents/${agentId}/runs/${runId}`,
      { headers: { Authorization: cursorAuthHeader(apiKey) } },
      20000,
      "Cursor",
      signal
    );
    const statusBody = await statusRes.text();
    if (!statusRes.ok) {
      throw new Error(`Cursor: ${parseCursorApiError(statusBody)}`);
    }

    const run = JSON.parse(statusBody);
    if (CURSOR_TERMINAL.has(run.status)) {
      const text = (run.result || run.text || "").trim();
      if (run.status === "FINISHED") {
        if (text) return text;
        throw new Error(
          "Cursor: порожня відповідь. Спробуйте модель composer-2.5."
        );
      }
      throw new Error(`Cursor: ${text || run.status || "запит не вдався"}`);
    }
  }

  throw new Error(
    qaMode
      ? "Cursor: час очікування вичерпано (~3 хв). Спробуйте ще раз або коротше повідомлення."
      : "Cursor: час очікування вичерпано. Спробуйте ще раз."
  );
}

function buildCursorModelSelection(model) {
  const id = normalizeCursorModel(model);
  if (id === "default") {
    return { id: "default" };
  }
  if (id === "claude-opus-4-8") {
    return {
      id,
      params: [
        { id: "cyber", value: "false" },
        { id: "thinking", value: "false" },
        { id: "context", value: "300k" },
        { id: "effort", value: "low" },
        { id: "fast", value: "true" },
      ],
    };
  }
  return {
    id,
    params: [{ id: "fast", value: "true" }],
  };
}

function cursorQaPrefix() {
  return (
    "You are a helpful chat assistant inside cheatXtwitter (X/Twitter writing tool). " +
    "Reply in plain text only — no code changes, no tools, no repository work. " +
    "Keep answers concise (1–8 sentences). Match the user's language (Ukrainian if they write in Ukrainian).\n\n"
  );
}

function cursorFollowUpPrefix() {
  return "Continue the chat. Plain text reply only, same language as the user.\n\n";
}

async function cursorArchiveAgent(apiKey, agentId) {
  if (!agentId) return;
  try {
    await fetchWithTimeout(
      `https://api.cursor.com/v1/agents/${agentId}/archive`,
      { method: "POST", headers: { Authorization: cursorAuthHeader(apiKey) } },
      15000,
      "Cursor"
    );
  } catch {
    /* ignore */
  }
  resetCursorChatSession();
}

async function cursorCreateAgent(apiKey, body, signal, retried = false) {
  const createRes = await fetchWithTimeout(
    "https://api.cursor.com/v1/agents",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: cursorAuthHeader(apiKey),
      },
      body: JSON.stringify(body),
    },
    120000,
    "Cursor",
    signal
  );

  const createBody = await createRes.text();
  if (!createRes.ok) {
    const errCode = (() => {
      try {
        return JSON.parse(createBody)?.error?.code || "";
      } catch {
        return "";
      }
    })();
    if (!retried && errCode === "invalid_model") {
      const retryBody = {
        ...body,
        model: buildCursorModelSelection("composer-2.5"),
      };
      return cursorCreateAgent(apiKey, retryBody, signal, true);
    }
    throw new Error(`Cursor: ${parseCursorApiError(createBody)}`);
  }

  const created = JSON.parse(createBody);
  const agentId = created?.agent?.id || created?.run?.agentId;
  const runId = created?.run?.id || created?.agent?.latestRunId;
  if (!agentId || !runId) throw new Error("Cursor: неочікувана відповідь API");
  return { agentId, runId };
}

async function cursorFollowUpRun(apiKey, agentId, body, signal) {
  const res = await fetchWithTimeout(
    `https://api.cursor.com/v1/agents/${agentId}/runs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: cursorAuthHeader(apiKey),
      },
      body: JSON.stringify(body),
    },
    120000,
    "Cursor",
    signal
  );

  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(`Cursor: ${parseCursorApiError(raw)}`);
    err.status = res.status;
    throw err;
  }

  const data = JSON.parse(raw);
  const runId = data?.run?.id;
  if (!runId) throw new Error("Cursor: неочікувана відповідь follow-up");
  return runId;
}

async function cursorAgentRequest(settings, { systemText, history, images }, signal) {
  const apiKey = ownApiKey(settings, "cursor");
  if (!apiKey) {
    throw new Error("Вкажіть Cursor API ключ у Налаштуваннях (cursor.com/dashboard → API Keys)");
  }

  const qaMode = settings.chatMode !== "post";
  const model = normalizeCursorModel(ownModel(settings, "cursor", "composer-2.5"));
  const onProgress = typeof settings?._onCursorProgress === "function" ? settings._onCursorProgress : null;
  let agentId = settings?._cursorAgentId || cursorChatSession.agentId;
  const canFollowUp = Boolean(agentId) && (history || []).some((m) => m.role === "assistant");
  let runId;

  if (canFollowUp) {
    const followText = lastUserMessage(history);
    if (!followText) throw new Error("Cursor: порожній запит");
    const body = {
      prompt: { text: qaMode ? cursorFollowUpPrefix() + followText : followText },
    };
    attachCursorImages(body.prompt, images);
    try {
      runId = await cursorFollowUpRun(apiKey, agentId, body, signal);
    } catch (err) {
      if (err.status === 404 || err.status === 409) {
        resetCursorChatSession();
        agentId = null;
      } else {
        throw err;
      }
    }
  }

  if (!runId) {
    let promptText = buildCursorPrompt(systemText, history);
    if (!promptText) throw new Error("Cursor: порожній запит");
    if (qaMode) promptText = cursorQaPrefix() + promptText;

    const body = {
      prompt: { text: promptText },
      model: buildCursorModelSelection(model),
    };
    attachCursorImages(body.prompt, images);

    const created = await cursorCreateAgent(apiKey, body, signal);
    agentId = created.agentId;
    runId = created.runId;
    cursorChatSession.agentId = agentId;
    if (settings) settings._cursorAgentId = agentId;
  }

  const text = await waitForCursorRun(apiKey, agentId, runId, signal, onProgress, { qaMode });
  return text;
}

async function openrouterChat(settings, messages, signal) {
  const apiKey = ownApiKey(settings, "openrouter");
  if (!apiKey) {
    throw new Error("Вкажіть OpenRouter API ключ у Налаштуваннях (openrouter.ai/keys)");
  }

  const model = normalizeModelName(
    ownModel(settings, "openrouter", "anthropic/claude-3.5-haiku"),
    "anthropic/claude-3.5-haiku"
  );
  const response = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "chrome-extension://twitter-post-extension",
        "X-Title": "cheatXtwitter",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature(settings),
      }),
    },
    90000,
    "OpenRouter",
    signal
  );

  const body = await response.text();
  if (!response.ok) {
    let errMsg = body;
    try {
      errMsg = JSON.parse(body)?.error?.message || body;
    } catch {
      /* keep raw */
    }
    throw new Error(`OpenRouter помилка: ${errMsg}`);
  }

  const data = JSON.parse(body);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter повернув порожню відповідь");
  return text;
}

async function ollamaChat(messages, settings, signal) {
  const base = (settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
  const model = normalizeModelName(settings.ollamaModel, "llama3.2:latest");

  const response = await fetchWithTimeout(
    `${base}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { num_ctx: 16384, temperature: temperature(settings) },
      }),
    },
    180000,
    "Ollama",
    signal
  );

  if (!response.ok) {
    const body = await response.text();
    let errMsg = "";
    try {
      errMsg = JSON.parse(body)?.error || "";
    } catch {
      errMsg = body;
    }

    if (response.status === 404 || /not found/i.test(errMsg)) {
      throw new Error(`Модель "${model}" не встановлена. Виконайте: ollama pull ${model}`);
    }
    if (response.status === 400 && /invalid model name/i.test(errMsg)) {
      throw new Error(`Невірна назва моделі Ollama: "${settings.ollamaModel}"`);
    }
    if (response.status === 403) {
      throw new Error("Ollama HTTP 403 — запустіть ./setup-ollama-mac.sh");
    }
    throw new Error(`Ollama помилка (HTTP ${response.status}): ${body || "порожня відповідь"}`);
  }

  const data = await response.json();
  const text = data?.message?.content?.trim();
  if (!text) throw new Error("Ollama повернув порожню відповідь");
  return text;
}

function buildOpenAIMessages(systemText, history) {
  return [{ role: "system", content: systemText }, ...history];
}

async function getExtensionClientId() {
  try {
    return chrome.runtime.id || "unknown";
  } catch {
    return "unknown";
  }
}

async function hostedRequest(path, body, settings, signal) {
  const primary = (settings.hostedApiUrl || HOSTED_API_URL).replace(/\/$/, "");
  const bases = [primary];

  let lastError = "";
  for (const base of bases) {
    if (signal?.aborted) throw new Error("__chat_aborted__");
    const clientId = await getExtensionClientId();
    const headers = {
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
    };
    if (base.includes("loca.lt")) {
      headers["Bypass-Tunnel-Reminder"] = "true";
    }

    try {
      const response = await fetchWithTimeout(
        `${base}${path}`,
        { method: "POST", headers, body: JSON.stringify(body) },
        90000,
        "Cloud",
        signal
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg =
          response.status === 503
            ? base.includes("localhost") || base.includes("127.0.0.1")
              ? "Локальний сервер AI не запущений. cd server && npm start"
              : "__silent_ai__"
            : /зайнят|quota|rate limit|Ліміт/i.test(data?.error || "")
              ? "__silent_ai__"
              : data.error || `Cloud API error (${response.status})`;
        lastError = msg;
        if (response.status === 503 && bases.length > 1) continue;
        if (response.status === 404 && bases.length > 1) {
          lastError = msg;
          continue;
        }
        throw new Error(msg);
      }
      if (!data.text?.trim()) throw new Error("Empty AI response");
      return data.text.trim();
    } catch (err) {
      if (err.message === "__chat_aborted__") throw err;
      if (bases.length > 1 && /503|fetch|tunnel/i.test(err.message)) {
        lastError = err.message;
        continue;
      }
      throw err;
    }
  }

  throw new Error(lastError || "__silent_ai__");
}

async function hostedChat(sources, settings, history, signal) {
  return hostedRequest("/v1/chat", { sources, settings, history }, settings, signal);
}

async function hostedDescribeImage(imageBase64, settings) {
  return hostedRequest("/v1/describe-image", { imageBase64, settings }, settings);
}

async function chatWithSources(sources, settings, history, signal) {
  const systemText = buildSourcesSystemPrompt(sources, settings);
  const provider = settings.aiProvider || "hosted";

  if (provider === "cursor") {
    return cursorAgentRequest(settings, { systemText, history }, signal);
  }

  if (provider === "hosted") {
    return hostedChat(sources, settings, history, signal);
  }

  if (provider === "gemini") {
    return geminiGenerate(settings, { systemText, history }, signal);
  }

  if (provider === "openrouter") {
    return openrouterChat(settings, buildOpenAIMessages(systemText, history), signal);
  }

  if (provider === "anthropic") {
    return anthropicChat(settings, systemText, history, signal);
  }

  const meta = globalThis.OWN_AI_PROVIDERS?.[provider];
  if (meta?.openaiCompat) {
    return openaiCompatibleChat(settings, buildOpenAIMessages(systemText, history), {
      url: meta.openaiCompat,
      label: meta.providerLabel,
      provider,
    }, signal);
  }

  return ollamaChat(buildOpenAIMessages(systemText, history), settings, signal);
}

async function describeImage(imageBase64, settings) {
  const provider = settings.aiProvider || "hosted";
  const prompt =
    "Describe this image in detail for a social media writer. Include: what is shown, visible text, brands/logos, UI, people and actions, mood. Be factual, 150-400 words. Same language as any text in the image, otherwise Ukrainian or English.";

  if (provider === "hosted") {
    return hostedDescribeImage(imageBase64, settings);
  }

  if (provider === "gemini") {
    return geminiGenerate(settings, {
      userParts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
      ],
    });
  }

  if (provider === "openrouter") {
    return openrouterChat(settings, [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ]);
  }

  if (provider === "anthropic") {
    return anthropicDescribeImage(imageBase64, settings, prompt);
  }

  if (provider === "cursor") {
    return cursorAgentRequest(settings, {
      systemText: prompt,
      history: [],
      images: [imageBase64],
    });
  }

  if (provider === "openai") {
    const meta = globalThis.OWN_AI_PROVIDERS?.openai;
    return openaiCompatibleChat(
      settings,
      [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      { url: meta.openaiCompat, label: "OpenAI", provider: "openai" }
    );
  }

  const meta = globalThis.OWN_AI_PROVIDERS?.[provider];
  if (meta?.openaiCompat) {
    return openaiCompatibleChat(
      settings,
      [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      { url: meta.openaiCompat, label: meta.providerLabel, provider }
    );
  }

  const model = normalizeModelName(settings.visionModel, "llava");
  return ollamaChat(
    [
      {
        role: "user",
        content: prompt,
        images: [imageBase64],
      },
    ],
    { ...settings, ollamaModel: model }
  );
}

globalThis.chatWithSources = chatWithSources;
globalThis.describeImage = describeImage;
globalThis.resetCursorChatSession = resetCursorChatSession;
if (typeof window !== "undefined") {
  window.chatWithSources = chatWithSources;
  window.describeImage = describeImage;
}
