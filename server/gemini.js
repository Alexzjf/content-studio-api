const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"];

function normalizeModel(model) {
  const m = String(model || "gemini-2.5-flash")
    .trim()
    .replace(/^models\//, "");
  if (/gemini-1\.5/i.test(m)) return "gemini-2.5-flash";
  return m || "gemini-2.5-flash";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isModelUnavailable(status, errMsg) {
  return (
    status === 404 ||
    /not found|not supported|does not exist|is not found for api version/i.test(errMsg)
  );
}

function isTransient(status, errMsg) {
  const msg = String(errMsg || "");
  return (
    status === 429 ||
    status === 503 ||
    /quota|rate limit|resource.?exhausted|too many requests|high demand|overloaded|try again later|unavailable/i.test(
      msg
    )
  );
}

export function retryAfterSec(errMsg) {
  const m = String(errMsg || "").match(/retry in ([\d.]+)s/i);
  if (m) return Math.min(5, Math.max(1, Math.ceil(Number(m[1]))));
  return 2;
}

function backoffMs(attempt) {
  return 600 + attempt * 500;
}

function formatUserError(errMsg) {
  if (/not found|not supported|does not exist/i.test(errMsg)) {
    return "Модель асистента недоступна. Спробуйте ще раз.";
  }
  if (/PERMISSION_DENIED|API key not valid|blocked/i.test(errMsg)) {
    return "Асистент тимчасово недоступний. Спробуйте ще раз.";
  }
  if (isTransient(429, errMsg)) {
    return "Асистент тимчасово зайнятий. Спробуйте ще раз.";
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
  { model, systemText, history = [], userParts, temperature = 0.85, maxOutputTokens, fastRotate = false }
) {
  const preferred = normalizeModel(model);
  const models = [...new Set([preferred, ...FALLBACK_MODELS.map(normalizeModel)])];
  const maxTries = fastRotate ? 1 : 5;
  let lastError = "Gemini request failed";
  let lastTransient = null;

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
    for (let attempt = 0; attempt < maxTries; attempt++) {
      const { response, body, errMsg } = await callGemini(apiKey, m, payload);

      if (response.ok) {
        const data = JSON.parse(body);
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
        if (!text) throw new Error("Empty Gemini response");
        return text;
      }

      lastError = errMsg;

      if (isModelUnavailable(response.status, errMsg)) {
        break;
      }

      if (isTransient(response.status, errMsg)) {
        lastTransient = { errMsg, retryAfterSec: retryAfterSec(errMsg) };
        if (fastRotate) break;
        if (attempt < maxTries - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
        break;
      }

      throw new Error(formatUserError(errMsg));
    }
  }

  if (lastTransient) {
    const err = new Error(formatUserError(lastTransient.errMsg));
    err.code = "RATE_LIMIT";
    err.retryAfterSec = lastTransient.retryAfterSec;
    throw err;
  }

  throw new Error(formatUserError(lastError));
}
