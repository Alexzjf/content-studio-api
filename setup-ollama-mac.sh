#!/bin/bash
# Дозволяє Chrome-розширенню підключатись до Ollama (виправляє HTTP 403)
# macOS: Ollama.app НЕ успадковує launchctl setenv — потрібен окремий ollama serve з env.

set -euo pipefail

OLLAMA_BIN="/Applications/Ollama.app/Contents/Resources/ollama"
ORIGINS='chrome-extension://*,moz-extension://*,safari-web-extension://*'
SETENV_PLIST="$HOME/Library/LaunchAgents/com.ollama.origins.plist"
SERVE_PLIST="$HOME/Library/LaunchAgents/com.ollama.serve.chrome.plist"
GUI_DOMAIN="gui/$(id -u)"

if [[ ! -x "$OLLAMA_BIN" ]]; then
  echo "❌ Не знайдено Ollama: $OLLAMA_BIN"
  echo "   Встановіть з https://ollama.com"
  exit 1
fi

echo "Налаштовую Ollama для Chrome-розширень..."

mkdir -p "$HOME/Library/LaunchAgents"

# 1) setenv при логіні (корисно для ollama CLI)
cat > "$SETENV_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ollama.origins</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/launchctl</string>
    <string>setenv</string>
    <string>OLLAMA_ORIGINS</string>
    <string>$ORIGINS</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF

# 2) ollama serve з OLLAMA_ORIGINS (головне виправлення 403)
cat > "$SERVE_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ollama.serve.chrome</string>
  <key>ProgramArguments</key>
  <array>
    <string>$OLLAMA_BIN</string>
    <string>serve</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OLLAMA_ORIGINS</key>
    <string>$ORIGINS</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/ollama-serve.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/ollama-serve.log</string>
</dict>
</plist>
EOF

launchctl setenv OLLAMA_ORIGINS "$ORIGINS"

launchctl bootout "$GUI_DOMAIN/com.ollama.origins" 2>/dev/null || true
launchctl bootout "$GUI_DOMAIN/com.ollama.serve.chrome" 2>/dev/null || true

echo "Зупиняю поточний Ollama..."
osascript -e 'quit app "Ollama"' 2>/dev/null || true
sleep 2
pkill -x ollama 2>/dev/null || true
pkill -x Ollama 2>/dev/null || true
sleep 1

launchctl bootstrap "$GUI_DOMAIN" "$SETENV_PLIST"
launchctl bootstrap "$GUI_DOMAIN" "$SERVE_PLIST"
launchctl kickstart -k "$GUI_DOMAIN/com.ollama.serve.chrome"

echo "Чекаю запуск сервера..."
for i in {1..15}; do
  if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: chrome-extension://testid" \
  -d '{"model":"llama3.2:latest","messages":[{"role":"user","content":"ok"}],"stream":false}')

echo ""
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✓ Готово — Ollama приймає запити від розширення (HTTP $HTTP_CODE)"
  echo ""
  echo "Можна відкрити Ollama з Applications (для моделей) — сервер уже працює."
  echo "Спробуйте розширення знову."
else
  echo "⚠ Тест CORS повернув HTTP $HTTP_CODE (очікувалось 200)"
  echo "  Перевірте лог: $HOME/Library/Logs/ollama-serve.log"
  echo "  Модель: ollama pull llama3.2"
fi

echo ""
echo "Після перезавантаження Mac налаштування збережеться автоматично."
