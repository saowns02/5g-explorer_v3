#!/usr/bin/env bash
# Remove everything provision.sh created, so provisioning can be timed again
# from zero.
#
#   ./deploy/openstack/teardown.sh                # keeps the Cinder volume (data)
#   ./deploy/openstack/teardown.sh --all          # also deletes the volume
#
# The image, flavours, projects and users stay; they are set up once.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli

log "Instances"
for vm in $(openstack server list -f value -c Name | grep -E "^($VM_WEB|$VM_API|$VM_API-[0-9]+|$VM_DB)$" || true); do
  fip=$(floating_ip "$vm")
  [[ -n $fip ]] && openstack floating ip delete "$fip"
  openstack server delete --wait "$vm" && echo "  deleted $vm"
done

if [[ ${1:-} == --all ]]; then
  log "Volume"
  [[ -n $(os_id volume "$DB_VOLUME") ]] && openstack volume delete "$DB_VOLUME" && echo "  deleted $DB_VOLUME"
fi

log "Router, networks, security groups"
if [[ -n $(os_id router "$ROUTER") ]]; then
  openstack router remove subnet "$ROUTER" "$WEB_SUBNET" 2>/dev/null || true
  openstack router remove subnet "$ROUTER" "$APP_SUBNET" 2>/dev/null || true
  openstack router delete "$ROUTER"
fi
for n in "$WEB_NET" "$APP_NET"; do [[ -n $(os_id network "$n") ]] && openstack network delete "$n"; done
for sg in "$SG_DB" "$SG_API" "$SG_WEB"; do [[ -n $(os_id "security group" "$sg") ]] && openstack security group delete "$sg"; done
rm -f "$INVENTORY"
echo "Done."
