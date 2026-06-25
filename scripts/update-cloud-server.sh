#!/usr/bin/env bash
# Оновити хмарний сервер на Render (ключ + модель + redeploy).
# Потрібно один раз: render login  АБО  export RENDER_API_KEY=rnd_...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
SERVICE_NAME="${SERVICE_NAME:-content-studio-api-1}"
RENDER_CLI="${RENDER_CLI:-$HOME/.local/bin/render}"

export PATH="$PATH:$HOME/.local/bin"

if [[ ! -f "$SERVER/.env" ]]; then
  echo "Створіть $SERVER/.env з GEMINI_API_KEY=..."
  exit 1
fi

# shellcheck disable=SC1091
source "$SERVER/.env"
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY порожній у server/.env"
  exit 1
fi

if ! command -v "$RENDER_CLI" &>/dev/null; then
  echo "Встановіть Render CLI: curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh"
  exit 1
fi

if ! "$RENDER_CLI" whoami &>/dev/null; then
  echo "Авторизуйтесь: render login   або   export RENDER_API_KEY=rnd_..."
  exit 1
fi

SID="$("$RENDER_CLI" services list -o json | python3 -c "
import sys, json
name = '$SERVICE_NAME'
for row in json.load(sys.stdin):
    s = row.get('service') or row
    if s.get('name') == name:
        print(s.get('id', ''))
        break
" 2>/dev/null || true)"

if [[ -z "$SID" ]]; then
  echo "Сервіс '$SERVICE_NAME' не знайдено на Render."
  echo "Створіть через: ./scripts/deploy-to-render.sh"
  exit 1
fi

MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"
LIMIT="${DAILY_LIMIT_PER_CLIENT:-300}"
RETRY_MS="${INTERNAL_RETRY_MS:-80000}"

KEYS_VAR="GEMINI_API_KEY=$GEMINI_API_KEY"
if [[ -n "${GEMINI_API_KEYS:-}" ]]; then
  KEYS_VAR="GEMINI_API_KEYS=$GEMINI_API_KEYS"
fi

echo "Оновлюю $SERVICE_NAME ($SID)..."
"$RENDER_CLI" env-vars set "$SID" $KEYS_VAR GEMINI_MODEL="$MODEL" DAILY_LIMIT_PER_CLIENT="$LIMIT" INTERNAL_RETRY_MS="$RETRY_MS" --confirm
"$RENDER_CLI" deploys create "$SID" --confirm -o json

HOST="https://${SERVICE_NAME}.onrender.com"
echo ""
echo "Deploy запущено. Чекаємо health $HOST/health ..."
for i in $(seq 1 30); do
  if curl -sf "$HOST/health" | grep -q '"ok":true'; then
    BODY="$(curl -sf "$HOST/health")"
    echo "OK: $BODY"
  echo ""
  echo "Перевірка чату..."
  curl -sf -X POST "$HOST/v1/chat" \
    -H "Content-Type: application/json" \
    -H "X-Client-Id: deploy-test" \
    -d '{"sources":[],"settings":{},"history":[{"role":"user","content":"OK"}]}' | head -c 200
  echo ""
  echo ""
  echo "Готово. Reload розширення на chrome://extensions"
    exit 0
  fi
  sleep 15
done
echo "Deploy ще йде — перевірте $HOST/health через 2–3 хв"
