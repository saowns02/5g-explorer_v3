#!/usr/bin/env bash
# Runs ON an API VM (as root), called by deploy.sh.
# Installs the API from the release tarball and (re)starts it under systemd.
set -euo pipefail
: "${DATABASE_URL:?}" "${API_PORT:?}"
APP=/opt/5g-explorer

rm -rf "$APP/release" && mkdir -p "$APP/release"
tar -xzf /tmp/release.tar.gz -C "$APP/release"
rsync -a --delete --exclude tests "$APP/release/api/" "$APP/api/"
# Packages are pre-installed in the image; this is a no-op unless requirements changed.
"$APP/venv/bin/pip" install -q -r "$APP/api/requirements.txt"

mkdir -p /etc/5g-explorer
printf 'DATABASE_URL=%s\n' "$DATABASE_URL" > /etc/5g-explorer/api.env
chmod 640 /etc/5g-explorer/api.env
chgrp fiveg /etc/5g-explorer/api.env
chown -R fiveg:fiveg "$APP/api"

cat > /etc/systemd/system/fiveg-api.service <<UNIT
[Unit]
Description=5G Globe Explorer API (FastAPI)
After=network-online.target
Wants=network-online.target

[Service]
User=fiveg
Group=fiveg
WorkingDirectory=$APP/api
EnvironmentFile=/etc/5g-explorer/api.env
ExecStart=$APP/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $API_PORT --workers 2
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable fiveg-api.service
systemctl restart fiveg-api.service

for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$API_PORT/health" && { echo; exit 0; }
  sleep 1
done
journalctl -u fiveg-api.service -n 30 --no-pager
exit 1
