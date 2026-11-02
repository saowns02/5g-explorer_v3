#!/usr/bin/env bash
# Runs ON the DB VM (as root), called by deploy.sh.
# Mounts the Cinder volume, keeps PostgreSQL's data directory on it, allows
# connections from the app subnet only, and loads the data when asked or
# when the database is empty. A replacement VM that gets the same volume
# reattached starts with the data intact (the recovery KPI).
set -euo pipefail
: "${DB_PASS:?}" "${APP_CIDR:?}" "${PGDATA_MOUNT:?}" "${DB_NAME:?}" "${DB_USER:?}" "${VOLUME_ID:?}"
RELOAD=${RELOAD:-0}
PG_VER=16
PG_CONF=/etc/postgresql/$PG_VER/main
DATA_DIR=$PGDATA_MOUNT/$PG_VER/main

# ---------- Cinder volume ----------
# Virtio exposes the first 20 characters of the volume id as the disk serial.
DEV=/dev/disk/by-id/virtio-${VOLUME_ID:0:20}
for _ in $(seq 1 30); do [[ -e $DEV ]] && break; sleep 2; done
[[ -e $DEV ]] || DEV=/dev/vdb
[[ -e $DEV ]] || { echo "Cinder volume not attached" >&2; exit 1; }

if ! blkid "$DEV" >/dev/null 2>&1; then
  echo "Formatting new volume $DEV"
  mkfs.ext4 -q -L pgdata "$DEV"
fi
UUID=$(blkid -s UUID -o value "$DEV")
mkdir -p "$PGDATA_MOUNT"
# By UUID with nofail, so a reboot remounts it and a missing volume
# doesn't stop the VM booting (a known troubleshooting case).
grep -q "$UUID" /etc/fstab || echo "UUID=$UUID $PGDATA_MOUNT ext4 defaults,nofail 0 2" >> /etc/fstab
mountpoint -q "$PGDATA_MOUNT" || mount "$PGDATA_MOUNT"

# ---------- data directory on the volume ----------
if [[ ! -f $DATA_DIR/PG_VERSION ]]; then
  echo "Moving the PostgreSQL data directory onto the volume"
  systemctl stop postgresql || true
  mkdir -p "$DATA_DIR"
  rsync -a /var/lib/postgresql/$PG_VER/main/ "$DATA_DIR/"
else
  echo "Existing data found on the volume; reusing it"
  systemctl stop postgresql || true
fi
chown -R postgres:postgres "$PGDATA_MOUNT/$PG_VER"
chmod 700 "$DATA_DIR"

sed -i "s|^\s*#\?\s*data_directory\s*=.*|data_directory = '$DATA_DIR'|" "$PG_CONF/postgresql.conf"
sed -i "s|^\s*#\?\s*listen_addresses\s*=.*|listen_addresses = '*'|" "$PG_CONF/postgresql.conf"
grep -q "5g-explorer app subnet" "$PG_CONF/pg_hba.conf" || \
  echo "host  $DB_NAME  $DB_USER  $APP_CIDR  scram-sha-256  # 5g-explorer app subnet" >> "$PG_CONF/pg_hba.conf"

systemctl enable postgresql
systemctl start postgresql
for _ in $(seq 1 30); do sudo -u postgres pg_isready -q && break; sleep 1; done

# ---------- role, database, extensions ----------
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE $DB_USER PASSWORD '$DB_PASS';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
sudo -u postgres psql -q -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# ---------- data ----------
HAS_DATA=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT to_regclass('public.places') IS NOT NULL")
if [[ $RELOAD == 1 || $HAS_DATA != t ]]; then
  echo "Loading the dataset"
  rm -rf /opt/5g-explorer/release && mkdir -p /opt/5g-explorer/release
  tar -xzf /tmp/release.tar.gz -C /opt/5g-explorer/release
  DATABASE_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME" \
    /opt/5g-explorer/venv/bin/python /opt/5g-explorer/release/db/load.py /opt/5g-explorer/release/data/5g_coverage_clean.csv
else
  echo "Data already loaded: $(sudo -u postgres psql -d "$DB_NAME" -tAc 'SELECT count(*) FROM locations') rows"
fi
