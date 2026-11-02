#!/usr/bin/env bash
# KPI: recovery time after a database failure.
#
#   ./deploy/openstack/recover-db.sh
#
# Simulates losing the DB server: deletes the 5g-db instance, launches a
# replacement from the same image and flavour, reattaches the Cinder volume
# (the data lives there, so nothing is reloaded), points the API at the new
# IP, and times until /api/health and a real query answer again.
# Writes one line to results/openstack/recovery.csv.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli
load_inventory

ROWS_BEFORE=$(curl -fsS "http://$WEB_FIP/api/meta" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totals"]["records"])')
echo "Records before failure: $ROWS_BEFORE"

T0=$(date +%s)
log "Failure: deleting $VM_DB"
openstack server delete --wait "$VM_DB"
DOWN_AT=$(date +%s)
curl -s -o /dev/null -w "API while the DB is gone: HTTP %{http_code}\n" "http://$WEB_FIP/api/meta" || true

log "Recovery: new $VM_DB from $IMAGE_NAME"
openstack server create --image "$IMAGE_NAME" --flavor "$FLAVOR_DB" --network "$APP_NET" \
  --security-group "$SG_DB" --key-name "$KEY_NAME" --wait "$VM_DB" >/dev/null
openstack server add volume "$VM_DB" "$DB_VOLUME" --device /dev/vdb >/dev/null
NEW_DB_IP=$(private_ip "$VM_DB")
sed -i "s/^DB_IP=.*/DB_IP=$NEW_DB_IP/" "$INVENTORY"
echo "  new DB IP $NEW_DB_IP, volume $DB_VOLUME reattached"

# Code-only deploy: db role finds the existing data on the volume; API nodes
# get the new DATABASE_URL.
"$HERE/deploy.sh"

ROWS_AFTER=$(curl -fsS "http://$WEB_FIP/api/meta" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totals"]["records"])')
TOTAL=$(elapsed "$T0")
echo
echo "Records after recovery: $ROWS_AFTER (before: $ROWS_BEFORE)"
echo "Recovery time, failure to healthy: ${TOTAL}s"

OUT="$REPO_DIR/results/openstack/recovery.csv"
mkdir -p "$(dirname "$OUT")"
[[ -f $OUT ]] || echo "date,commit,environment,seconds,rows_before,rows_after,data_preserved" > "$OUT"
echo "$(date -u +%FT%TZ),$(git -C "$REPO_DIR" rev-parse --short HEAD),openstack,$TOTAL,$ROWS_BEFORE,$ROWS_AFTER,$([[ $ROWS_BEFORE == "$ROWS_AFTER" ]] && echo yes || echo no)" >> "$OUT"
echo "Saved to $OUT (outage started $(( DOWN_AT - T0 ))s after the delete call)"
