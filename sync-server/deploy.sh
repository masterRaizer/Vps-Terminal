#!/usr/bin/env bash
# Deploys the sync server in this directory. Run as root on the VPS:
#   ./deploy.sh sync.devkillmix.com [caddy|nginx|nginx-port|local]
# auto: Caddy if 80/443 are free; nginx if nginx itself owns :443; otherwise (443 taken by e.g.
# Xray Reality) nginx on a separate TLS port (TLS_PORT, default 2053) — :443 is never touched.
# The access token is generated here and printed ONCE; only its sha256 is stored.
set -euo pipefail
cd "$(dirname "$0")"
DOMAIN="${1:?usage: ./deploy.sh <domain> [caddy|nginx|local]}"
MODE="${2:-auto}"

command -v docker >/dev/null || { echo "Docker не установлен: curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нужен docker compose v2"; exit 1; }

port_busy() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
port_owner() { ss -ltnpH "( sport = :$1 )" 2>/dev/null | grep -o 'users:(("[^"]*' | head -1 | cut -d'"' -f2; }
HTTPS_PORT=443
TLS_PORT="${TLS_PORT:-2053}"
if [ "$MODE" = auto ]; then
  if ! port_busy 80 && ! port_busy 443; then MODE=caddy
  elif systemctl is-active --quiet nginx 2>/dev/null && [ "$(port_owner 443)" = nginx ]; then MODE=nginx
  elif systemctl is-active --quiet nginx 2>/dev/null; then MODE=nginx-port   # 443 belongs to someone else
  elif ! port_busy 80 && ! port_busy 8443; then MODE=caddy; HTTPS_PORT=8443
  else MODE=local; fi
fi
[ "$MODE" = nginx-port ] && HTTPS_PORT="$TLS_PORT"
echo "Режим: $MODE (HTTPS-порт $HTTPS_PORT)"

mkdir -p data && chown 1000:1000 data && chmod 700 data
TOKEN=""
if [ ! -f .env ]; then
  TOKEN="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
  HASH="$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)"
  umask 077
  printf 'SYNC_TOKEN_SHA256=%s\nSYNC_DOMAIN=%s\nHTTPS_PORT=%s\n' "$HASH" "$DOMAIN" "$HTTPS_PORT" > .env
fi
HTTPS_PORT="$(grep -E '^HTTPS_PORT=' .env | cut -d= -f2 || echo 443)"
SUFFIX=""; [ "${HTTPS_PORT:-443}" = 443 ] || SUFFIX=":$HTTPS_PORT"

case "$MODE" in
  caddy) docker compose --profile caddy up -d --build ;;
  nginx)
    docker compose up -d --build
    sed "s/sync.devkillmix.com/$DOMAIN/" nginx-site.conf > "/etc/nginx/sites-available/$DOMAIN"
    ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
    nginx -t && systemctl reload nginx
    if command -v certbot >/dev/null; then certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
    else echo "Установите certbot и выполните: certbot --nginx -d $DOMAIN"; fi ;;
  nginx-port)
    port_busy "$TLS_PORT" && { echo "Порт $TLS_PORT занят — задайте другой: TLS_PORT=... ./deploy.sh $DOMAIN nginx-port"; exit 1; }
    docker compose up -d --build
    tar czf "/root/nginx.bak.$(date +%F_%H%M%S).tgz" /etc/nginx
    mkdir -p /var/www/vps-terminal-sync
    CONF=/etc/nginx/conf.d/vps-terminal-sync.conf
    # First only the :80 block (ACME), then the certificate, then the TLS block.
    sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$TLS_PORT/g" nginx-conf.d.template | awk '/^server \{/{n++} n<2' > "$CONF"
    nginx -t && systemctl reload nginx
    certbot certonly --webroot -w /var/www/vps-terminal-sync -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --deploy-hook "systemctl reload nginx"
    sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$TLS_PORT/g" nginx-conf.d.template > "$CONF"
    if ! nginx -t; then rm -f "$CONF"; systemctl reload nginx; echo "nginx -t не прошёл — конфиг убран"; exit 1; fi
    systemctl reload nginx ;;
  local) docker compose up -d --build; echo "Сервер слушает 127.0.0.1:8787 — подключите свой reverse proxy с TLS." ;;
  *) echo "Неизвестный режим $MODE"; exit 1 ;;
esac

sleep 3
curl -fsS http://127.0.0.1:8787/healthz && echo
if [ -n "$TOKEN" ]; then
  echo "================================================================"
  echo " Токен для приложения (показывается один раз, сохраните его):"
  echo "   $TOKEN"
  echo " Адрес: https://$DOMAIN$SUFFIX"
  echo "================================================================"
else
  echo "Токен уже был создан раньше (.env существует). Новый: удалите .env и запустите снова."
fi
