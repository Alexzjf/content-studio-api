#!/usr/bin/env bash
# Koyeb — безкоштовний хостинг для server/ (зазвичай БЕЗ картки).
# Запуск: ./scripts/koyeb-first-time.sh
set -euo pipefail

cat <<'GUIDE'

╔══════════════════════════════════════════════════════════════════╗
║  Koyeb Free — деплой API бота (~10 хв, картка не потрібна)       ║
╚══════════════════════════════════════════════════════════════════╝

Переваги перед Oracle:
  ✓ Реєстрація через GitHub — часто без картки
  ✓ Деплой у 3 кліки з репозиторію
  ✓ HTTPS одразу (ваш-url.koyeb.app)

Мінус (free):
  · Після 1 год без трафіку сервіс «засинає» → перший запит ~5–15 с
  · Розширення вже прокидає сервер і показує «Асистент думає»

─── Крок 1: Акаунт ───────────────────────────────────────────────
  1. https://www.koyeb.com → Sign up with GitHub
  2. Картку НЕ просить у більшості випадків

─── Крок 2: Create Web Service ───────────────────────────────────
  Dashboard → Create Web Service → GitHub

  Repository: Alexzjf/content-studio-api  (або ваш fork)
  Branch:     main

  Builder:     Buildpack
  Run command: npm start
  Work directory (Root / Build):  server

  Instance:    Free (Nano) — Frankfurt

  Port:        8787   (або залиште Auto — Koyeb підставить PORT)

  Health check path: /health
  Health check port: 8787

─── Крок 3: Environment variables ─────────────────────────────────
  У сервісі → Settings → Environment variables:

  GEMINI_API_KEYS     = key1,key2,key3
  GEMINI_MODEL        = gemini-2.5-flash
  DAILY_LIMIT_PER_CLIENT = 300
  INTERNAL_RETRY_MS   = 80000
  NODE_ENV            = production

  (GEMINI_API_KEYS — кілька ключів через кому, без пробілів)

─── Крок 4: Deploy ─────────────────────────────────────────────────
  Натисніть Deploy. Чекайте 2–5 хв.

  URL буде типу: https://content-studio-api-ВАШ-ЛОГІН.koyeb.app
  Перевірка: https://ВАШ-URL.koyeb.app/health

─── Крок 5: Розширення ───────────────────────────────────────────
  Надішліть мені URL .koyeb.app — оновлю extension-config.js

  Або самі в extension-config.js:
    hostedApiUrl: "https://ВАШ-СЕРВІС.koyeb.app"

  chrome://extensions → Reload

─── Оновлення коду після змін у server/ ──────────────────────────
  git push origin main  →  Koyeb задеплоїть автоматично

─── Якщо Koyeb все ж просить картку ──────────────────────────────
  Спробуйте Northflank: https://northflank.com (free, 2 сервіси)
  Або Zeabur: https://zeabur.com ($5 кредит/міс, часто без картки)

GUIDE

echo "Репозиторій API: https://github.com/Alexzjf/content-studio-api"
echo ""
if command -v git &>/dev/null; then
  echo "Останній коміт на GitHub (локально):"
  git -C "$(cd "$(dirname "$0")/.." && pwd)" log -1 --oneline 2>/dev/null || echo "(немає git)"
fi
