#!/usr/bin/env bash
# Деплой server/ на Oracle VM з вашого Mac.
#
# 1) Створіть VM в Oracle Cloud (див. scripts/oracle-first-time.sh)
# 2) export ORACLE_HOST=YOUR_PUBLIC_IP
# 3) ./scripts/oracle-deploy.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
SSH_USER="${ORACLE_SSH_USER:-ubuntu}"
HOST="${ORACLE_HOST:-}"
SSH_KEY="${ORACLE_SSH_KEY:-$HOME/.ssh/id_rsa}"
REMOTE_DIR="/opt/content-studio-api"

if [[ -z "$HOST" ]]; then
  echo "Вкажіть IP VM: export ORACLE_HOST=1.2.3.4"
  exit 1
fi

if [[ ! -f "$SERVER/.env" ]]; then
  echo "Створіть $SERVER/.env (скопіюйте з .env.example і додайте GEMINI_API_KEYS)"
  exit 1
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[[ -f "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")

echo "==> Копіювання server/ → ${SSH_USER}@${HOST}:${REMOTE_DIR}"
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" "sudo mkdir -p ${REMOTE_DIR} && sudo chown ${SSH_USER}:${SSH_USER} ${REMOTE_DIR}"

rsync -avz --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules \
  --exclude '.env' \
  "$SERVER/" "${SSH_USER}@${HOST}:${REMOTE_DIR}/"

scp "${SSH_OPTS[@]}" "$SERVER/.env" "${SSH_USER}@${HOST}:${REMOTE_DIR}/.env"

echo "==> Встановлення на VM..."
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/content-studio-api
if [[ ! -f oracle-vm-setup.sh ]]; then
  echo "oracle-vm-setup.sh не знайдено"
  exit 1
fi
chmod +x oracle-vm-setup.sh
# Перший раз — повне налаштування; далі лише npm + restart
if ! systemctl is-enabled content-studio-api &>/dev/null; then
  sudo DOMAIN="${DOMAIN:-}" ./oracle-vm-setup.sh
else
  npm install --omit=dev
  sudo systemctl restart content-studio-api
fi
REMOTE

echo ""
echo "==> Перевірка health..."
sleep 2
if curl -sf "http://${HOST}/health" | head -c 300; then
  echo ""
  echo ""
  echo "OK. Оновіть extension-config.js:"
  echo "  hostedApiUrl: \"http://${HOST}\""
  echo "І додайте в manifest.json host_permissions:"
  echo "  \"http://${HOST}/*\""
else
  echo "Health ще не відповідає. Перевірте порти 80/8787 в Oracle Security List."
  echo "  curl http://${HOST}/health"
fi
