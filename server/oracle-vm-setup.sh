#!/usr/bin/env bash
# Запускати НА свіжій Ubuntu VM (Oracle Cloud Always Free), не на Mac.
#   chmod +x oracle-vm-setup.sh && sudo ./oracle-vm-setup.sh
set -euo pipefail

APP_NAME="content-studio-api"
APP_USER="${APP_USER:-ubuntu}"
APP_DIR="/opt/${APP_NAME}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
NODE_MAJOR="${NODE_MAJOR:-20}"
API_PORT="${PORT:-8787}"
DOMAIN="${DOMAIN:-}"

echo "==> Оновлення системи..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Node.js ${NODE_MAJOR}..."
if ! command -v node &>/dev/null; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "==> nginx, certbot, ufw..."
apt-get install -y nginx certbot python3-certbot-nginx ufw

echo "==> Firewall (ufw)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow "${API_PORT}/tcp"
ufw --force enable

echo "==> Каталог застосунку: ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "Скопіюйте файли server/ у ${APP_DIR} (з Mac: ./scripts/oracle-deploy.sh)"
fi

if [[ -f "${APP_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${APP_DIR}/.env"
  set +a
fi

if [[ -f "${APP_DIR}/package.json" ]]; then
  echo "==> npm install..."
  cd "${APP_DIR}"
  sudo -u "${APP_USER}" npm install --omit=dev
fi

echo "==> systemd ${SERVICE_FILE}"
cat >"${SERVICE_FILE}" <<EOF
[Unit]
Description=cheatXtwitter Content Studio API
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=-${APP_DIR}/.env
Environment=PORT=${API_PORT}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${APP_NAME}"

NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
if [[ -n "${DOMAIN}" ]]; then
  SERVER_NAME="${DOMAIN}"
  LISTEN_EXTRA=""
else
  SERVER_NAME="_"
  LISTEN_EXTRA=""
fi

cat >"${NGINX_SITE}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 14m;

    location / {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF

ln -sf "${NGINX_SITE}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [[ -n "${DOMAIN}" ]]; then
  echo "==> SSL (Let's Encrypt) для ${DOMAIN}..."
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "admin@${DOMAIN}" || true
fi

systemctl restart "${APP_NAME}" || true

PUBLIC_IP="$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "=============================================="
echo "  VM готова."
if [[ -n "${DOMAIN}" ]]; then
  echo "  API:  https://${DOMAIN}/health"
  echo "  Оновіть extension-config.js:"
  echo "    hostedApiUrl: \"https://${DOMAIN}\""
else
  echo "  API:  http://${PUBLIC_IP}/health"
  echo "  (або http://${PUBLIC_IP}:${API_PORT}/health напряму)"
  echo "  Оновіть extension-config.js + manifest host_permissions:"
  echo "    hostedApiUrl: \"http://${PUBLIC_IP}\""
fi
echo "=============================================="
echo ""
echo "ВАЖЛИВО в Oracle Console → Networking → Security List:"
echo "  Ingress: TCP 22, 80, 443, ${API_PORT} з 0.0.0.0/0"
