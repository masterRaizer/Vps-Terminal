#!/usr/bin/env bash
# Deploys the sync server in this directory. Run as root on the VPS:
#   ./deploy.sh sync.devkillmix.com [caddy|nginx|local]
# The access token is generated here and printed ONCE; only its sha256 is stored.
set -euo pipefail
cd "$(dirname "$0")"
DOMAIN="${1:?usage: ./deploy.sh <domain> [caddy|nginx|local]}"
MODE="${2:-auto}"

command -v docker >/dev/null || { echo "Docker не установлен: curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нужен docker compose v2"; exit 1; }

port_busy() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
if [ "$MODE" = auto ]; then
  if ! port_busy 80 && ! port_busy 443; then MODE=caddy
  elif command -v nginx >/dev/null; then MODE=nginx
  else MODE=local; fi
fi
echo "Режим: $MODE"

mkdir -p data && chown 1000:1000 data && chmod 700 data
TOKEN=""
if [ ! -f .env ]; then
  TOKEN="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
  HASH="$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)"
  umask 077
  printf 'SYNC_TOKEN_SHA256=%s\nSYNC_DOMAIN=%s\n' "$HASH" "$DOMAIN" > .env
fi

case "$MODE" in
  caddy) docker compose --profile caddy up -d --build ;;
  nginx)
    docker compose up -d --build
    sed "s/sync.devkillmix.com/$DOMAIN/" nginx-site.conf > "/etc/nginx/sites-available/$DOMAIN"
    ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
    nginx -t && systemctl reload nginx
    if command -v certbot >/dev/null; then certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
    else echo "Установите certbot и выполните: certbot --nginx -d $DOMAIN"; fi ;;
  local) docker compose up -d --build; echo "Сервер слушает 127.0.0.1:8787 — подключите свой reverse proxy с TLS." ;;
  *) echo "Неизвестный режим $MODE"; exit 1 ;;
esac

sleep 3
curl -fsS http://127.0.0.1:8787/healthz && echo
if [ -n "$TOKEN" ]; then
  echo "================================================================"
  echo " Токен для приложения (показывается один раз, сохраните его):"
  echo "   $TOKEN"
  echo " Адрес: https://$DOMAIN"
  echo "================================================================"
else
  echo "Токен уже был создан раньше (.env существует). Новый: удалите .env и запустите снова."
fi
