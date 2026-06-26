import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import {
  buildUserProfile,
  createUser,
  createUserWithId,
  findUserById,
  findUserByLoginEmail,
  findUserByPrimaryEmail,
  findUserByProvider,
  getRecoveryEmail,
  initDb,
  isPlaceholderEmail,
  linkProvider,
  setRecoveryEmail,
  updateUserPassword,
  updateUserPrimaryEmail,
} from "./db.js";

initDb();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}

function jwtSecret() {
  return process.env.AUTH_JWT_SECRET || process.env.EXTENSION_SECRET || "change-auth-secret-in-production";
}

const JWT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function signToken(user, provider = "email") {
  const payload = {
    sub: user.id,
    email: user.primary_email,
    name: user.display_name,
    provider,
    exp: Date.now() + JWT_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", jwtSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", jwtSecret()).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function authResponse(userRow) {
  const user = buildUserProfile(userRow);
  return {
    accessToken: signToken(userRow, user.provider || "email"),
    user,
  };
}

function inferOAuthFromEmail(email) {
  const m = String(email || "").match(/^(x|telegram)_([^@]+)@oauth\.cheatxtwitter\.local$/i);
  if (!m) return { provider: "email", providerId: null };
  return { provider: m[1].toLowerCase(), providerId: m[2] };
}

function ensureUserFromJwt(payload) {
  let user = findUserById(payload.sub);
  if (user) return user;
  if (payload.email) {
    user = findUserByPrimaryEmail(payload.email);
    if (user) return user;
  }
  const inferred = inferOAuthFromEmail(payload.email);
  const provider = payload.provider || inferred.provider;
  return createUserWithId({
    id: payload.sub,
    displayName: payload.name || payload.email?.split("@")[0] || "User",
    primaryEmail: payload.email,
    passwordHash: hashPassword(randomUUID()),
    provider,
    providerAccountId: inferred.providerId,
  });
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });
  const user = ensureUserFromJwt(payload);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.authUser = user;
  req.authPayload = payload;
  next();
}

async function loginWithGoogle({ idToken, accessToken } = {}) {
  if (!idToken && !accessToken) throw new Error("Missing Google token");
  const query = idToken
    ? `id_token=${encodeURIComponent(idToken)}`
    : `access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?${query}`);
  if (!res.ok) throw new Error("Invalid Google token");
  const profile = await res.json();
  if (!profile.email || !(profile.sub || profile.user_id)) {
    throw new Error("Google profile incomplete");
  }
  const sub = profile.sub || profile.user_id;
  return findOrCreateOAuthUser("google", sub, profile.email, profile.name || profile.email);
}

async function loginWithTelegram(auth) {
  if (!auth?.hash) throw new Error("Invalid Telegram auth");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("Telegram login not configured on server (TELEGRAM_BOT_TOKEN)");

  const check = { ...auth };
  const hash = String(check.hash);
  delete check.hash;
  const dataCheckString = Object.keys(check)
    .sort()
    .map((k) => `${k}=${check[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (computed !== hash) throw new Error("Telegram auth verification failed");

  const authDate = Number(auth.auth_date || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    throw new Error("Telegram auth expired");
  }

  const id = String(auth.id);
  const email = `telegram_${id}@oauth.cheatxtwitter.local`;
  const name =
    [auth.first_name, auth.last_name].filter(Boolean).join(" ").trim() ||
    auth.username?.toString() ||
    `Telegram ${id}`;
  return findOrCreateOAuthUser("telegram", id, email, name);
}

async function loginWithX(accessToken) {
  if (!accessToken) throw new Error("Missing X token");
  const res = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Invalid X token");
  const body = await res.json();
  const profile = body.data;
  if (!profile?.id) throw new Error("X profile incomplete");
  const email = `x_${profile.id}@oauth.cheatxtwitter.local`;
  const name = profile.name || profile.username || `X user ${profile.id}`;
  return findOrCreateOAuthUser("x", profile.id, email, name);
}

function findOrCreateOAuthUser(provider, providerId, email, name) {
  let user = findUserByProvider(provider, providerId);
  if (!user) user = findUserByPrimaryEmail(email);
  if (!user) {
    user = createUser({
      displayName: name,
      primaryEmail: email,
      passwordHash: hashPassword(randomUUID()),
      provider,
      providerAccountId: providerId,
    });
  } else {
    linkProvider(user.id, provider, providerId);
  }
  return authResponse(user);
}

function normalizeBotUsername(bot) {
  return String(bot || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9_]/g, "");
}

function telegramWidgetPage(bot, redirectUri) {
  const safeBot = normalizeBotUsername(bot);
  if (!safeBot) {
    return "<!DOCTYPE html><body><p>Bot username missing</p></body></html>";
  }
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Telegram</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0c0e;color:#fff;font-family:system-ui,sans-serif}
  .wrap{text-align:center;padding:24px}
  p{color:#9ca3af;font-size:14px}
</style>
</head><body>
<div class="wrap"><p>Sign in with Telegram</p><div id="widget"></div></div>
<script>
  function onTelegramAuth(user) {
    var redirect = ${JSON.stringify(redirectUri || "")};
    if (!redirect) return;
    var url = new URL(redirect);
    url.searchParams.set("payload", encodeURIComponent(JSON.stringify(user)));
    location.href = url.toString();
  }
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://telegram.org/js/telegram-widget.js?22";
  s.setAttribute("data-telegram-login", ${JSON.stringify(safeBot)});
  s.setAttribute("data-size", "large");
  s.setAttribute("data-radius", "8");
  s.setAttribute("data-onauth", "onTelegramAuth(user)");
  s.setAttribute("data-request-access", "write");
  document.getElementById("widget").appendChild(s);
</script>
</body></html>`;
}

export function mountAuthRoutes(app) {
  app.get("/auth/telegram/page", (req, res) => {
    const bot = normalizeBotUsername(req.query.bot);
    const redirectUri = req.query.redirect_uri;
    if (!bot || !redirectUri) {
      return res.status(400).send("bot and redirect_uri required");
    }
    res.type("html").send(telegramWidgetPage(bot, redirectUri));
  });

  app.get("/auth/me", requireAuth, (req, res) => {
    res.json(buildUserProfile(req.authUser));
  });

  app.post("/auth/refresh", requireAuth, (req, res) => {
    res.json(authResponse(req.authUser));
  });

  app.post("/auth/profile/link-email", requireAuth, (req, res) => {
    try {
      const { email, password } = req.body || {};
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: "Invalid email" });
      }
      if (!password || String(password).length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      if (isPlaceholderEmail(cleanEmail)) {
        return res.status(400).json({ error: "Use a real email address" });
      }

      const user = req.authUser;
      const taken = findUserByLoginEmail(cleanEmail);
      if (taken && taken.id !== user.id) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const passwordHash = hashPassword(password);
      updateUserPassword(user.id, passwordHash);
      setRecoveryEmail(user.id, cleanEmail);
      linkProvider(user.id, "email", null);

      if (isPlaceholderEmail(user.primary_email)) {
        updateUserPrimaryEmail(user.id, cleanEmail);
      }

      const updated = findUserById(user.id);
      res.json(authResponse(updated));
    } catch (err) {
      res.status(500).json({ error: err.message || "Could not link email" });
    }
  });

  app.post("/auth/extension-register", (req, res) => {
    try {
      const { name, email, password } = req.body || {};
      const cleanEmail = String(email || "").trim();
      if (!cleanEmail || !password || String(password).length < 6) {
        return res.status(400).json({ error: "Invalid registration data" });
      }
      if (findUserByLoginEmail(cleanEmail)) {
        return res.status(401).json({ error: "Email already registered" });
      }
      const user = createUser({
        displayName: String(name || cleanEmail.split("@")[0] || "User").trim(),
        primaryEmail: cleanEmail,
        passwordHash: hashPassword(password),
        provider: "email",
        providerAccountId: null,
      });
      res.json(authResponse(user));
    } catch (err) {
      res.status(500).json({ error: err.message || "Register failed" });
    }
  });

  app.post("/auth/login", (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = findUserByLoginEmail(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      res.json(authResponse(user));
    } catch (err) {
      res.status(500).json({ error: err.message || "Login failed" });
    }
  });

  app.post("/auth/social", async (req, res) => {
    try {
      const { provider, idToken, accessToken, telegramAuth } = req.body || {};
      let result;
      if (provider === "google") result = await loginWithGoogle({ idToken, accessToken });
      else if (provider === "telegram") result = await loginWithTelegram(telegramAuth);
      else if (provider === "x") result = await loginWithX(accessToken);
      else return res.status(400).json({ error: "Unsupported provider" });
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: err.message || "Social login failed" });
    }
  });

  app.get("/auth/oauth-info", (_req, res) => {
    res.json({
      googleConfigured: !!process.env.GOOGLE_CLIENT_ID,
      telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
      xConfigured: !!process.env.X_CLIENT_ID,
      telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || "",
    });
  });
}
