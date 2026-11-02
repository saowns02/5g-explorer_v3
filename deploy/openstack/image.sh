#!/usr/bin/env bash
# Task 1: deploy a custom image.
#
#   source ~/devstack/openrc admin admin
#   ./deploy/openstack/image.sh
#
# Takes the official Ubuntu 24.04 cloud image, pre-installs everything the
# three tiers need (Nginx, PostgreSQL + PostGIS, the API's Python packages),
# and uploads it to Glance as a public image. VMs built from it need no
# internet access at boot. Needs libguestfs-tools on the host.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli
command -v virt-customize >/dev/null || die "virt-customize missing: sudo apt install libguestfs-tools"

WORK="$SECRETS_DIR/image"
BASE="$WORK/$UBUNTU_RELEASE-server-cloudimg-amd64.img"
OUT="$WORK/$IMAGE_NAME.qcow2"
mkdir -p "$WORK"
START=$(date +%s)

if [[ ! -f $BASE ]]; then
  log "Downloading the Ubuntu $UBUNTU_RELEASE cloud image"
  curl -fL -o "$BASE" "https://cloud-images.ubuntu.com/$UBUNTU_RELEASE/current/$UBUNTU_RELEASE-server-cloudimg-amd64.img"
fi

log "Customising (this takes several minutes)"
cp "$BASE" "$OUT"
qemu-img resize "$OUT" 8G
sudo virt-customize -a "$OUT" --network \
  --run-command 'growpart /dev/sda 1 || true; resize2fs /dev/sda1 || true' \
  --update \
  --install nginx,postgresql,postgresql-16-postgis-3,python3-venv,python3-pip,rsync,curl,jq \
  --run-command 'systemctl disable nginx postgresql' \
  --mkdir /opt/5g-explorer \
  --copy-in "$REPO_DIR/api/requirements.txt:/opt/5g-explorer" \
  --run-command 'python3 -m venv /opt/5g-explorer/venv && /opt/5g-explorer/venv/bin/pip install -q -r /opt/5g-explorer/requirements.txt' \
  --run-command 'useradd --system --home /opt/5g-explorer --shell /usr/sbin/nologin fiveg' \
  --write /etc/5g-explorer-image:"$IMAGE_NAME built $(date -u +%F) from commit $(git -C "$REPO_DIR" rev-parse --short HEAD)" \
  --run-command 'apt-get clean' \
  --run-command 'cloud-init clean --logs || true' \
  --truncate /etc/machine-id

log "Uploading to Glance as $IMAGE_NAME"
if [[ -n $(os_id image "$IMAGE_NAME") ]]; then
  openstack image set --name "$IMAGE_NAME-old-$(date +%s)" "$IMAGE_NAME"
fi
openstack image create "$IMAGE_NAME" \
  --file "$OUT" --disk-format qcow2 --container-format bare --public \
  --property os_distro=ubuntu --property os_version=24.04 \
  --property hw_disk_bus=virtio --property hw_vif_model=virtio >/dev/null

openstack image show "$IMAGE_NAME" -c name -c status -c size -c visibility -f table
echo "Image built and uploaded in $(elapsed "$START")s"
