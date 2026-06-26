#!/usr/bin/env bash
# Інтерактивний чекліст: створення Oracle Always Free VM (робите ВИ в браузері).
set -euo pipefail

cat <<'GUIDE'

╔══════════════════════════════════════════════════════════════════╗
║  Oracle Cloud Always Free — перший раз (15–20 хв)                ║
╚══════════════════════════════════════════════════════════════════╝

Це зробити можу лише ВИ (картка + акаунт). Далі — автоматично скриптами.

─── Крок 1: Акаунт ───────────────────────────────────────────────
  1. https://cloud.oracle.com → Sign Up
  2. Картка для верифікації (списання $0 або ~$1 з поверненням)
  3. Регіон: Frankfurt або Amsterdam (ближче до UA)

─── Крок 2: VM (Ampere ARM) ──────────────────────────────────────
  Menu → Compute → Instances → Create instance

  Name: content-studio-api
  Image: Ubuntu 22.04 or 24.04 (aarch64)
  Shape: Change shape → Ampere → VM.Standard.A1.Flex
         OCPUs: 1–2, Memory: 6–12 GB (в межах free)

  Networking: public IPv4 ✓
  SSH keys: Add your Mac public key
    (на Mac: cat ~/.ssh/id_rsa.pub  або  ssh-keygen -t ed25519)

  Create

─── Крок 3: Відкрити порти (ОБОВʼЯЗКОВО) ───────────────────────
  Instance → Subnet → Security List → Add Ingress Rules:

    Source 0.0.0.0/0  TCP  22
    Source 0.0.0.0/0  TCP  80
    Source 0.0.0.0/0  TCP  443
    Source 0.0.0.0/0  TCP  8787

─── Крок 4: .env на Mac ──────────────────────────────────────────
  cd ~/Desktop/twitter-post-extension/server
  cp .env.example .env
  # Додайте:
  GEMINI_API_KEYS=key1,key2
  GEMINI_MODEL=gemini-2.5-flash

─── Крок 5: Деплой з Mac ─────────────────────────────────────────
  export ORACLE_HOST=ВАШ_PUBLIC_IP
  chmod +x scripts/oracle-deploy.sh
  ./scripts/oracle-deploy.sh

─── Крок 6: Розширення ───────────────────────────────────────────
  extension-config.js → hostedApiUrl: "http://ВАШ_IP"
  manifest.json → host_permissions → "http://ВАШ_IP/*"
  chrome://extensions → Reload

─── Опційно: HTTPS (рекомендовано для продакшену) ───────────────
  Безкоштовний домен: DuckDNS / afraid.org → ваш IP
  На VM: export DOMAIN=api.yourname.duckdns.org
         sudo -E ./oracle-vm-setup.sh
  Тоді hostedApiUrl: "https://api.yourname.duckdns.org"

Після кроку 2 напишіть мені PUBLIC IP — допоможу з деплоєм і extension-config.

GUIDE

if [[ -f "$HOME/.ssh/id_rsa.pub" ]]; then
  echo "─── Ваш SSH public key (вставте в Oracle при створенні VM) ───"
  cat "$HOME/.ssh/id_rsa.pub"
elif [[ -f "$HOME/.ssh/id_ed25519.pub" ]]; then
  echo "─── Ваш SSH public key ───"
  cat "$HOME/.ssh/id_ed25519.pub"
else
  echo "Немає SSH ключа. Створіть: ssh-keygen -t ed25519 -N \"\" -f ~/.ssh/id_ed25519"
fi
