import { getAdminStats, listAdminUsers } from "./db.js";
import { isSheetsConfigured, syncAllUsersToSheets } from "./sheets-crm.js";

function adminSecret() {
  return process.env.ADMIN_SECRET || "";
}

function requireAdmin(req, res, next) {
  const secret = adminSecret();
  if (!secret) {
    return res.status(503).json({ error: "Admin not configured (set ADMIN_SECRET)" });
  }
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function providerLabel(p) {
  const map = { email: "Email", google: "Google", telegram: "Telegram", x: "X" };
  return map[p] || p;
}

function formatProviderDetails(row) {
  const parts = [];
  for (const p of row.providers || []) {
    const prof = p.profile || {};
    if (p.provider === "telegram") {
      const bits = [];
      if (prof.username) bits.push(`@${prof.username}`);
      if (prof.firstName || prof.lastName) {
        bits.push([prof.firstName, prof.lastName].filter(Boolean).join(" "));
      }
      if (prof.telegramId) bits.push(`ID ${prof.telegramId}`);
      if (row.telegramConnected === false) bits.push("відключив бота");
      parts.push(bits.join(" · ") || "Telegram");
    } else if (p.provider === "x") {
      const bits = [];
      if (prof.username) bits.push(`@${prof.username}`);
      if (prof.name) bits.push(prof.name);
      if (prof.xId) bits.push(`ID ${prof.xId}`);
      parts.push(bits.join(" · ") || "X");
    } else if (p.provider === "google") {
      parts.push(prof.email || prof.name || "Google");
    } else if (p.provider === "email") {
      parts.push(row.email || row.recoveryEmail || "Email");
    }
  }
  return parts.join(" | ");
}

function adminPageHtml() {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>cheatXtwitter — користувачі</title>
<style>
  :root { color-scheme: dark; --bg:#0c0c0e; --card:#151518; --border:#2a2a30; --text:#e8e8ec; --muted:#9a9aa8; --accent:#7c6cff; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.45 system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); }
  .wrap { max-width:1200px; margin:0 auto; padding:24px 16px 48px; }
  h1 { font-size:1.35rem; margin:0 0 4px; }
  .sub { color:var(--muted); margin-bottom:20px; }
  .login { max-width:360px; background:var(--card); border:1px solid var(--border); border-radius:12px; padding:20px; }
  .login input { width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:#0f0f12; color:var(--text); margin:8px 0 12px; }
  .login button, .toolbar button { padding:9px 14px; border-radius:8px; border:0; background:var(--accent); color:#fff; cursor:pointer; font-weight:600; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:20px; }
  .stat { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:14px; }
  .stat b { display:block; font-size:1.5rem; }
  .stat span { color:var(--muted); font-size:.85rem; }
  .toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:14px; }
  .toolbar select { padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:#0f0f12; color:var(--text); }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { color:var(--muted); font-size:.8rem; text-transform:uppercase; letter-spacing:.04em; background:#111114; }
  tr:last-child td { border-bottom:0; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:.75rem; background:#252530; margin-right:4px; }
  .badge.telegram { background:#1a3a4a; }
  .badge.google { background:#2a2418; }
  .badge.x { background:#1a1a22; }
  .badge.email { background:#1a2a1a; }
  .muted { color:var(--muted); font-size:.85rem; }
  .err { color:#ff7b7b; margin-top:8px; }
  .hidden { display:none !important; }
  .note { background:#1a1828; border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:16px; color:var(--muted); font-size:.9rem; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Користувачі cheatXtwitter</h1>
  <p class="sub">Реєстрації, способи входу та профілі OAuth</p>

  <div id="loginBox" class="login">
    <label for="secret">Пароль адміна (ADMIN_SECRET)</label>
    <input id="secret" type="password" autocomplete="current-password" placeholder="Секретний ключ" />
    <button type="button" id="loginBtn">Увійти</button>
    <p id="loginErr" class="err hidden"></p>
  </div>

  <div id="dash" class="hidden">
    <div class="note">Telegram Login не передає номер телефону — лише username, ім’я та Telegram ID. Телефон з’явиться тільки якщо користувач окремо надішле контакт боту (поки не збираємо).</div>
    <div id="stats" class="stats"></div>
    <div class="toolbar">
      <select id="filterProvider">
        <option value="">Усі способи входу</option>
        <option value="telegram">Telegram</option>
        <option value="google">Google</option>
        <option value="x">X</option>
        <option value="email">Email</option>
      </select>
      <button type="button" id="refreshBtn">Оновити</button>
      <button type="button" id="sheetsSyncBtn" class="hidden">Синхронізувати Google Sheets</button>
      <span id="sheetsStatus" class="muted"></span>
      <span id="totalLabel" class="muted"></span>
    </div>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Ім’я</th>
            <th>Вхід</th>
            <th>Деталі (username, email…)</th>
            <th>Recovery email</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>
</div>
<script>
const KEY = "cheatx_admin_secret";
const $ = (id) => document.getElementById(id);

function token() { return sessionStorage.getItem(KEY) || ""; }
function setToken(v) { sessionStorage.setItem(KEY, v); }

async function api(path) {
  const res = await fetch(path, { headers: { Authorization: "Bearer " + token() } });
  if (res.status === 401) throw new Error("Невірний пароль");
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function badgeClass(p) {
  return "badge " + (p || "email");
}

function renderStats(s) {
  const cards = [
    ["Всього", s.totalUsers],
    ["Telegram", s.byProvider.telegram || 0],
    ["Google", s.byProvider.google || 0],
    ["X", s.byProvider.x || 0],
    ["Email", s.byProvider.email || 0],
    ["TG активні", s.telegramConnected],
    ["Recovery email", s.withRecoveryEmail],
  ];
  $("stats").innerHTML = cards.map(([label, val]) =>
    '<div class="stat"><b>' + val + '</b><span>' + label + '</span></div>'
  ).join("");
}

function renderRows(data) {
  $("totalLabel").textContent = "Показано " + data.users.length + " з " + data.total;
  $("rows").innerHTML = data.users.map((u) => {
    const date = u.createdAt ? new Date(u.createdAt).toLocaleString("uk-UA") : "—";
    const badges = (u.providers || []).map((p) =>
      '<span class="' + badgeClass(p.provider) + '">' + p.provider + '</span>'
    ).join("");
    const details = formatDetails(u);
    const recovery = u.recoveryEmail || '<span class="muted">—</span>';
    return '<tr><td class="muted">' + date + '</td><td>' + esc(u.name) + '</td><td>' + badges + '</td><td>' + details + '</td><td>' + esc(u.recoveryEmail || "") + '</td></tr>';
  }).join("") || '<tr><td colspan="5" class="muted">Немає користувачів</td></tr>';
}

function esc(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function formatDetails(u) {
  const parts = [];
  for (const p of u.providers || []) {
    const prof = p.profile || {};
    if (p.provider === "telegram") {
      const bits = [];
      if (prof.username) bits.push("@" + esc(prof.username));
      if (prof.firstName || prof.lastName) bits.push(esc([prof.firstName, prof.lastName].filter(Boolean).join(" ")));
      if (prof.telegramId) bits.push("ID " + esc(prof.telegramId));
      if (u.telegramConnected === false) bits.push('<span class="muted">бот відключений</span>');
      parts.push(bits.join(" · ") || '<span class="muted">Telegram (без профілю — увійдіть знову)</span>');
    } else if (p.provider === "x") {
      const bits = [];
      if (prof.username) bits.push("@" + esc(prof.username));
      if (prof.name) bits.push(esc(prof.name));
      if (prof.xId) bits.push("ID " + esc(prof.xId));
      parts.push(bits.join(" · ") || "X");
    } else if (p.provider === "google") {
      parts.push(esc(prof.email || prof.name || "Google"));
    } else if (p.provider === "email") {
      parts.push(esc(u.email || "Email"));
    }
  }
  return parts.join("<br>") || '<span class="muted">—</span>';
}

async function load() {
  const provider = $("filterProvider").value;
  const q = provider ? "?provider=" + encodeURIComponent(provider) + "&limit=200" : "?limit=200";
  const [stats, users] = await Promise.all([
    api("/admin/api/stats"),
    api("/admin/api/users" + q),
  ]);
  renderStats(stats);
  renderRows(users);
}

async function showDash() {
  $("loginBox").classList.add("hidden");
  $("dash").classList.remove("hidden");
  await load();
  await checkSheets();
}

$("loginBtn").onclick = async () => {
  const v = $("secret").value.trim();
  if (!v) return;
  setToken(v);
  $("loginErr").classList.add("hidden");
  try {
    await showDash();
  } catch (e) {
    setToken("");
    $("loginErr").textContent = e.message;
    $("loginErr").classList.remove("hidden");
  }
};

$("refreshBtn").onclick = () => load().catch((e) => alert(e.message));
$("filterProvider").onchange = () => load().catch((e) => alert(e.message));

$("sheetsSyncBtn").onclick = async () => {
  $("sheetsStatus").textContent = "Синхронізація…";
  try {
    const res = await fetch("/admin/api/sheets-sync", {
      method: "POST",
      headers: { Authorization: "Bearer " + token() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    $("sheetsStatus").textContent = "Sheets: " + data.total + " користувачів (" + data.appended + " нових, " + data.updated + " оновлено)";
  } catch (e) {
    $("sheetsStatus").textContent = "";
    alert(e.message);
  }
};

async function checkSheets() {
  try {
    const cfg = await api("/admin/api/sheets-status");
    if (cfg.configured) {
      $("sheetsSyncBtn").classList.remove("hidden");
      $("sheetsStatus").textContent = "Google Sheets підключено";
    }
  } catch { /* ignore */ }
}

if (token()) {
  showDash().catch(() => {
    setToken("");
    $("loginBox").classList.remove("hidden");
    $("dash").classList.add("hidden");
  });
}
</script>
</body>
</html>`;
}

export function mountAdminRoutes(app) {
  app.get("/admin", (_req, res) => {
    res.type("html").send(adminPageHtml());
  });

  app.get("/admin/api/stats", requireAdmin, (_req, res) => {
    res.json(getAdminStats());
  });

  app.get("/admin/api/users", requireAdmin, (req, res) => {
    const { provider, limit, offset } = req.query || {};
    res.json(listAdminUsers({ provider, limit, offset }));
  });

  app.get("/admin/api/sheets-status", requireAdmin, (_req, res) => {
    res.json({ configured: isSheetsConfigured() });
  });

  app.post("/admin/api/sheets-sync", requireAdmin, async (_req, res) => {
    try {
      const result = await syncAllUsersToSheets();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message || "Sheets sync failed" });
    }
  });
}
