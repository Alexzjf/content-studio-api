const FALLBACK_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"];

function normalizeModel(model) {
  const m = String(model || "gemini-2.5-flash-lite")
    .trim()
    .replace(/^models\//, "");
  if (/gemini-1\.5/i.test(m)) return "gemini-2.5-flash-lite";
  return m || "gemini-2.5-flash-lite";
}

function isModelUnavailable(status, errMsg) {
  return (
    status === 404 ||
    /not found|not supported|does not exist|is not found for api version/i.test(errMsg)
  );
}

function isRateLimited(status, errMsg) {
  return status === 429 || /quota|rate limit|resource.?exhausted|too many requests/i.test(errMsg);
}

export function retryAfterSec(errMsg) {
  const m = String(errMsg || "").match(/retry in ([\d.]+)s/i);
  return m ? Math.ceil(Number(m[1])) : 45;
}

function formatUserError(errMsg) {
  if (/not found|not supported|does not exist/i.test(errMsg)) {
    return "Модель Gemini недоступна. У server/.env: GEMINI_MODEL=gemini-2.5-flash-lite";
  }
  if (isRateLimited(429, errMsg)) {
    return `Ліміт Gemini. Зачекайте ~${retryAfterSec(errMsg)} сек і натисніть «Згенеруй пост» ще раз.`;
  }
  if (/high demand|overloaded|try again later/i.test(errMsg)) {
    return "Gemini перевантажений. Зачекайте 30 сек і спробуйте ще раз.";
  }
  return errMsg;
}

async function callGemini(apiKey, model, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  let errMsg = body;
  try {
    errMsg = JSON.parse(body)?.error?.message || body;
  } catch {
    /* keep */
  }
  return { response, body, errMsg };
}

export async function geminiGenerate(
  apiKey,
  { model, systemText, history = [], userParts, temperature = 0.85, maxOutputTokens }
) {
  const preferred = normalizeModel(model);
  const models = [...new Set([preferred, ...FALLBACK_MODELS.map(normalizeModel)])];
  let lastError = "Gemini request failed";
  let lastRateLimit = null;

  const contents = [];
  for (const msg of history) {
    if (msg.role === "system") continue;
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }
  if (userParts?.length) {
    contents.push({ role: "user", parts: userParts });
  }

  const payload = {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents,
    generationConfig: {
      temperature: Number(temperature),
      ...(maxOutputTokens ? { maxOutputTokens: Number(maxOutputTokens) } : {}),
    },
  };

  for (const m of models) {
    const { response, body, errMsg } = await callGemini(apiKey, m, payload);

    if (response.ok) {
      const data = JSON.parse(body);
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
      if (!text) throw new Error("Empty Gemini response");
      return text;
    }

    lastError = errMsg;

    if (isRateLimited(response.status, errMsg)) {
      lastRateLimit = { errMsg, retryAfterSec: retryAfterSec(errMsg) };
      break;
    }

    if (isModelUnavailable(response.status, errMsg)) {
      continue;
    }

    throw new Error(formatUserError(errMsg));
  }

  if (lastRateLimit) {
    const err = new Error(formatUserError(lastRateLimit.errMsg));
    err.code = "RATE_LIMIT";
    err.retryAfterSec = lastRateLimit.retryAfterSec;
    throw err;
  }

  throw new Error(formatUserError(lastError));
}
