#!/usr/bin/env bash
# Native baseline install for the 5G Globe Explorer (Ubuntu 24.04, no virtualisation).
#
#   sudo ./deploy/native/setup.sh            # install or update everything
#   sudo CAP=1 ./deploy/native/setup.sh      # also apply the VM-matching resource caps
#
# Idempotent: safe to re-run after a git pull. Prints total time at the end,
# which is the native "provisioning time" KPI when run on a fresh machine.
set -euo pipefail

START=$(date +%s)
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR=/opt/5g-explorer
WEB_DIR=/var/www/5g-explorer
ENV_DIR=/etc/5g-explorer
APP_USER=fiveg
DB_NAME=fiveg
DB_USER=fiveg
NGINX_PORT="${NGINX_PORT:-8080}"   # 80 is left for DevStack's Horizon
API_PORT="${API_PORT:-8000}"
API_WORKERS="${API_WORKERS:-2}"
CSV="${CSV:-$REPO_DIR/data/5g_coverage_clean.csv}"

log() { printf '\n==> %s\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
[[ -f "$CSV" ]] || { echo "Missing $CSV. Run db/etl/clean.py first." >&2; exit 1; }

log "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx postgresql postgresql-16-postgis-3 python3-venv nodejs npm curl rsync openssl git

log "Creating service user and folders"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$WEB_DIR" "$ENV_DIR"

log "Configuring PostgreSQL"
if [[ ! -f "$ENV_DIR/db.password" ]]; then
  openssl rand -hex 16 > "$ENV_DIR/db.password"
  chmod 600 "$ENV_DIR/db.password"
fi
DB_PASS=$(cat "$ENV_DIR/db.password")
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE $DB_USER PASSWORD '$DB_PASS';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
sudo -u postgres psql -q -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME"

log "Installing the API"
rsync -a --delete --exclude tests "$REPO_DIR/api/" "$APP_DIR/api/"
rsync -a "$REPO_DIR/db/" "$APP_DIR/db/"
[[ -d "$APP_DIR/venv" ]] || python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install -q --upgrade pip
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/api/requirements.txt"
cat > "$ENV_DIR/api.env" <<ENV
DATABASE_URL=$DATABASE_URL
ENV
chmod 640 "$ENV_DIR/api.env"
chgrp "$APP_USER" "$ENV_DIR/api.env"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Loading the dataset"
DATABASE_URL="$DATABASE_URL" "$APP_DIR/venv/bin/python" "$APP_DIR/db/load.py" "$CSV"

log "Starting the API service"
sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@ENV_DIR@#$ENV_DIR#g" -e "s#@APP_USER@#$APP_USER#g" \
    -e "s#@API_PORT@#$API_PORT#g" -e "s#@API_WORKERS@#$API_WORKERS#g" \
    "$REPO_DIR/deploy/native/fiveg-api.service" > /etc/systemd/system/fiveg-api.service
systemctl daemon-reload
systemctl enable --now fiveg-api.service
systemctl restart fiveg-api.service

log "Building and publishing the frontend"
if [[ "${SKIP_FRONTEND_BUILD:-0}" != 1 ]]; then
  (cd "$REPO_DIR/frontend" && npm ci --no-audit --no-fund && VITE_API_URL=/api npm run build)
fi
rsync -a --delete "$REPO_DIR/frontend/dist/" "$WEB_DIR/"

log "Configuring Nginx on port $NGINX_PORT"
sed -e "s#@NGINX_PORT@#$NGINX_PORT#g" -e "s#@WEB_DIR@#$WEB_DIR#g" -e "s#@API_PORT@#$API_PORT#g" \
    "$REPO_DIR/deploy/native/nginx-5g-explorer.conf" > /etc/nginx/sites-available/5g-explorer
ln -sf /etc/nginx/sites-available/5g-explorer /etc/nginx/sites-enabled/5g-explorer
nginx -t
systemctl reload nginx

if [[ "${CAP:-0}" == 1 ]]; then
  log "Applying resource caps to match the OpenStack flavours"
  # API VM: 2 vCPU / 2 GB. DB VM: 2 vCPU / 4 GB. Adjust core numbers to your CPU.
  systemctl set-property fiveg-api.service AllowedCPUs="${API_CPUS:-2-3}" MemoryMax=2G
  systemctl set-property postgresql@16-main.service AllowedCPUs="${DB_CPUS:-4-5}" MemoryMax=4G
  systemctl restart postgresql fiveg-api.service
fi

log "Smoke test"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$NGINX_PORT/api/health" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$NGINX_PORT/api/health"; echo
curl -fsS -o /dev/null "http://127.0.0.1:$NGINX_PORT/" && echo "frontend ok"

echo
echo "Native stack ready at http://$(hostname -I | awk '{print $1}'):$NGINX_PORT"
echo "Commit: $(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "Provisioning time: $(( $(date +%s) - START ))s"
