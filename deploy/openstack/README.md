# OpenStack deployment

Scripts for Tasks 1 to 3, run on the host machine that has DevStack. Each one prints what it did and, where it is a KPI, how long it took. Settings live in `config.env`.

| Script | Brief requirement | Run as |
|--------|-------------------|--------|
| `keystone.sh team.csv` | Tenants, users and user-to-tenant associations | DevStack admin |
| `image.sh` | Deploy a custom image (Ubuntu 24.04 with every package pre-installed) | DevStack admin |
| `provision.sh` | Configure the network and provision storage; three-tier VMs; deploys the app | 5g-prod |
| `deploy.sh` | Deploy the current commit (used by Jenkins) | 5g-prod |
| `recover-db.sh` | KPI: recovery time after a DB failure | 5g-prod |
| `scale-api.sh` | KPI: scaling effort, a second API node behind Nginx | 5g-prod |
| `teardown.sh` | Remove everything to time provisioning again | 5g-prod |

## Order on a fresh DevStack

```bash
# 0. On the host, as the user that will run Jenkins later (or set SECRETS_DIR to a shared folder)
sudo apt install -y libguestfs-tools git python3-openstackclient
export SECRETS_DIR=/opt/5g-explorer-ops INVENTORY=/opt/5g-explorer-ops/inventory.env SSH_KEY=/opt/5g-explorer-ops/5g-explorer
sudo mkdir -p $SECRETS_DIR && sudo chown $USER $SECRETS_DIR

# 1. Tenants and users (edit team.csv first: cp team.csv.example team.csv)
source ~/devstack/openrc admin admin
./deploy/openstack/keystone.sh deploy/openstack/team.csv

# 2. Custom image (10 to 20 minutes)
./deploy/openstack/image.sh

# 3. Everything else, timed: networks, security groups, volume, VMs, app
source $SECRETS_DIR/openrc-5g-prod
cd frontend && npm ci && VITE_API_URL=/api npm run build && cd ..
./deploy/openstack/provision.sh
```

`provision.sh` ends with the app's address (`http://<floating ip>`) and the provisioning time. To reach the floating IP from a laptop, see the runbook (Tailscale subnet route or a static route through the host).

## What it builds

| Tier | VM | Network | Security group | Flavour |
|------|----|---------|----------------|---------|
| Web (Nginx + React build) | `5g-web` | `5g-web-net` 10.0.1.0/24, floating IP | 80, 443, 22 from anywhere | 1 vCPU, 1 GB |
| API (FastAPI, 2 workers) | `5g-api` | `5g-app-net` 10.0.2.0/24, no floating IP | 8000 and 22 from `sg-web` only | 2 vCPU, 2 GB |
| DB (PostgreSQL 16 + PostGIS) | `5g-db` | `5g-app-net`, no floating IP | 5432 from `sg-api` only, 22 from `sg-web` | 2 vCPU, 4 GB |

The DB's data directory lives on the Cinder volume `5g-pgdata` (10 GB) at `/mnt/pgdata`, mounted by UUID with `nofail`. Deleting the DB VM keeps the data; `recover-db.sh` proves it.

## Demo evidence (screenshots for the slides)

| Requirement | Show |
|-------------|------|
| Tenants and users | `openstack role assignment list --names`, Horizon Identity pages, a reader user unable to create a VM |
| Custom image | `openstack image show 5g-explorer-ubuntu-24.04`, `/etc/5g-explorer-image` inside a VM |
| Network | Horizon Network Topology view, `openstack security group rule list 5g-sg-db` |
| Storage | `openstack volume list`, `df -h /mnt/pgdata` on the DB VM |
| CI/CD | Jenkins stage view: one green run, one run stopped by a failing test |

## Secrets

Nothing secret is in Git. `keystone.sh` writes passwords and the openrc to `SECRETS_DIR`; `deploy.sh` creates the DB password there on first run. Back that folder up.
