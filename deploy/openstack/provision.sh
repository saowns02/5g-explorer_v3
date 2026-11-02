#!/usr/bin/env bash
# Task 1 + 2: networks, storage and the three VMs, then the app.
#
#   source ~/.5g-explorer/openrc-5g-prod
#   ./deploy/openstack/provision.sh
#
# Builds (or reuses) everything below, then calls deploy.sh. Re-runnable: it
# skips resources that already exist. Prints the total time at the end,
# which is the OpenStack "provisioning time" KPI when run from an empty project.
#
#   Internet
#      |  floating IP
#   [5g-web]   5g-web-net 10.0.1.0/24   sg: 80, 443 from anywhere, 22
#      |
#   [5g-api]   5g-app-net 10.0.2.0/24   sg: 8000 from web only, 22 from web
#      |
#   [5g-db]    5g-app-net 10.0.2.0/24   sg: 5432 from api only, 22 from web
#      |
#   [5g-pgdata] Cinder volume at /mnt/pgdata
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli
START=$(date +%s)
mkdir -p "$SECRETS_DIR" && chmod 700 "$SECRETS_DIR"

# ---------- key pair ----------
log "SSH key pair"
[[ -f $SSH_KEY ]] || ssh-keygen -t ed25519 -N '' -f "$SSH_KEY" -C 5g-explorer >/dev/null
openstack keypair show "$KEY_NAME" >/dev/null 2>&1 || openstack keypair create --public-key "$SSH_KEY.pub" "$KEY_NAME" >/dev/null

# ---------- image and flavours ----------
[[ -n $(os_id image "$IMAGE_NAME") ]] || die "Image $IMAGE_NAME not found. Run image.sh (as admin) first."

log "Flavours"
make_flavor() { # name vcpus ram disk
  [[ -n $(os_id flavor "$1") ]] || openstack flavor create --vcpus "$2" --ram "$3" --disk "$4" --private --project "$OS_PROJECT_NAME" "$1" >/dev/null
  echo "  $1: $2 vCPU, $3 MB RAM, $4 GB disk"
}
make_flavor "$FLAVOR_WEB" "$FLAVOR_WEB_VCPU" "$FLAVOR_WEB_RAM" "$FLAVOR_WEB_DISK"
make_flavor "$FLAVOR_API" "$FLAVOR_API_VCPU" "$FLAVOR_API_RAM" "$FLAVOR_API_DISK"
make_flavor "$FLAVOR_DB" "$FLAVOR_DB_VCPU" "$FLAVOR_DB_RAM" "$FLAVOR_DB_DISK"

# ---------- networks ----------
log "Networks, subnets and router"
make_net() { # net subnet cidr
  [[ -n $(os_id network "$1") ]] || openstack network create "$1" >/dev/null
  [[ -n $(os_id subnet "$2") ]] || openstack subnet create --network "$1" --subnet-range "$3" --dns-nameserver "$DNS_SERVER" "$2" >/dev/null
  echo "  $1 ($3)"
}
make_net "$WEB_NET" "$WEB_SUBNET" "$WEB_CIDR"
make_net "$APP_NET" "$APP_SUBNET" "$APP_CIDR"
if [[ -z $(os_id router "$ROUTER") ]]; then
  openstack router create "$ROUTER" >/dev/null
  openstack router set --external-gateway "$EXT_NET" "$ROUTER"
  openstack router add subnet "$ROUTER" "$WEB_SUBNET"
  # The app subnet gets outbound access through the router (for OS updates)
  # but no floating IPs, so nothing on it is reachable from outside.
  openstack router add subnet "$ROUTER" "$APP_SUBNET"
fi
echo "  $ROUTER -> $EXT_NET"

# ---------- security groups ----------
log "Security groups"
make_sg() { [[ -n $(os_id "security group" "$1") ]] && return 1; openstack security group create --description "$2" "$1" >/dev/null; }
if make_sg "$SG_WEB" "5G web tier: HTTP/HTTPS from anywhere"; then
  openstack security group rule create --protocol tcp --dst-port 80 --remote-ip 0.0.0.0/0 "$SG_WEB" >/dev/null
  openstack security group rule create --protocol tcp --dst-port 443 --remote-ip 0.0.0.0/0 "$SG_WEB" >/dev/null
  openstack security group rule create --protocol tcp --dst-port 22 --remote-ip 0.0.0.0/0 "$SG_WEB" >/dev/null
  openstack security group rule create --protocol icmp --remote-ip 0.0.0.0/0 "$SG_WEB" >/dev/null
fi
if make_sg "$SG_API" "5G API tier: 8000 from the web tier only"; then
  openstack security group rule create --protocol tcp --dst-port "$API_PORT" --remote-group "$SG_WEB" "$SG_API" >/dev/null
  openstack security group rule create --protocol tcp --dst-port 22 --remote-group "$SG_WEB" "$SG_API" >/dev/null
fi
if make_sg "$SG_DB" "5G DB tier: 5432 from the API tier only"; then
  openstack security group rule create --protocol tcp --dst-port 5432 --remote-group "$SG_API" "$SG_DB" >/dev/null
  openstack security group rule create --protocol tcp --dst-port 22 --remote-group "$SG_WEB" "$SG_DB" >/dev/null
fi
echo "  $SG_WEB, $SG_API, $SG_DB"

# ---------- storage ----------
log "Cinder volume for PostgreSQL data"
[[ -n $(os_id volume "$DB_VOLUME") ]] || openstack volume create --size "$DB_VOLUME_GB" --description "PostgreSQL data for 5G Globe Explorer" "$DB_VOLUME" >/dev/null
echo "  $DB_VOLUME (${DB_VOLUME_GB} GB)"

# ---------- instances ----------
log "Instances"
make_vm() { # name flavor net sg
  if [[ -z $(os_id server "$1") ]]; then
    openstack server create --image "$IMAGE_NAME" --flavor "$2" --network "$3" \
      --security-group "$4" --key-name "$KEY_NAME" --wait "$1" >/dev/null
  fi
  echo "  $1 ACTIVE"
}
make_vm "$VM_DB" "$FLAVOR_DB" "$APP_NET" "$SG_DB"
make_vm "$VM_API" "$FLAVOR_API" "$APP_NET" "$SG_API"
make_vm "$VM_WEB" "$FLAVOR_WEB" "$WEB_NET" "$SG_WEB"

if ! openstack server show "$VM_DB" -f json -c volumes_attached | grep -q "$(os_id volume "$DB_VOLUME")"; then
  openstack server add volume "$VM_DB" "$DB_VOLUME" --device /dev/vdb >/dev/null
fi

log "Floating IP for the web tier only"
WEB_FIP=$(floating_ip "$VM_WEB")
if [[ -z $WEB_FIP ]]; then
  WEB_FIP=$(openstack floating ip create "$EXT_NET" -f value -c floating_ip_address)
  openstack server add floating ip "$VM_WEB" "$WEB_FIP"
fi
echo "  $VM_WEB -> $WEB_FIP"

API_IP=$(private_ip "$VM_API")
DB_IP=$(private_ip "$VM_DB")
WEB_IP=$(private_ip "$VM_WEB")

cat > "$INVENTORY" <<INV
# Written by provision.sh on $(date -u +%FT%TZ)
WEB_FIP=$WEB_FIP
WEB_IP=$WEB_IP
API_IPS="$API_IP"
DB_IP=$DB_IP
VOLUME_ID=$(os_id volume "$DB_VOLUME")
INV
echo "  inventory: $INVENTORY"

log "Infrastructure ready after $(elapsed "$START")s. Deploying the app"
"$HERE/deploy.sh" --first-run

echo
echo "5G Globe Explorer is live at http://$WEB_FIP"
echo "Provisioning time (zero to running): $(elapsed "$START")s"
