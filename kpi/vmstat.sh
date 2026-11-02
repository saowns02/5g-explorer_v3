#!/usr/bin/env bash
# KPI: CPU and memory use under load. Run ON THE HOST while run_load.sh runs
# from the client laptop (start it a few seconds before the load test).
#
#   ./kpi/vmstat.sh native 900          # sample every second for 15 minutes
#   ./kpi/vmstat.sh openstack 900
#
# For OpenStack, also run it inside each VM to see per-tier use:
#   ssh -J ubuntu@<web-fip> ubuntu@<api-ip> 'vmstat -n -t 1 900' > results/openstack/<date>-vmstat-api.txt
set -euo pipefail
ENV_NAME=${1:?Usage: vmstat.sh <native|openstack> <seconds>}
SECONDS_TO_RUN=${2:-900}
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_DIR/results/$ENV_NAME/$(date +%F-%H%M)-vmstat-host.txt"
mkdir -p "$(dirname "$OUT")"
{
  echo "# environment=$ENV_NAME host=$(hostname) cpus=$(nproc) mem=$(free -m | awk '/Mem:/ {print $2}')MB commit=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null)"
  vmstat -n -t 1 "$SECONDS_TO_RUN"
} | tee "$OUT"
echo "Saved $OUT"
