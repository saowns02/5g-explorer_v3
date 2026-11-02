# KPI measurements (Task 3)

Same commit, same dataset, same client laptop, one environment running at a time. Warm up first, then 3 to 5 recorded runs; `summarise.py` gives mean and standard deviation.

| KPI | How | Script |
|-----|-----|--------|
| API latency p50 and p95, throughput | Locust user journey across every endpoint | `run_load.sh <env> <api url>` |
| CPU and memory under load | `vmstat` on the host (and inside each VM for OpenStack) during the load test | `vmstat.sh <env> <seconds>` |
| Spatial query time | `EXPLAIN ANALYZE` inside PostgreSQL, 10 runs per query | `query_timing.py <env>` |
| Provisioning time | Zero to healthy | `deploy/native/setup.sh` and `deploy/openstack/provision.sh` print it |
| Recovery after DB failure | Delete DB VM, relaunch, reattach volume | `deploy/openstack/recover-db.sh` |
| Scaling effort | Add a second API node | `deploy/openstack/scale-api.sh` |
| Exposed ports | `nmap` from the laptop | `ports.sh <env> <address>` |

## A full round

```bash
pip install locust            # on the client laptop, inside .venv

# Native (DevStack stopped on the host: sudo systemctl stop 'devstack@*')
./kpi/vmstat.sh native 1200                                # on the host
./kpi/run_load.sh native http://<host-lan-ip>:8080/api     # on the laptop
DATABASE_URL=... python kpi/query_timing.py native         # on the host
./kpi/ports.sh native <host-lan-ip>                        # on the laptop

# OpenStack (native services stopped: sudo systemctl stop fiveg-api nginx postgresql)
./kpi/vmstat.sh openstack 1200
./kpi/run_load.sh openstack http://<floating-ip>/api
./kpi/ports.sh openstack <floating-ip>
./deploy/openstack/recover-db.sh
./deploy/openstack/scale-api.sh

python kpi/summarise.py       # table for the slides, also results/summary.csv
git add results && git commit -m "KPI results <date>"
```

Defaults: 50 users, spawn rate 10/s, 3 minutes per run, 5 runs, 2-minute warm-up. Override with `USERS=100 DURATION=5m ./kpi/run_load.sh ...`. Agree the numbers at the KPI meeting and keep them the same for both environments.
