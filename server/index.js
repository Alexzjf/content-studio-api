import express from "express";
import { mountAuthRoutes } from "./auth.js";
import { readFileSync, existsSync } from "fs";
import { geminiGenerate } from "./gemini.js";
import { createKeyPool, parseApiKeys } from "./key-pool.js";
import { buildSystemPrompt, IMAGE_PROMPT } from "./prompts.js";

function loadEnvFile() {
  const path = new URL(".env", import.meta.url).pathname;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const app = express();
app.use(express.json({ limit: "12mb" }));

const GEMINI_API_KEYS = parseApiKeys(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
const keyPool = createKeyPool(GEMINI_API_KEYS);
const GEMINI_API_KEY = GEMINI_API_KEYS[0] || "";
const EXTENSION_SECRET = process.env.EXTENSION_SECRET || "";
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT_PER_CLIENT || 9999);
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PORT = Number(process.env.PORT || 8787);

const usage = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function checkRateLimit(clientId) {
  const key = `${clientId}:${todayKey()}`;
  const entry = usage.get(key) || { count: 0 };
  if (entry.count >= DAILY_LIMIT) {
    return false;
  }
  entry.count += 1;
  usage.set(key, entry);
  return true;
}

function trimHistory(history, maxMessages = 16, maxChars = 8000) {
  return (Array.isArray(history) ? history : [])
    .filter((h) => h?.role && String(h.content || "").trim())
    .slice(-maxMessages)
    .map((h) => {
      const content = String(h.content);
      if (content.length <= maxChars) return { role: h.role, content };
      return { role: h.role, content: `${content.slice(0, maxChars)}…` };
    });
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin?.startsWith("chrome-extension://")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function authMiddleware(req, res, next) {
  if (!GEMINI_API_KEYS.length) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY" });
  }
  if (EXTENSION_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${EXTENSION_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  const clientId = req.headers["x-client-id"] || req.ip || "anonymous";
  req.clientId = String(clientId).slice(0, 128);
  if (!checkRateLimit(req.clientId)) {
    return res.status(429).json({
      error: `Ліміт сервера: ${DAILY_LIMIT} запитів на день. Завтра або підніміть DAILY_LIMIT_PER_CLIENT у server/.env`,
    });
  }
  next();
}

const API_VERSION = "1.42.3";
const INTERNAL_RETRY_MS = Number(process.env.INTERNAL_RETRY_MS || 90000);
const KEY_COOLDOWN_MS = Number(process.env.KEY_COOLDOWN_MS || 30000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientServerError(err) {
  if (err?.code === "RATE_LIMIT") return true;
  const msg = String(err?.message || "");
  return /тимчасово|зайнят|high demand|quota|rate limit|overloaded|try again|unavailable|resource.?exhausted/i.test(
    msg
  );
}

function isInvalidKeyError(err) {
  const msg = String(err?.message || "");
  return /API key not valid|PERMISSION_DENIED|invalid.*api.*key|API key expired/i.test(msg);
}

async function generateWithKeyRotation(options) {
  const deadline = Date.now() + INTERNAL_RETRY_MS;
  let lastError = null;
  let round = 0;

  while (Date.now() < deadline) {
    const order = keyPool.pickOrder();
    let triedAny = false;

    for (const keyIndex of order) {
      triedAny = true;
      try {
        const text = await geminiGenerate(keyPool.get(keyIndex), {
          ...options,
          fastRotate: true,
        });
        keyPool.onSuccess(keyIndex);
        return text;
      } catch (err) {
        lastError = err;
        if (isInvalidKeyError(err)) {
          keyPool.onInvalid(keyIndex);
          continue;
        }
        if (!isTransientServerError(err)) throw err;
        keyPool.onRateLimit(keyIndex, KEY_COOLDOWN_MS);
        // Instant switch to next key — no wait, user sees only "thinking"
      }
    }

    if (!triedAny) {
      await sleep(400);
      continue;
    }

    round += 1;
    await sleep(Math.min(2000, 400 + round * 250));
  }

  const err = lastError || new Error("Асистент тимчасово зайнятий. Спробуйте ще раз.");
  err.code = "RATE_LIMIT";
  err.retryAfterSec = 3;
  throw err;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: keyPool.size > 0,
    model: DEFAULT_MODEL,
    apiVersion: API_VERSION,
    keys: keyPool.size,
    rotation: "instant-failover",
    fallbacks: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"],
    auth: !!process.env.AUTH_JWT_SECRET || !!EXTENSION_SECRET,
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
  });
});

mountAuthRoutes(app);

app.post("/v1/chat", authMiddleware, async (req, res) => {
  try {
    const { sources = [], settings = {}, history = [] } = req.body || {};
    const trimmedHistory = trimHistory(history);
    const hasSources = sources.some((s) => s?.content?.trim());
    const hasMessage = trimmedHistory.some((h) => h?.content?.trim());
    if (!hasSources && !hasMessage) {
      return res.status(400).json({ error: "Message required" });
    }
    const systemText = buildSystemPrompt(sources, settings);
    const text = await generateWithKeyRotation({
      model: settings.geminiModel || DEFAULT_MODEL,
      systemText,
      history: trimmedHistory,
      temperature: settings.temperature ?? 0.75,
      maxOutputTokens: settings.maxOutputTokens,
    });
    res.json({ text });
  } catch (err) {
    if (err.code === "RATE_LIMIT") {
      return res.status(429).json({
        error: err.message,
        retryAfterSec: err.retryAfterSec || 3,
      });
    }
    const msg = err.message || "AI error";
    if (/тимчасово зайнятий|high demand|overloaded|quota|rate limit/i.test(msg)) {
      return res.status(429).json({ error: msg, retryAfterSec: 3 });
    }
    res.status(502).json({ error: msg });
  }
});

app.post("/v1/describe-image", authMiddleware, async (req, res) => {
  try {
    const { imageBase64, settings = {} } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 required" });
    }
    const text = await generateWithKeyRotation({
      model: settings.geminiModel || DEFAULT_MODEL,
      userParts: [
        { text: IMAGE_PROMPT },
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
      ],
      temperature: 0.4,
    });
    res.json({ text });
  } catch (err) {
    if (err.code === "RATE_LIMIT") {
      return res.status(429).json({
        error: err.message,
        retryAfterSec: err.retryAfterSec || 3,
      });
    }
    const msg = err.message || "AI error";
    if (/тимчасово зайнятий|high demand|overloaded|quota|rate limit/i.test(msg)) {
      return res.status(429).json({ error: msg, retryAfterSec: 3 });
    }
    res.status(502).json({ error: msg });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Content Studio API v${API_VERSION}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Model:   ${DEFAULT_MODEL}`);
  console.log(`  Keys:    ${keyPool.size} Gemini key(s) (round-robin)`);
  console.log(`  Fallback models: gemini-2.5-flash, gemini-2.0-flash, gemini-2.5-flash-lite`);
  console.log(`  Network: http://0.0.0.0:${PORT}`);
  if (!GEMINI_API_KEYS.length) {
    console.warn("Warning: set GEMINI_API_KEY in server/.env or Render Environment");
  }
});
