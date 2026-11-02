#!/usr/bin/env bash
# KPI: scaling effort, adding a second API node.
#
#   ./deploy/openstack/scale-api.sh            # adds 5g-api-2
#   ./deploy/openstack/scale-api.sh 3          # adds 5g-api-3
#
# Launches another API VM from the same image, deploys the API to it and
# adds it to Nginx's upstream on the web VM, which then load-balances across
# all API nodes. Counts the commands and the time; writes results/openstack/scaling.csv.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli
load_inventory

N=${1:-2}
NAME="$VM_API-$N"
T0=$(date +%s)
STEPS=0

log "Launching $NAME"
openstack server create --image "$IMAGE_NAME" --flavor "$FLAVOR_API" --network "$APP_NET" \
  --security-group "$SG_API" --key-name "$KEY_NAME" --wait "$NAME" >/dev/null
STEPS=$((STEPS + 1))
NEW_IP=$(private_ip "$NAME")
echo "  $NAME at $NEW_IP"

if [[ " $API_IPS " != *" $NEW_IP "* ]]; then
  sed -i "s/^API_IPS=.*/API_IPS=\"$API_IPS $NEW_IP\"/" "$INVENTORY"
fi
STEPS=$((STEPS + 1))

log "Deploying to every API node and updating the load balancer"
"$HERE/deploy.sh"
STEPS=$((STEPS + 1))

TOTAL=$(elapsed "$T0")
echo
echo "Scaled to $(load_inventory; wc -w <<< "$API_IPS") API nodes in ${TOTAL}s with $STEPS commands"

OUT="$REPO_DIR/results/openstack/scaling.csv"
mkdir -p "$(dirname "$OUT")"
[[ -f $OUT ]] || echo "date,commit,environment,seconds,commands,api_nodes" > "$OUT"
echo "$(date -u +%FT%TZ),$(git -C "$REPO_DIR" rev-parse --short HEAD),openstack,$TOTAL,$STEPS,$N" >> "$OUT"
echo "Saved to $OUT"
