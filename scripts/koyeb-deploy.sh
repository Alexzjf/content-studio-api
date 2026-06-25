#!/usr/bin/env bash
# Підготовка репозиторію + чекліст Koyeb. Після деплою в UI:
#   ./scripts/koyeb-set-url.sh https://ВАШ-СЕРВІС.koyeb.app
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Push server/ на GitHub..."
git add server/ scripts/koyeb-first-time.sh scripts/koyeb-set-url.sh scripts/koyeb-deploy.sh 2>/dev/null || true
git add server/package.json server/index.js server/gemini.js server/.env.example 2>/dev/null || true

if git diff --cached --quiet; then
  echo "Немає нових змін для commit."
else
  git commit -m "$(cat <<'EOF'
Prepare server for Koyeb deployment.

EOF
)" || true
fi

git push origin main

echo ""
echo "=============================================="
echo "  GitHub оновлено. Тепер Koyeb (в браузері):"
echo "=============================================="
echo ""
echo "  1. https://app.koyeb.com → Sign up with GitHub"
echo "  2. Create Web Service → GitHub"
echo "     Repo:   Alexzjf/content-studio-api"
echo "     Branch: main"
echo "     Work directory: server"
echo "     Builder: Buildpack"
echo "     Run: npm start"
echo "     Instance: Free (Frankfurt)"
echo "     Port: 8787"
echo "     Health check: /health"
echo ""
echo "  3. Environment variables (Settings):"
echo "     GEMINI_API_KEYS=ваш_ключ1,ваш_ключ2"
echo "     GEMINI_MODEL=gemini-2.5-flash"
echo "     INTERNAL_RETRY_MS=80000"
echo "     DAILY_LIMIT_PER_CLIENT=300"
echo ""
echo "  4. Після Deploy скопіюйте URL і виконайте:"
echo "     ./scripts/koyeb-set-url.sh https://ВАШ.koyeb.app"
echo ""
