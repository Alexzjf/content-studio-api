#!/usr/bin/env bash
# Увага: render env-vars PUT замінює ВСІ змінні — скрипт має відправляти повний список (див. python блок нижче).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
ENV_FILE="$SERVER/.env"
SERVICE_NAME="${SERVICE_NAME:-content-studio-api-1}"
RENDER_CLI="${RENDER_CLI:-$HOME/.local/bin/render}"
DEPLOY_ENV="$(mktemp)"

export PATH="$PATH:$HOME/.local/bin"
trap 'rm -f "$DEPLOY_ENV"' EXIT

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Створіть $ENV_FILE або запустіть: ./scripts/render-set-keys.sh server/keys.txt"
  exit 1
fi

python3 - "$ENV_FILE" >"$DEPLOY_ENV" <<'PY'
import sys
from pathlib import Path

env = {}
for line in Path(sys.argv[1]).read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k.strip()] = v.strip()

pool = env.get("GEMINI_API_KEYS") or env.get("GEMINI_API_KEY") or ""
keys = list(dict.fromkeys(k.strip() for k in pool.replace(";", ",").split(",") if k.strip()))
if not keys:
    raise SystemExit("Не знайдено жодного ключа в .env")

model = env.get("GEMINI_MODEL", "gemini-2.5-flash")
if "lite" in model:
    model = "gemini-2.5-flash"

def emit(k, v):
    print(f"{k}={v}")

emit("KEY_COUNT", str(len(keys)))
emit("GEMINI_API_KEYS", ",".join(keys))
emit("GEMINI_MODEL", model)
emit("DAILY_LIMIT_PER_CLIENT", env.get("DAILY_LIMIT_PER_CLIENT", "300"))
emit("INTERNAL_RETRY_MS", env.get("INTERNAL_RETRY_MS", "90000"))
emit("KEY_COOLDOWN_MS", env.get("KEY_COOLDOWN_MS", "30000"))
if env.get("AUTH_JWT_SECRET"):
    emit("AUTH_JWT_SECRET", env["AUTH_JWT_SECRET"])
if env.get("TELEGRAM_BOT_TOKEN"):
    emit("TELEGRAM_BOT_TOKEN", env["TELEGRAM_BOT_TOKEN"])
if env.get("TELEGRAM_BOT_USERNAME"):
    emit("TELEGRAM_BOT_USERNAME", env["TELEGRAM_BOT_USERNAME"])
if env.get("GOOGLE_CLIENT_ID"):
    emit("GOOGLE_CLIENT_ID", env["GOOGLE_CLIENT_ID"])
if env.get("X_CLIENT_ID"):
    emit("X_CLIENT_ID", env["X_CLIENT_ID"])
PY

# shellcheck disable=SC1090
source "$DEPLOY_ENV"

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
  exit 1
fi

echo "Оновлюю $SERVICE_NAME ($SID) — $KEY_COUNT ключ(ів), модель $GEMINI_MODEL..."
ENV_ARGS=(
  "GEMINI_API_KEYS=$GEMINI_API_KEYS"
  "GEMINI_MODEL=$GEMINI_MODEL"
  "DAILY_LIMIT_PER_CLIENT=$DAILY_LIMIT_PER_CLIENT"
  "INTERNAL_RETRY_MS=$INTERNAL_RETRY_MS"
  "KEY_COOLDOWN_MS=$KEY_COOLDOWN_MS"
)
[[ -n "${AUTH_JWT_SECRET:-}" ]] && ENV_ARGS+=("AUTH_JWT_SECRET=$AUTH_JWT_SECRET")
[[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] && ENV_ARGS+=("TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN")
[[ -n "${TELEGRAM_BOT_USERNAME:-}" ]] && ENV_ARGS+=("TELEGRAM_BOT_USERNAME=$TELEGRAM_BOT_USERNAME")
[[ -n "${GOOGLE_CLIENT_ID:-}" ]] && ENV_ARGS+=("GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID")
[[ -n "${X_CLIENT_ID:-}" ]] && ENV_ARGS+=("X_CLIENT_ID=$X_CLIENT_ID")
"$RENDER_CLI" env-vars set "$SID" "${ENV_ARGS[@]}" --confirm
"$RENDER_CLI" deploys create "$SID" --confirm -o json

HOST="https://${SERVICE_NAME}.onrender.com"
echo ""
echo "Deploy запущено. Чекаємо health $HOST/health ..."
for i in $(seq 1 30); do
  if BODY="$(curl -sf "$HOST/health" 2>/dev/null)" && echo "$BODY" | grep -q '"ok":true'; then
    echo "OK: $BODY"
    echo ""
    echo "Перевірка чату..."
    curl -sf -X POST "$HOST/v1/chat" \
      -H "Content-Type: application/json" \
      -H "X-Client-Id: deploy-test" \
      -d '{"sources":[],"settings":{},"history":[{"role":"user","content":"OK"}]}' | head -c 200
    echo ""
    echo ""
    echo "Готово ($KEY_COUNT ключів на Render). Reload розширення на chrome://extensions"
    exit 0
  fi
  sleep 15
done
echo "Deploy ще йде — перевірте $HOST/health (очікується keys: $KEY_COUNT)"
