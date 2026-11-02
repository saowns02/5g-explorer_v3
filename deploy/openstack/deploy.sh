#!/usr/bin/env bash
# Deploy the current commit to the three VMs. Used by provision.sh, by
# Jenkins on every push, and by hand.
#
#   ./deploy/openstack/deploy.sh               # code only: API restart, new frontend
#   ./deploy/openstack/deploy.sh --reload-data # also rebuild the database from the CSV
#   ./deploy/openstack/deploy.sh --first-run   # format the volume, set up every tier
#
# The frontend must be built first (VITE_API_URL=/api npm run build in frontend/);
# this script builds it if dist/ is missing.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_inventory

MODE=${1:-}
RELOAD=0
[[ $MODE == --reload-data || $MODE == --first-run ]] && RELOAD=1
START=$(date +%s)
mkdir -p "$SECRETS_DIR"

# DB password shared by the DB and API roles; created once, kept out of Git.
PASSFILE="$SECRETS_DIR/db.password"
[[ -f $PASSFILE ]] || { openssl rand -hex 16 > "$PASSFILE"; chmod 600 "$PASSFILE"; }
DB_PASS=$(cat "$PASSFILE")

if [[ ! -f "$REPO_DIR/frontend/dist/index.html" ]]; then
  log "Building the frontend"
  (cd "$REPO_DIR/frontend" && npm ci --no-audit --no-fund && VITE_API_URL=/api npm run build)
fi

log "Packaging commit $(git -C "$REPO_DIR" rev-parse --short HEAD)"
TARBALL=$(release_tarball)
DIST_TAR="$SECRETS_DIR/dist.tar.gz"
tar -czf "$DIST_TAR" -C "$REPO_DIR/frontend/dist" .

wait_ssh web
wait_ssh "$DB_IP"

# ---------- database tier ----------
log "Database tier ($DB_IP)"
scp_private "$DB_IP" "$TARBALL" /tmp/release.tar.gz
scp_private "$DB_IP" "$HERE/roles/db.sh" /tmp/db.sh
ssh_private "$DB_IP" "sudo DB_PASS='$DB_PASS' APP_CIDR='$APP_CIDR' PGDATA_MOUNT='$PGDATA_MOUNT' DB_NAME='$DB_NAME' DB_USER='$DB_USER' RELOAD='$RELOAD' VOLUME_ID='$VOLUME_ID' bash /tmp/db.sh"

# ---------- API tier (one or more nodes) ----------
for ip in $API_IPS; do
  log "API tier ($ip)"
  wait_ssh "$ip"
  scp_private "$ip" "$TARBALL" /tmp/release.tar.gz
  scp_private "$ip" "$HERE/roles/api.sh" /tmp/api.sh
  ssh_private "$ip" "sudo DATABASE_URL='postgresql://$DB_USER:$DB_PASS@$DB_IP:5432/$DB_NAME' API_PORT='$API_PORT' bash /tmp/api.sh"
done

# ---------- web tier ----------
log "Web tier ($WEB_FIP)"
scp_web "$DIST_TAR" /tmp/dist.tar.gz
scp_web "$HERE/roles/web.sh" /tmp/web.sh
ssh_web "sudo API_UPSTREAMS='$API_IPS' API_PORT='$API_PORT' bash /tmp/web.sh"

log "Smoke test through the floating IP"
for _ in $(seq 1 30); do
  curl -fsS "http://$WEB_FIP/api/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://$WEB_FIP/api/health"; echo
curl -fsS -o /dev/null "http://$WEB_FIP/" && echo "frontend ok"
echo "Deployed in $(elapsed "$START")s"
