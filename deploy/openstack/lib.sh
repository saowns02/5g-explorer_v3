# Shared helpers. Sourced by the other scripts, not run directly.
# shellcheck shell=bash

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HERE/../.." && pwd)"
# shellcheck source=config.env
source "$HERE/config.env"

log() { printf '\n==> %s\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

require_cli() {
  command -v openstack >/dev/null || die "openstack CLI not found. pip install python-openstackclient"
  [[ -n "${OS_AUTH_URL:-}" ]] || die "No OpenStack credentials. Source an openrc file first."
}

# Id of a named resource, or empty if it doesn't exist.
os_id() { openstack "$1" show "$2" -f value -c id 2>/dev/null || true; }

# Seconds since a start time, for the KPI timings.
elapsed() { echo $(( $(date +%s) - $1 )); }

load_inventory() {
  [[ -f "$INVENTORY" ]] || die "No inventory at $INVENTORY. Run provision.sh first."
  # shellcheck source=/dev/null
  source "$INVENTORY"
}

# SSH to the web VM directly (floating IP) and to the private VMs through it.
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$SECRETS_DIR/known_hosts" -o ConnectTimeout=10 -o BatchMode=yes)

ssh_web() { ssh "${SSH_OPTS[@]}" "$SSH_USER@$WEB_FIP" "$@"; }
ssh_private() {
  local ip=$1; shift
  ssh "${SSH_OPTS[@]}" -o ProxyCommand="ssh ${SSH_OPTS[*]} -W %h:%p $SSH_USER@$WEB_FIP" "$SSH_USER@$ip" "$@"
}
scp_private() {
  local ip=$1 src=$2 dst=$3
  scp "${SSH_OPTS[@]}" -o ProxyCommand="ssh ${SSH_OPTS[*]} -W %h:%p $SSH_USER@$WEB_FIP" "$src" "$SSH_USER@$ip:$dst"
}
scp_web() { scp "${SSH_OPTS[@]}" "$1" "$SSH_USER@$WEB_FIP:$2"; }

# Wait until SSH answers on a host (ip or "web").
wait_ssh() {
  local target=$1 tries=${2:-60}
  for _ in $(seq 1 "$tries"); do
    if [[ $target == web ]]; then ssh_web true 2>/dev/null && return 0
    else ssh_private "$target" true 2>/dev/null && return 0; fi
    sleep 5
  done
  die "SSH to $target did not come up"
}

# Tarball of the committed code at HEAD, so every VM runs the same commit.
release_tarball() {
  local out="$SECRETS_DIR/release.tar.gz"
  git -C "$REPO_DIR" archive --format=tar.gz -o "$out" HEAD
  echo "$out"
}

# Private (fixed) IP of a server's first port.
private_ip() { openstack port list --server "$1" -f value -c "Fixed IP Addresses" | grep -oE "ip_address='[0-9.]+'" | head -1 | cut -d"'" -f2; }

# Floating IP attached to a server, if any.
floating_ip() {
  local fixed; fixed=$(private_ip "$1")
  openstack floating ip list -f value -c "Floating IP Address" -c "Fixed IP Address" | awk -v f="$fixed" '$2 == f {print $1; exit}'
}
