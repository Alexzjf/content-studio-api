#!/bin/bash
# Відкриває локальний API в інтернет. Сервер має вже працювати на порту 8787.
#
# Після запуску скопіюйте https URL у:
#   extension-config.js → hostedApiUrl
#   manifest.json → host_permissions

set -e
PORT="${PORT:-8787}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Тунель до http://localhost:${PORT}"
echo "Переконайтесь, що сервер працює (curl http://localhost:${PORT}/health)"
echo ""

if command -v cloudflared >/dev/null 2>&1; then
  echo "→ cloudflared"
  cloudflared tunnel --url "http://localhost:${PORT}"
  exit 0
fi

if [ -x "$DIR/cloudflared" ]; then
  echo "→ ./cloudflared (локальна копія)"
  "$DIR/cloudflared" tunnel --url "http://localhost:${PORT}"
  exit 0
fi

if command -v npx >/dev/null 2>&1; then
  echo "→ localtunnel (через npx, brew не потрібен)"
  echo "Скопіюйте рядок your url is: https://...."
  echo ""
  npx --yes localtunnel --port "$PORT"
  exit 0
fi

echo "Не знайдено cloudflared і npx."
echo ""
echo "Варіант 1 — у цьому терміналі (потрібен Node.js):"
echo "  npx localtunnel --port ${PORT}"
echo ""
echo "Варіант 2 — завантажити cloudflared без brew:"
echo "  cd $DIR"
echo "  curl -L -o cloudflared.tgz https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
echo "  tar -xzf cloudflared.tgz && chmod +x cloudflared"
echo "  ./cloudflared tunnel --url http://localhost:${PORT}"
exit 1
