#!/usr/bin/env bash
# Завантажити 5–10 Gemini ключів на Render (без виводу ключів у консоль).
#
# Варіант A — файл (один ключ на рядок):
#   ./scripts/render-set-keys.sh server/keys.txt
#
# Варіант B — аргументи:
#   ./scripts/render-set-keys.sh AIza... AIza... AIza...
#
# Файл server/keys.txt у .gitignore — не комітити.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
ENV_FILE="$SERVER/.env"

collect_keys() {
  local -a KEYS=()
  if [[ $# -eq 1 && -f "$1" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line//$'\r'/}"
      line="${line#"${line%%[![:space:]]*}"}"
      line="${line%"${line##*[![:space:]]}"}"
      [[ -z "$line" || "$line" == \#* ]] && continue
      line="${line#AIzaSy=}"
      line="${line#*=}"
      KEYS+=("$line")
    done < "$1"
  else
    for arg in "$@"; do
      [[ -n "$arg" ]] && KEYS+=("$arg")
    done
  fi

  if [[ ${#KEYS[@]} -lt 1 ]]; then
    echo "Потрібен мінімум 1 ключ. Файл або список аргументів."
    exit 1
  fi

  python3 - "$ENV_FILE" "${KEYS[@]}" <<'PY'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
keys = list(dict.fromkeys(k.strip() for k in sys.argv[2:] if k.strip()))
joined = ",".join(keys)

lines = []
if env_path.exists():
    lines = env_path.read_text().splitlines()

out = []
seen_keys = False
seen_single = False
for line in lines:
    if line.startswith("GEMINI_API_KEYS="):
        out.append(f"GEMINI_API_KEYS={joined}")
        seen_keys = True
    elif line.startswith("GEMINI_API_KEY="):
        out.append(f"GEMINI_API_KEY={keys[0]}")
        seen_single = True
    else:
        out.append(line)

if not seen_keys:
    out.append(f"GEMINI_API_KEYS={joined}")
if not seen_single:
    out.append(f"GEMINI_API_KEY={keys[0]}")

defaults = {
    "GEMINI_MODEL": "gemini-2.5-flash",
    "DAILY_LIMIT_PER_CLIENT": "300",
    "INTERNAL_RETRY_MS": "90000",
    "KEY_COOLDOWN_MS": "30000",
}
present = {l.split("=", 1)[0] for l in out if "=" in l and not l.strip().startswith("#")}
for k, v in defaults.items():
    if k not in present:
        out.append(f"{k}={v}")

env_path.write_text("\n".join(out).rstrip() + "\n")
print(len(keys))
PY
}

if [[ $# -lt 1 ]]; then
  echo "Використання: $0 server/keys.txt"
  echo "         або: $0 KEY1 KEY2 KEY3 ..."
  exit 1
fi

COUNT="$(collect_keys "$@")"
echo "Збережено $COUNT унікальних ключів у server/.env (значення не показуються)."
echo "Деплой на Render..."
"$ROOT/scripts/update-cloud-server.sh"
