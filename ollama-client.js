const DEFAULT_SETTINGS = {
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.2:latest",
  visionModel: "llava",
  whisperLang: "auto",
  postLang: "auto",
  postStyle: "punchy",
  temperature: 0.85,
  customInstructions: "",
};

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
};

function languageHint(postLang) {
  return globalThis.PromptHints?.languageHint?.(postLang) || "Match the language of the sources or the user's message.";
}

function styleHint(postStyle) {
  return POST_STYLE_HINTS[postStyle] || POST_STYLE_HINTS.punchy;
}

function formatSourcesBlock(sources) {
  if (!sources?.length) return "(No sources added yet)";

  return sources
    .map((src, i) => {
      const body = src.content.length > 14000 ? `${src.content.slice(0, 14000)}…` : src.content;
      return `### Source ${i + 1}: ${src.name} [${src.type}]
${body}`;
    })
    .join("\n\n");
}

function buildSourcesSystemPrompt(sources, settings) {
  const custom = settings.customInstructions?.trim();
  const customBlock = custom
    ? `\nUSER'S EXTRA RULES (follow these closely):\n${custom}\n`
    : "";

  return `You are a Twitter/X ghostwriter. The user gives you SOURCES (transcripts, text, image descriptions). You help them write posts — not generic summaries.

HARD RULES:
- Use ONLY facts from the sources. Never invent quotes, numbers, or events.
- If something is unclear in the sources, say so briefly — do not guess.
- For Twitter posts: output ONLY the post text (no "Here is your post:", no markdown headers, no bullet lists unless it's a thread).
- Pick ONE angle or hook — do NOT try to cover everything in the sources.
- Avoid AI clichés: "In today's world", "Let's dive in", "game-changer", "unlock", "revolutionize", "it's worth noting", "overall".
- Avoid starting with "In this video" / "У цьому відео" — start with the insight itself.
- No hashtags unless the user explicitly asks.
- ${languageHint(settings.postLang)}
- ${styleHint(settings.postStyle)}
${customBlock}
When the user asks for a thread: number tweets as 1/, 2/, 3/ … each under 280 characters.
When the user asks for a long post/article: use short paragraphs, subheads optional.

SOURCES:
${formatSourcesBlock(sources)}`;
}

function normalizeModelName(raw, fallback = "llama3.2:latest") {
  if (!raw?.trim()) return fallback;
  // Chrome datalist інколи підставляє текст підказки з « — »
  const cleaned = raw.trim().split(/\s+[—–|-]\s+/)[0].trim();
  const match = cleaned.match(/^[a-zA-Z0-9][a-zA-Z0-9._:\-+]*$/);
  return match ? match[0] : fallback;
}

async function ollamaChat(messages, settings) {
  const base = (settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
  const model = normalizeModelName(settings.ollamaModel);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  let response;
  try {
    response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_ctx: 16384,
          temperature: Number(settings.temperature ?? 0.85),
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Ollama занадто довго відповідає (>3 хв). Спробуйте ще раз.");
    }
    throw new Error(
      "Не вдалось підключитись до Ollama. Відкрийте Ollama або запустіть: ollama serve"
    );
  } finally {
    clearTimeout(timeout);
  }

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
      throw new Error(
        `Невірна назва моделі "${settings.ollamaModel}". Вкажіть лише назву, напр. llama3.2:latest або mistral`
      );
    }
    if (response.status === 403) {
      throw new Error(
        'Ollama HTTP 403 — у терміналі: cd ~/Desktop/twitter-post-extension && ./setup-ollama-mac.sh'
      );
    }
    throw new Error(`Ollama помилка (HTTP ${response.status}): ${body || "порожня відповідь"}`);
  }

  const data = await response.json();
  const text = data?.message?.content?.trim();
  if (!text) throw new Error("Ollama повернув порожню відповідь");
  return text;
}

async function chatWithSources(sources, settings, history) {
  const messages = [
    { role: "system", content: buildSourcesSystemPrompt(sources, settings) },
    ...history,
  ];
  return ollamaChat(messages, settings);
}

async function describeImage(imageBase64, settings) {
  const model = normalizeModelName(settings.visionModel, "llava");
  const messages = [
    {
      role: "user",
      content:
        "Describe this image in detail for a social media writer. Include: what is shown, visible text, brands/logos, UI, people and actions, mood. Be factual, 150-400 words. Same language as any text in the image, otherwise English.",
      images: [imageBase64],
    },
  ];
  return ollamaChat(messages, { ...settings, ollamaModel: model });
}

if (typeof self !== "undefined") {
  self.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  self.chatWithSources = chatWithSources;
  self.describeImage = describeImage;
}
