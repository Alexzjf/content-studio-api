#!/usr/bin/env bash
# Usage: ./scripts/zeabur-set-url.sh https://your-app.zeabur.app
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: $0 https://your-app.zeabur.app"
  exit 1
fi

URL="${URL%/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 <<PY
import re, pathlib
root = pathlib.Path("$ROOT")
url = "$URL"

cfg = root / "extension-config.js"
text = cfg.read_text()
text = re.sub(r'hostedApiUrl:\s*"[^"]+"', f'hostedApiUrl: "{url}"', text)
cfg.write_text(text)
print(f"OK extension-config.js → {url}")

manifest = root / "manifest.json"
mt = manifest.read_text()
if "zeabur.app" not in mt and "*.zeabur.app" not in mt:
    mt = mt.replace(
        '"https://*.koyeb.app/*",',
        '"https://*.koyeb.app/*",\n    "https://*.zeabur.app/*",',
    )
perm = f'    "{url}/*"'
if url not in mt:
    mt = mt.replace(
        '"https://*.zeabur.app/*",',
        f'"https://*.zeabur.app/*",\n{perm},',
    )
manifest.write_text(mt)
print("OK manifest.json")
PY

echo ""
if curl -sf "${URL}/health" | head -c 400; then
  echo ""
  echo ""
  echo "OK. Reload: chrome://extensions → ↻"
else
  echo "Health ще не готовий — зачекайте 2–5 хв."
fi
