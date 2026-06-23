import express from "express";
import { readFileSync, existsSync } from "fs";
import { geminiGenerate } from "./gemini.js";
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const EXTENSION_SECRET = process.env.EXTENSION_SECRET || "";
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT_PER_CLIENT || 9999);
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
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
  if (!GEMINI_API_KEY) {
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

const API_VERSION = "1.27.0";

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    model: DEFAULT_MODEL,
    apiVersion: API_VERSION,
    fallbacks: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
  });
});

app.post("/v1/chat", authMiddleware, async (req, res) => {
  try {
    const { sources = [], settings = {}, history = [] } = req.body || {};
    const hasSources = sources.some((s) => s?.content?.trim());
    const hasMessage = history.some((h) => h?.content?.trim());
    if (!hasSources && !hasMessage) {
      return res.status(400).json({ error: "Message required" });
    }
    const systemText = buildSystemPrompt(sources, settings);
    const text = await geminiGenerate(GEMINI_API_KEY, {
      model: settings.geminiModel || DEFAULT_MODEL,
      systemText,
      history,
      temperature: settings.temperature ?? 0.75,
      maxOutputTokens: settings.maxOutputTokens,
    });
    res.json({ text });
  } catch (err) {
    if (err.code === "RATE_LIMIT") {
      return res.status(429).json({
        error: err.message,
        retryAfterSec: err.retryAfterSec || 45,
      });
    }
    res.status(502).json({ error: err.message || "AI error" });
  }
});

app.post("/v1/describe-image", authMiddleware, async (req, res) => {
  try {
    const { imageBase64, settings = {} } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 required" });
    }
    const text = await geminiGenerate(GEMINI_API_KEY, {
      model: settings.geminiModel || DEFAULT_MODEL,
      userParts: [
        { text: IMAGE_PROMPT },
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
      ],
      temperature: 0.4,
    });
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: err.message || "AI error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Content Studio API v${API_VERSION}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Model:   ${DEFAULT_MODEL}`);
  console.log(`  Fallback: gemini-2.5-flash-lite, gemini-2.0-flash (no 1.5)`);
  console.log(`  Network: http://0.0.0.0:${PORT} (use tunnel to expose to internet)`);
  if (!GEMINI_API_KEY) {
    console.warn("Warning: set GEMINI_API_KEY in server/.env");
  }
});
