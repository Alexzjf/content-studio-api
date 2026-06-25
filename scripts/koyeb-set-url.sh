#!/usr/bin/env bash
# Оновити URL Koyeb у розширенні після деплою.
# Usage: ./scripts/koyeb-set-url.sh https://content-studio-api-xxx.koyeb.app
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: $0 https://your-app.koyeb.app"
  exit 1
fi

URL="${URL%/}"
if [[ ! "$URL" =~ ^https://[a-zA-Z0-9.-]+\.koyeb\.app$ ]]; then
  echo "Очікується URL типу https://name.koyeb.app"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 <<PY
import re, pathlib
root = pathlib.Path("$ROOT")
url = "$URL"

cfg = root / "extension-config.js"
text = cfg.read_text()
text = re.sub(
    r'hostedApiUrl:\s*"[^"]+"',
    f'hostedApiUrl: "{url}"',
    text,
)
cfg.write_text(text)
print(f"OK extension-config.js → {url}")

manifest = root / "manifest.json"
mt = manifest.read_text()
perm = f'    "{url}/*"'
if url not in mt:
    mt = mt.replace(
        '"https://*.koyeb.app/*",',
        f'"https://*.koyeb.app/*",\n{perm},',
    )
    manifest.write_text(mt)
    print(f"OK manifest.json → {url}/*")
else:
    print("manifest already has URL")
PY

echo ""
echo "Перевірка health..."
if curl -sf "${URL}/health" | head -c 400; then
  echo ""
  echo ""
  echo "Сервер OK. Reload розширення: chrome://extensions → ↻"
else
  echo ""
  echo "Health ще не відповідає — зачекайте 2–5 хв після Deploy на Koyeb."
fi
