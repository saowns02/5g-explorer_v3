#!/usr/bin/env bash
# KPI: exposed ports, scanned from OUTSIDE (the client laptop).
#
#   ./kpi/ports.sh native    192.168.1.50     # the host's LAN address
#   ./kpi/ports.sh openstack 172.24.4.10      # the web VM's floating IP
#
# Expected: OpenStack shows only 22, 80 (and 443 if used); the API (8000) and
# PostgreSQL (5432) are unreachable. Natively, whatever the host exposes shows.
set -euo pipefail
ENV_NAME=${1:?Usage: ports.sh <native|openstack> <address>}
ADDR=${2:?Usage: ports.sh <native|openstack> <address>}
command -v nmap >/dev/null || { echo "Install nmap first (brew install nmap / sudo apt install nmap)" >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_DIR/results/$ENV_NAME/$(date +%F)-ports.txt"
mkdir -p "$(dirname "$OUT")"

nmap -Pn -sT -p 1-10000 --open "$ADDR" | tee "$OUT"
OPEN=$(grep -E '^[0-9]+/tcp +open' "$OUT" | cut -d/ -f1 | paste -sd' ' -)
echo
echo "Open ports on $ADDR ($ENV_NAME): ${OPEN:-none}"
for p in 5432 8000; do
  [[ " $OPEN " == *" $p "* ]] && echo "WARNING: port $p is reachable from outside"
done
echo "Saved $OUT"
