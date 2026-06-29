import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DB_PATH = join(DATA_DIR, "cheatx.db");
const LEGACY_USERS_FILE = join(DATA_DIR, "users.json");

let db;

const PLACEHOLDER_EMAIL_RE = /@oauth\.cheatxtwitter\.local$/i;

export function isPlaceholderEmail(email) {
  return PLACEHOLDER_EMAIL_RE.test(String(email || ""));
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      primary_email TEXT NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_primary_email ON users(primary_email);

    CREATE TABLE IF NOT EXISTS auth_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('email', 'google', 'telegram', 'x')),
      provider_account_id TEXT,
      linked_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_provider_account
      ON auth_providers(provider, provider_account_id)
      WHERE provider_account_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_auth_providers_user ON auth_providers(user_id);

    CREATE TABLE IF NOT EXISTS recovery_emails (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE,
      verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_email ON recovery_emails(email);

    CREATE TABLE IF NOT EXISTS telegram_connections (
      telegram_user_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connected INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_connections_user ON telegram_connections(user_id);

    CREATE TABLE IF NOT EXISTS provider_profiles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('email', 'google', 'telegram', 'x')),
      profile_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, provider)
    );
  `);

  const row = database.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
  const current = row?.v ?? 0;
  if (current < 1) {
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(1, new Date().toISOString());
  }
  if (current < 2) {
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(2, new Date().toISOString());
  }
  if (current < 3) {
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(3, new Date().toISOString());
  }
  if (current < 4) {
    const cols = database.prepare("PRAGMA table_info(users)").all();
    if (!cols.some((c) => c.name === "last_login_at")) {
      database.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
    }
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(4, new Date().toISOString());
  }
  if (current < 5) {
    const cols = database.prepare("PRAGMA table_info(users)").all();
    if (!cols.some((c) => c.name === "plan")) {
      database.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
    }
    if (!cols.some((c) => c.name === "plan_expires_at")) {
      database.exec("ALTER TABLE users ADD COLUMN plan_expires_at TEXT");
    }
    database.exec(`
      CREATE TABLE IF NOT EXISTS usage_daily (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        requests INTEGER NOT NULL DEFAULT 0,
        videos INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, day)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_daily_day ON usage_daily(day);
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(5, new Date().toISOString());
  }
  if (current < 6) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        provider TEXT NOT NULL DEFAULT 'nowpayments',
        provider_payment_id TEXT,
        invoice_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        paid_at TEXT,
        meta_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider_payment_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(6, new Date().toISOString());
  }
}

function migrateLegacyJson(database) {
  if (!existsSync(LEGACY_USERS_FILE)) return;
  const count = database.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return;

  let legacy = [];
  try {
    legacy = JSON.parse(readFileSync(LEGACY_USERS_FILE, "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(legacy) || !legacy.length) return;

  const insertUser = database.prepare(`
    INSERT INTO users (id, display_name, primary_email, password_hash, created_at, updated_at)
    VALUES (@id, @display_name, @primary_email, @password_hash, @created_at, @updated_at)
  `);
  const insertProvider = database.prepare(`
    INSERT INTO auth_providers (id, user_id, provider, provider_account_id, linked_at)
    VALUES (@id, @user_id, @provider, @provider_account_id, @linked_at)
  `);

  const tx = database.transaction((rows) => {
    for (const u of rows) {
      const now = u.createdAt || new Date().toISOString();
      insertUser.run({
        id: u.id,
        display_name: u.name || "User",
        primary_email: u.email,
        password_hash: u.passwordHash || "",
        created_at: now,
        updated_at: now,
      });
      insertProvider.run({
        id: randomUUID(),
        user_id: u.id,
        provider: u.provider || "email",
        provider_account_id: u.providerId || null,
        linked_at: now,
      });
    }
  });
  tx(legacy);
}

export function initDb() {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  migrateLegacyJson(db);
  return db;
}

export function getDb() {
  return db || initDb();
}

export function findUserById(id) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

export function findUserByPrimaryEmail(email) {
  return (
    getDb()
      .prepare("SELECT * FROM users WHERE lower(primary_email) = lower(?)")
      .get(String(email || "").trim()) || null
  );
}

export function findUserByRecoveryEmail(email) {
  return (
    getDb()
      .prepare(
        `SELECT u.* FROM users u
         INNER JOIN recovery_emails r ON r.user_id = u.id
         WHERE lower(r.email) = lower(?) AND r.verified = 1`
      )
      .get(String(email || "").trim()) || null
  );
}

export function findUserByLoginEmail(email) {
  return findUserByPrimaryEmail(email) || findUserByRecoveryEmail(email);
}

export function findUserByProvider(provider, providerAccountId) {
  return (
    getDb()
      .prepare(
        `SELECT u.* FROM users u
         INNER JOIN auth_providers p ON p.user_id = u.id
         WHERE p.provider = ? AND p.provider_account_id = ?`
      )
      .get(provider, String(providerAccountId)) || null
  );
}

export function getUserProviders(userId) {
  return getDb()
    .prepare("SELECT * FROM auth_providers WHERE user_id = ? ORDER BY linked_at ASC")
    .all(userId);
}

export function getRecoveryEmail(userId) {
  return getDb().prepare("SELECT * FROM recovery_emails WHERE user_id = ?").get(userId) || null;
}

export function createUserWithId({ id, displayName, primaryEmail, passwordHash, provider, providerAccountId }) {
  const database = getDb();
  const existing = findUserById(id) || findUserByPrimaryEmail(primaryEmail);
  if (existing) return existing;

  const now = new Date().toISOString();
  const user = {
    id,
    display_name: displayName,
    primary_email: primaryEmail,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO users (id, display_name, primary_email, password_hash, created_at, updated_at)
         VALUES (@id, @display_name, @primary_email, @password_hash, @created_at, @updated_at)`
      )
      .run(user);
    linkProvider(user.id, provider || "email", providerAccountId || null, now);
  });
  tx();
  return user;
}

export function createUser({ displayName, primaryEmail, passwordHash, provider, providerAccountId }) {
  return createUserWithId({
    id: randomUUID(),
    displayName,
    primaryEmail,
    passwordHash,
    provider,
    providerAccountId,
  });
}

export function linkProvider(userId, provider, providerAccountId, linkedAt) {
  const database = getDb();
  const at = linkedAt || new Date().toISOString();
  if (providerAccountId) {
    const existing = findUserByProvider(provider, providerAccountId);
    if (existing && existing.id !== userId) {
      throw new Error("Provider account already linked to another user");
    }
  }
  const row = database
    .prepare("SELECT id FROM auth_providers WHERE user_id = ? AND provider = ?")
    .get(userId, provider);
  if (row) return;
  database
    .prepare(
      `INSERT INTO auth_providers (id, user_id, provider, provider_account_id, linked_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(randomUUID(), userId, provider, providerAccountId || null, at);
}

export function setRecoveryEmail(userId, email) {
  const database = getDb();
  const now = new Date().toISOString();
  const existing = database.prepare("SELECT user_id FROM recovery_emails WHERE lower(email) = lower(?)").get(email);
  if (existing && existing.user_id !== userId) {
    throw new Error("Email already in use");
  }
  database
    .prepare(
      `INSERT INTO recovery_emails (user_id, email, verified, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         verified = 1,
         updated_at = excluded.updated_at`
    )
    .run(userId, email, now, now);
}

export function updateUserPassword(userId, passwordHash) {
  getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(passwordHash, new Date().toISOString(), userId);
}

export function updateUserPrimaryEmail(userId, email) {
  getDb()
    .prepare("UPDATE users SET primary_email = ?, updated_at = ? WHERE id = ?")
    .run(email, new Date().toISOString(), userId);
}

export function maskEmail(email) {
  const raw = String(email || "");
  const [local, domain] = raw.split("@");
  if (!domain) return raw;
  if (local.length <= 2) return `•••@${domain}`;
  return `${local.slice(0, 2)}•••@${domain}`;
}

export function buildUserProfile(userRow) {
  if (!userRow) return null;
  const providers = getUserProviders(userRow.id);
  const recovery = getRecoveryEmail(userRow.id);
  const placeholder = isPlaceholderEmail(userRow.primary_email);
  const primaryProvider = providers.find((p) => p.provider !== "email") || providers[0];

  return {
    id: userRow.id,
    name: userRow.display_name,
    email: placeholder ? null : userRow.primary_email,
    displayEmail: placeholder ? null : userRow.primary_email,
    provider: primaryProvider?.provider || "email",
    providers: providers.map((p) => ({
      provider: p.provider,
      linkedAt: p.linked_at,
    })),
    isPlaceholderEmail: placeholder,
    recoveryEmail: recovery?.verified ? recovery.email : null,
    recoveryEmailMasked: recovery?.verified ? maskEmail(recovery.email) : null,
    hasRecoveryEmail: !!(recovery?.verified),
    hasPasswordLogin:
      providers.some((p) => p.provider === "email") ||
      !!(recovery?.verified) ||
      !placeholder,
    createdAt: userRow.created_at,
  };
}

export function markTelegramConnected(telegramUserId, userId) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO telegram_connections (telegram_user_id, user_id, connected, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         user_id = excluded.user_id,
         connected = 1,
         updated_at = excluded.updated_at`
    )
    .run(String(telegramUserId), userId, now);
}

export function revokeTelegramConnection(telegramUserId) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE telegram_connections SET connected = 0, updated_at = ?
       WHERE telegram_user_id = ?`
    )
    .run(now, String(telegramUserId));
}

export function isTelegramConnected(telegramUserId) {
  const row = getDb()
    .prepare("SELECT connected FROM telegram_connections WHERE telegram_user_id = ?")
    .get(String(telegramUserId));
  if (!row) return true;
  return row.connected === 1;
}

export function getTelegramProviderId(userId) {
  const row = getDb()
    .prepare(
      `SELECT provider_account_id FROM auth_providers
       WHERE user_id = ? AND provider = 'telegram' LIMIT 1`
    )
    .get(userId);
  return row?.provider_account_id ? String(row.provider_account_id) : null;
}

export function userHasTelegramProvider(userId) {
  return !!getTelegramProviderId(userId);
}

export function assertTelegramUserConnected(userId) {
  const tgId = getTelegramProviderId(userId);
  if (!tgId) return;
  if (!isTelegramConnected(tgId)) {
    const err = new Error("Telegram disconnected");
    err.code = "TELEGRAM_DISCONNECTED";
    throw err;
  }
}

export function upsertProviderProfile(userId, provider, profile) {
  const now = new Date().toISOString();
  const json = JSON.stringify(profile || {});
  getDb()
    .prepare(
      `INSERT INTO provider_profiles (user_id, provider, profile_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         profile_json = excluded.profile_json,
         updated_at = excluded.updated_at`
    )
    .run(userId, provider, json, now);
}

export function getProviderProfile(userId, provider) {
  const row = getDb()
    .prepare("SELECT profile_json FROM provider_profiles WHERE user_id = ? AND provider = ?")
    .get(userId, provider);
  if (!row?.profile_json) return null;
  try {
    return JSON.parse(row.profile_json);
  } catch {
    return null;
  }
}

export function getAdminStats() {
  const db = getDb();
  const totalUsers = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  const byProvider = db
    .prepare(
      `SELECT provider, COUNT(*) AS c FROM auth_providers GROUP BY provider ORDER BY c DESC`
    )
    .all()
    .reduce((acc, row) => {
      acc[row.provider] = row.c;
      return acc;
    }, {});
  const registrationsByDay = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS c
       FROM users
       GROUP BY date(created_at)
       ORDER BY day DESC
       LIMIT 30`
    )
    .all()
    .map((row) => ({ day: row.day, count: row.c }));
  const telegramConnected = db
    .prepare("SELECT COUNT(*) AS c FROM telegram_connections WHERE connected = 1")
    .get().c;
  const withRecoveryEmail = db
    .prepare("SELECT COUNT(*) AS c FROM recovery_emails WHERE verified = 1")
    .get().c;

  return {
    totalUsers,
    byProvider,
    registrationsByDay,
    telegramConnected,
    withRecoveryEmail,
  };
}

export function listAdminUsers({ limit = 100, offset = 0, provider } = {}) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  let where = "";
  const params = [];
  if (provider) {
    where = `WHERE EXISTS (
      SELECT 1 FROM auth_providers ap
      WHERE ap.user_id = u.id AND ap.provider = ?
    )`;
    params.push(provider);
  }

  const users = db
    .prepare(
      `SELECT u.* FROM users u
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, safeLimit, safeOffset);

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM users u ${where}`)
    .get(...params).c;

  const rows = users.map((userRow) => {
    const providers = getUserProviders(userRow.id);
    const recovery = getRecoveryEmail(userRow.id);
    const placeholder = isPlaceholderEmail(userRow.primary_email);
    const tgId = getTelegramProviderId(userRow.id);
    const tgConnected = tgId ? isTelegramConnected(tgId) : null;

    const providerDetails = providers.map((p) => ({
      provider: p.provider,
      providerAccountId: p.provider_account_id,
      linkedAt: p.linked_at,
      profile: getProviderProfile(userRow.id, p.provider),
    }));

    const primaryProvider =
      providers.find((p) => p.provider !== "email")?.provider || providers[0]?.provider || "email";

    return {
      id: userRow.id,
      name: userRow.display_name,
      email: placeholder ? null : userRow.primary_email,
      recoveryEmail: recovery?.verified ? recovery.email : null,
      createdAt: userRow.created_at,
      primaryProvider,
      providers: providerDetails,
      telegramConnected: tgConnected,
    };
  });

  return { total, limit: safeLimit, offset: safeOffset, users: rows };
}

export function touchUserLogin(userId) {
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, userId);
}

function providerMap(providers) {
  const map = {};
  for (const p of providers) {
    map[p.provider] = p;
  }
  return map;
}

export function exportUserCrmRecord(userId) {
  const userRow = findUserById(userId);
  if (!userRow) return null;

  const providers = getUserProviders(userId);
  const byProvider = providerMap(providers);
  const recovery = getRecoveryEmail(userId);
  const placeholder = isPlaceholderEmail(userRow.primary_email);
  const tgId = getTelegramProviderId(userId);
  const tgConnected = tgId ? isTelegramConnected(tgId) : null;

  const tgProf = getProviderProfile(userId, "telegram") || {};
  const googleProf = getProviderProfile(userId, "google") || {};
  const xProf = getProviderProfile(userId, "x") || {};

  const primaryProvider =
    providers.find((p) => p.provider !== "email")?.provider || providers[0]?.provider || "email";

  const hasPasswordLogin =
    providers.some((p) => p.provider === "email") ||
    !!(recovery?.verified) ||
    !placeholder;

  const now = new Date().toISOString();

  return {
    userId: userRow.id,
    displayName: userRow.display_name,
    primaryEmail: userRow.primary_email,
    isPlaceholderEmail: placeholder ? "Так" : "Ні",
    recoveryEmail: recovery?.verified ? recovery.email : "",
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
    lastLoginAt: userRow.last_login_at || "",
    primaryProvider,
    allProviders: providers.map((p) => p.provider).join(", "),
    hasPasswordLogin: hasPasswordLogin ? "Так" : "Ні",
    emailLinkedAt: byProvider.email?.linked_at || "",
    googleId: googleProf.googleId || byProvider.google?.provider_account_id || "",
    googleEmail: googleProf.email || "",
    googleName: googleProf.name || "",
    googlePicture: googleProf.picture || "",
    googleLinkedAt: byProvider.google?.linked_at || "",
    telegramId: tgProf.telegramId || byProvider.telegram?.provider_account_id || "",
    telegramUsername: tgProf.username ? `@${tgProf.username}` : "",
    telegramFirstName: tgProf.firstName || "",
    telegramLastName: tgProf.lastName || "",
    telegramPhotoUrl: tgProf.photoUrl || "",
    telegramBotActive:
      tgId == null ? "" : tgConnected ? "Так" : "Ні (відключив бота)",
    telegramLinkedAt: byProvider.telegram?.linked_at || "",
    telegramPhoneNote: "Telegram Login не передає телефон",
    xId: xProf.xId || byProvider.x?.provider_account_id || "",
    xUsername: xProf.username ? `@${xProf.username}` : "",
    xName: xProf.name || "",
    xProfileImage: xProf.profileImageUrl || "",
    xLinkedAt: byProvider.x?.linked_at || "",
    syncedAt: now,
  };
}

export function listAllUserIds() {
  return getDb().prepare("SELECT id FROM users ORDER BY created_at ASC").all().map((r) => r.id);
}

export function activateUserPlan(userId, planId, days = 30) {
  const user = findUserById(userId);
  if (!user) return null;
  const now = Date.now();
  let base = now;
  if (user.plan === planId && user.plan_expires_at) {
    const exp = Date.parse(user.plan_expires_at);
    if (exp > now) base = exp;
  }
  const expires = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
  const at = new Date().toISOString();
  getDb()
    .prepare("UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = ? WHERE id = ?")
    .run(planId, expires, at, userId);
  return { planId, planExpiresAt: expires };
}

export function createPayment({ id, userId, planId, amountUsd, provider, providerPaymentId, invoiceUrl }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO payments (id, user_id, plan_id, amount_usd, provider, provider_payment_id, invoice_url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(id, userId, planId, amountUsd, provider, providerPaymentId || null, invoiceUrl || null, now);
  return findPaymentById(id);
}

export function findPaymentById(id) {
  return getDb().prepare("SELECT * FROM payments WHERE id = ?").get(id) || null;
}

export function findPaymentByProviderId(providerPaymentId) {
  return (
    getDb().prepare("SELECT * FROM payments WHERE provider_payment_id = ?").get(providerPaymentId) || null
  );
}

export function updatePaymentStatus(id, status, extra = {}) {
  const now = new Date().toISOString();
  const paidAt = status === "paid" ? now : null;
  getDb()
    .prepare(
      `UPDATE payments SET status = ?, paid_at = COALESCE(?, paid_at), meta_json = ?
       WHERE id = ?`
    )
    .run(status, paidAt, extra.metaJson ? JSON.stringify(extra.metaJson) : null, id);
  return findPaymentById(id);
}
