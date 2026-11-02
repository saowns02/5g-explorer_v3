#!/usr/bin/env bash
# KPI: API latency (p50, p95) and throughput, repeated runs after a warm-up.
#
#   ./kpi/run_load.sh native    http://192.168.1.50:8080/api
#   ./kpi/run_load.sh openstack http://172.24.4.10/api
#
# Run from the SAME client laptop for both environments, with only the
# environment under test running on the host. Settings (override with env vars):
#   USERS=50  SPAWN=10  DURATION=3m  RUNS=5  WARMUP=2m
# Each run writes Locust's CSVs to results/<env>/<date>-load-run<N>_*.csv
# plus a .meta file with the commit and settings. Then run kpi/summarise.py.
set -euo pipefail
ENV_NAME=${1:?Usage: run_load.sh <native|openstack> <api base url>}
TARGET=${2:?Usage: run_load.sh <native|openstack> <api base url>}
USERS=${USERS:-50}
SPAWN=${SPAWN:-10}
DURATION=${DURATION:-3m}
RUNS=${RUNS:-5}
WARMUP=${WARMUP:-2m}

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_DIR/results/$ENV_NAME"
mkdir -p "$OUT_DIR"
COMMIT=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)
DAY=$(date +%F)

curl -fsS "$TARGET/health" >/dev/null || { echo "No API at $TARGET/health" >&2; exit 1; }
echo "Target $TARGET is up. Client commit $COMMIT."

if [[ $WARMUP != 0 ]]; then
  echo "Warm-up for $WARMUP (not recorded)"
  locust -f "$REPO_DIR/kpi/locustfile.py" --host "$TARGET" --headless -u "$USERS" -r "$SPAWN" -t "$WARMUP" \
    --only-summary --loglevel WARNING >/dev/null 2>&1 || true
fi

for n in $(seq 1 "$RUNS"); do
  prefix="$OUT_DIR/$DAY-load-run$n"
  echo "Run $n of $RUNS: $USERS users for $DURATION"
  locust -f "$REPO_DIR/kpi/locustfile.py" --host "$TARGET" --headless -u "$USERS" -r "$SPAWN" -t "$DURATION" \
    --csv "$prefix" --only-summary --loglevel WARNING
  cat > "$prefix.meta" <<META
date=$(date -u +%FT%TZ)
environment=$ENV_NAME
target=$TARGET
commit=$COMMIT
users=$USERS
spawn_rate=$SPAWN
duration=$DURATION
client=$(hostname)
META
  sleep 20  # let the system settle between runs
done
echo "Done. Summarise with: python kpi/summarise.py"
