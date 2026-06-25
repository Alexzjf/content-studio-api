#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
SERVICE_NAME="${SERVICE_NAME:-olexander-cs-api}"
RENDER_CLI="${RENDER_CLI:-$HOME/.local/bin/render}"

export PATH="$PATH:$HOME/.local/bin"

if [[ ! -x "$RENDER_CLI" ]]; then
  echo "Installing Render CLI..."
  curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh
fi

if ! "$RENDER_CLI" whoami &>/dev/null; then
  if [[ -z "${RENDER_API_KEY:-}" ]]; then
    echo ""
    echo "Render: потрібна авторизація (один раз)."
    echo "  Варіант A: export RENDER_API_KEY=rnd_...  (render.com → Account → API Keys)"
    echo "  Варіант B: $RENDER_CLI login"
    exit 1
  fi
  export RENDER_API_KEY
fi

if [[ ! -f "$SERVER/.env" ]]; then
  echo "Missing $SERVER/.env with GEMINI_API_KEY"
  exit 1
fi

# shellcheck disable=SC1091
source "$SERVER/.env"
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY is empty in server/.env"
  exit 1
fi

REPO_URL="${REPO_URL:-}"
if [[ -z "$REPO_URL" ]]; then
  echo ""
  echo "Потрібен публічний GitHub репозиторій для Render."
  echo "  1. github.com → New repository → public → без README"
  echo "  2. export REPO_URL=https://github.com/YOUR_USER/content-studio-api"
  echo "  3. Запустіть цей скрипт знову"
  exit 1
fi

if [[ ! -d "$ROOT/.git" ]]; then
  git -C "$ROOT" init
  git -C "$ROOT" branch -M main
fi

cat > "$ROOT/.gitignore" <<'EOF'
node_modules/
server/node_modules/
server/.env
.DS_Store
*.log
EOF

git -C "$ROOT" add .gitignore render.yaml server/package.json server/package-lock.json server/index.js server/gemini.js server/prompts.js server/Dockerfile server/.dockerignore scripts/deploy-to-render.sh extension-config.js manifest.json
git -C "$ROOT" commit -m "Deploy Content Studio API to Render" || true

echo "Push to GitHub (може запитати логін GitHub):"
git -C "$ROOT" remote remove origin 2>/dev/null || true
git -C "$ROOT" remote add origin "$REPO_URL.git"
git -C "$ROOT" push -u origin main --force

echo "Creating Render service $SERVICE_NAME..."
OUT="$("$RENDER_CLI" services create \
  --name "$SERVICE_NAME" \
  --type web_service \
  --repo "$REPO_URL" \
  --branch main \
  --runtime node \
  --root-directory server \
  --build-command "npm install" \
  --start-command "npm start" \
  --health-check-path /health \
  --plan free \
  --env-var "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --env-var "GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.5-flash}" \
  --env-var "DAILY_LIMIT_PER_CLIENT=${DAILY_LIMIT_PER_CLIENT:-300}" \
  --env-var "NODE_ENV=production" \
  --confirm \
  -o json 2>&1)" || {
  if echo "$OUT" | grep -qi "already exists\|unique"; then
    echo "Service may already exist — triggering deploy..."
    SID="$("$RENDER_CLI" services list -o json | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((s['service']['id'] for s in d if s.get('service',{}).get('name')=='$SERVICE_NAME'),''))" 2>/dev/null || true)"
    if [[ -n "$SID" ]]; then
      "$RENDER_CLI" deploys create "$SID" --confirm -o json
    fi
  else
    echo "$OUT"
    exit 1
  fi
}

HOST="https://${SERVICE_NAME}.onrender.com"
echo ""
echo "Waiting for health at $HOST/health ..."
for i in $(seq 1 40); do
  if curl -sf "$HOST/health" | grep -q '"ok":true'; then
    echo "OK: $HOST"
    python3 <<PY
from pathlib import Path
import re
root = Path("$ROOT")
cfg = root / "extension-config.js"
man = root / "manifest.json"
url = "$HOST"
text = cfg.read_text()
text = re.sub(r'hostedApiUrl:\s*"[^"]+"', f'hostedApiUrl: "{url}"', text)
cfg.write_text(text)
m = man.read_text()
if url not in m:
    m = m.replace('"host_permissions": [', f'"host_permissions": [\n    "{url}/*",')
man.write_text(m)
print("Updated extension-config.js and manifest.json")
PY
    echo "Reload extension on chrome://extensions"
    exit 0
  fi
  sleep 15
done
echo "Deploy started — check $HOST in a few minutes"
