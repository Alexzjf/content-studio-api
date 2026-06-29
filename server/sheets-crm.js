import { GoogleAuth } from "google-auth-library";
import {
  exportUserCrmRecord,
  getAdminStats,
  listAllUserIds,
} from "./db.js";

const USERS_SHEET = "Користувачі";
const STATS_SHEET = "Статистика";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export const CRM_HEADERS = [
  "ID користувача",
  "Ім'я",
  "Email (основний)",
  "Placeholder email",
  "Recovery email",
  "Дата реєстрації",
  "Оновлено",
  "Останній вхід",
  "Основний спосіб входу",
  "Усі способи входу",
  "Є пароль",
  "Email — прив'язано",
  "Google ID",
  "Google email",
  "Google ім'я",
  "Google фото",
  "Google — прив'язано",
  "Telegram ID",
  "Telegram @username",
  "Telegram ім'я",
  "Telegram прізвище",
  "Telegram фото",
  "Telegram бот активний",
  "Telegram — прив'язано",
  "Примітка (телефон TG)",
  "X ID",
  "X @username",
  "X ім'я",
  "X фото",
  "X — прив'язано",
  "Синхронізовано",
];

function sheetsId() {
  return String(process.env.GOOGLE_SHEETS_ID || "").trim();
}

function parseCredentials() {
  const raw = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
}

export function isSheetsConfigured() {
  return !!(sheetsId() && parseCredentials());
}

let authClient;

async function getAuthClient() {
  if (authClient) return authClient;
  const credentials = parseCredentials();
  if (!credentials) throw new Error("GOOGLE_SHEETS_CREDENTIALS_JSON missing or invalid");
  const auth = new GoogleAuth({ credentials, scopes: SCOPES });
  authClient = await auth.getClient();
  return authClient;
}

async function sheetsRequest(path, options = {}) {
  const client = await getAuthClient();
  const token = await client.getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.token || token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    throw new Error(`Google Sheets API: ${msg}`);
  }
  return body;
}

function crmRecordToRow(record) {
  return [
    record.userId,
    record.displayName,
    record.primaryEmail,
    record.isPlaceholderEmail,
    record.recoveryEmail,
    record.createdAt,
    record.updatedAt,
    record.lastLoginAt,
    record.primaryProvider,
    record.allProviders,
    record.hasPasswordLogin,
    record.emailLinkedAt,
    record.googleId,
    record.googleEmail,
    record.googleName,
    record.googlePicture,
    record.googleLinkedAt,
    record.telegramId,
    record.telegramUsername,
    record.telegramFirstName,
    record.telegramLastName,
    record.telegramPhotoUrl,
    record.telegramBotActive,
    record.telegramLinkedAt,
    record.telegramPhoneNote,
    record.xId,
    record.xUsername,
    record.xName,
    record.xProfileImage,
    record.xLinkedAt,
    record.syncedAt,
  ];
}

function colLetter(n) {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function sheetRange(sheetName, cells) {
  const safe = String(sheetName).replace(/'/g, "''");
  return `'${safe}'!${cells}`;
}

async function getSheetTitles() {
  const meta = await sheetsRequest("");
  return (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean);
}

async function ensureSheetsExist() {
  const titles = await getSheetTitles();
  const requests = [];
  if (!titles.includes(USERS_SHEET)) {
    requests.push({ addSheet: { properties: { title: USERS_SHEET } } });
  }
  if (!titles.includes(STATS_SHEET)) {
    requests.push({ addSheet: { properties: { title: STATS_SHEET } } });
  }
  if (requests.length) {
    await sheetsRequest(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }
}

async function readUserIdRowMap() {
  const range = sheetRange(USERS_SHEET, "A2:A50000");
  let values = [];
  try {
    const data = await sheetsRequest(`/values/${encodeURIComponent(range)}`);
    values = data.values || [];
  } catch {
    return new Map();
  }
  const map = new Map();
  values.forEach((row, i) => {
    const id = row?.[0];
    if (id) map.set(String(id), i + 2);
  });
  return map;
}

async function writeHeadersIfNeeded() {
  const range = sheetRange(USERS_SHEET, "A1:1");
  const data = await sheetsRequest(`/values/${encodeURIComponent(range)}`);
  const first = data.values?.[0]?.[0];
  if (first === CRM_HEADERS[0]) return;
  const endCol = colLetter(CRM_HEADERS.length);
  await sheetsRequest(`/values/${encodeURIComponent(sheetRange(USERS_SHEET, `A1:${endCol}1`))}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [CRM_HEADERS] }),
  });
}

async function updateStatsSheet() {
  const stats = getAdminStats();
  const rows = [
    ["Показник", "Значення"],
    ["Всього користувачів", stats.totalUsers],
    ["Telegram", stats.byProvider.telegram || 0],
    ["Google", stats.byProvider.google || 0],
    ["X (Twitter)", stats.byProvider.x || 0],
    ["Email", stats.byProvider.email || 0],
    ["Telegram бот активний", stats.telegramConnected],
    ["Мають recovery email", stats.withRecoveryEmail],
    ["", ""],
    ["Реєстрації за день", "Кількість"],
    ...stats.registrationsByDay.map((d) => [d.day, d.count]),
    ["", ""],
    ["Оновлено", new Date().toISOString()],
  ];
  await sheetsRequest(`/values/${encodeURIComponent(sheetRange(STATS_SHEET, "A1"))}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  });
}

export async function syncUserToSheets(userId) {
  if (!isSheetsConfigured()) return { skipped: true };
  const record = exportUserCrmRecord(userId);
  if (!record) return { skipped: true };

  await ensureSheetsExist();
  await writeHeadersIfNeeded();

  const row = crmRecordToRow(record);
  const endCol = colLetter(row.length);
  const map = await readUserIdRowMap();
  const existingRow = map.get(String(userId));

  if (existingRow) {
    const range = sheetRange(USERS_SHEET, `A${existingRow}:${endCol}${existingRow}`);
    await sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [row] }),
    });
    return { updated: true, row: existingRow };
  }

  await sheetsRequest(
    `/values/${encodeURIComponent(sheetRange(USERS_SHEET, `A:${endCol}`))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    }
  );
  return { appended: true };
}

export async function syncAllUsersToSheets() {
  if (!isSheetsConfigured()) {
    throw new Error("Google Sheets not configured");
  }
  await ensureSheetsExist();
  await writeHeadersIfNeeded();

  const ids = listAllUserIds();
  let updated = 0;
  let appended = 0;

  for (const id of ids) {
    const result = await syncUserToSheets(id);
    if (result.updated) updated += 1;
    if (result.appended) appended += 1;
  }

  await updateStatsSheet();

  return { total: ids.length, updated, appended };
}

export function queueSheetsSync(userId) {
  if (!isSheetsConfigured() || !userId) return;
  void syncUserToSheets(userId)
    .then(() => updateStatsSheet().catch(() => {}))
    .catch((err) => console.warn("[sheets-crm]", err.message));
}
