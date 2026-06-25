#!/usr/bin/env bash
# Zeabur — $5 кредит/міс, зазвичай БЕЗ картки, не засинає поки є кредит.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git add zbpack.json server/ scripts/zeabur-*.sh 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "$(cat <<'EOF'
Add Zeabur deploy config (zbpack.json → server/).

EOF
)" || true
fi
git push origin main 2>/dev/null || echo "(git push — перевірте з'єднання)"

cat <<'GUIDE'

╔══════════════════════════════════════════════════════════════════╗
║  Zeabur — безкоштовно (~$5 кредит/міс, картка не потрібна)     ║
╚══════════════════════════════════════════════════════════════════╝

Чому не Koyeb: free tier обмежений / просить оплату.
Чому Zeabur: $5 кредит щомісяця, Express працює без «сну» поки є кредит.

─── Крок 1 ───────────────────────────────────────────────────────
  https://zeabur.com → Login with GitHub

─── Крок 2 ───────────────────────────────────────────────────────
  New Project → Deploy GitHub repo
  Repository: Alexzjf/content-studio-api
  Root Directory: server   (або вже з zbpack.json)

─── Kрок 3 — Variables (Configuration) ───────────────────────────
  GEMINI_API_KEYS=ключ1,ключ2
  GEMINI_MODEL=gemini-2.5-flash
  INTERNAL_RETRY_MS=80000
  DAILY_LIMIT_PER_CLIENT=300
  PORT=8787

─── Kрок 4 ───────────────────────────────────────────────────────
  Domains → згенеруйте URL (https://xxx.zeabur.app)
  Перевірка: https://ВАШ-URL.zeabur.app/health

─── Крок 5 ───────────────────────────────────────────────────────
  ./scripts/zeabur-set-url.sh https://ВАШ.zeabur.app

─── Запасний варіант (вже є, $0, без реєстрації) ─────────────────
  Render Free: https://content-studio-api-1.onrender.com
  Мінус: засинає після 15 хв → перший запит повільний.
  Розширення вже на ньому налаштоване.

GUIDE
