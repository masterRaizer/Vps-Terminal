# Vps Terminal SSH — sync server

Zero-knowledge: the desktop app encrypts the whole vault (scrypt + AES-256-GCM) before upload. This server stores one opaque blob, a version number and the last 20 versions as backups. It never receives the master password.

API (bearer token): `GET /v1/vault` → `{version, updatedAt, blob}` or 404; `PUT /v1/vault {baseVersion, blob}` → 200 `{version}` or 409 with the current copy (the client merges and retries). `GET /healthz` is public.

## Deploy

```bash
scp -r sync-server root@VPS:/opt/vps-terminal-sync
ssh root@VPS 'cd /opt/vps-terminal-sync && ./deploy.sh sync.example.com'
```

`deploy.sh` picks a mode: **caddy** (ports 80/443 free → automatic Let's Encrypt; if only 443 is taken, e.g. by Xray Reality, Caddy serves on 8443), **nginx** (existing nginx → site config + certbot), **local** (only 127.0.0.1:8787). The DNS A record of the domain must point at the VPS. The token is printed once; enter it with the URL and a master password in the app → «Синхронизация».

Data lives in `./data` (vault.json + history/). Back it up as an ordinary file — it is encrypted.
