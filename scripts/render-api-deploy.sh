#!/usr/bin/env bash
# Оновити env на Render через REST API.
# Автоматично бере ключ з ~/.render/cli.yaml після render login.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/server/.env"
SERVICE_NAME="${SERVICE_NAME:-content-studio-api-1}"
RENDER_CLI_CONFIG="${RENDER_CLI_CONFIG_PATH:-$HOME/.render/cli.yaml}"

if [[ -z "${RENDER_API_KEY:-}" && -f "$RENDER_CLI_CONFIG" ]]; then
  RENDER_API_KEY="$(python3 -c "
import re
from pathlib import Path
text = Path('$RENDER_CLI_CONFIG').read_text()
m = re.search(r'^\\s*key:\\s*(rnd_\\S+)', text, re.M)
print(m.group(1) if m else '')
")"
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "Потрібен RENDER_API_KEY: dashboard.render.com → Account Settings → API Keys"
  exit 1
fi

KEY_COUNT=""
BODY_ITEMS=()
while IFS= read -r row; do
  k="${row%%$'\t'*}"
  v="${row#*$'\t'}"
  if [[ "$k" == KEY_COUNT ]]; then KEY_COUNT="$v"; continue; fi
  BODY_ITEMS+=("$(python3 -c 'import json,sys; print(json.dumps({"key":sys.argv[1],"value":sys.argv[2]}))' "$k" "$v")")
done < <(python3 - "$ENV_FILE" <<'PY'
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
    raise SystemExit("No keys in .env")
model = env.get("GEMINI_MODEL", "gemini-2.5-flash")
if "lite" in model:
    model = "gemini-2.5-flash"
for k, v in [
    ("GEMINI_API_KEYS", ",".join(keys)),
    ("GEMINI_MODEL", model),
    ("DAILY_LIMIT_PER_CLIENT", env.get("DAILY_LIMIT_PER_CLIENT", "300")),
    ("INTERNAL_RETRY_MS", env.get("INTERNAL_RETRY_MS", "90000")),
    ("KEY_COOLDOWN_MS", env.get("KEY_COOLDOWN_MS", "30000")),
]:
    print(f"{k}\t{v}")
print(f"KEY_COUNT\t{len(keys)}")
PY
)

SID="$(curl -sf -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services?limit=100" | python3 -c "
import sys, json
name = '$SERVICE_NAME'
data = json.load(sys.stdin)
for item in data:
    s = item.get('service') or item
    if s.get('name') == name:
        print(s['id'])
        break
")"

if [[ -z "$SID" ]]; then
  echo "Service $SERVICE_NAME not found"
  exit 1
fi

JSON="[$(IFS=,; echo "${BODY_ITEMS[*]}")]"

curl -sf -X PUT \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON" \
  "https://api.render.com/v1/services/$SID/env-vars"

curl -sf -X POST \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$SID/deploys"

echo ""
echo "Deploy triggered for $SERVICE_NAME ($KEY_COUNT keys)"
