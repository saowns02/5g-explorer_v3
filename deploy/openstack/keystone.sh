#!/usr/bin/env bash
# Task 1: tenants, users and user-to-tenant associations.
#
#   source ~/devstack/openrc admin admin
#   ./deploy/openstack/keystone.sh deploy/openstack/team.csv
#
# team.csv (one line per person, no header):  username,role_in_prod,role_in_dev
#   e.g.  sab,admin,admin
#         alex,member,reader
# Roles: admin (full control), member (create and manage resources), reader (view only).
# Passwords are generated, saved under ~/.5g-explorer/passwords.txt and never committed.
# Also writes openrc files for the prod project, used by the other scripts.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli

TEAM_FILE=${1:?Usage: keystone.sh team.csv}
[[ -f $TEAM_FILE ]] || die "Missing $TEAM_FILE"
mkdir -p "$SECRETS_DIR" && chmod 700 "$SECRETS_DIR"
PASSWORDS="$SECRETS_DIR/passwords.txt"
touch "$PASSWORDS" && chmod 600 "$PASSWORDS"

log "Projects"
for p in "$PROD_PROJECT:Live 5G Globe Explorer deployment" "$DEV_PROJECT:Sandbox for testing changes"; do
  name=${p%%:*} desc=${p#*:}
  [[ -n $(os_id project "$name") ]] || openstack project create --domain default --description "$desc" "$name" >/dev/null
  echo "  $name"
done

for role in admin member reader; do
  [[ -n $(os_id role "$role") ]] || openstack role create "$role" >/dev/null
done

log "Users and role assignments"
while IFS=, read -r user prod_role dev_role; do
  [[ -z $user || $user == \#* ]] && continue
  if [[ -z $(os_id user "$user") ]]; then
    pass=$(openssl rand -base64 18)
    openstack user create --domain default --password "$pass" --project "$PROD_PROJECT" "$user" >/dev/null
    echo "$user $pass" >> "$PASSWORDS"
  fi
  [[ $prod_role != none ]] && openstack role add --user "$user" --project "$PROD_PROJECT" "$prod_role"
  [[ $dev_role != none ]] && openstack role add --user "$user" --project "$DEV_PROJECT" "$dev_role"
  echo "  $user: $PROD_PROJECT=$prod_role, $DEV_PROJECT=$dev_role"
done < "$TEAM_FILE"

# The admin account also works in prod, so the provisioning scripts can run as it.
openstack role add --user admin --project "$PROD_PROJECT" admin

log "Quotas for $PROD_PROJECT"
openstack quota set --instances 6 --cores 10 --ram 12288 --volumes 4 --gigabytes 40 --floating-ips 2 "$PROD_PROJECT"

log "openrc for $PROD_PROJECT (admin user)"
cat > "$SECRETS_DIR/openrc-$PROD_PROJECT" <<RC
export OS_AUTH_URL=$OS_AUTH_URL
export OS_IDENTITY_API_VERSION=3
export OS_USERNAME=${OS_USERNAME}
export OS_PASSWORD=${OS_PASSWORD}
export OS_PROJECT_NAME=$PROD_PROJECT
export OS_USER_DOMAIN_ID=default
export OS_PROJECT_DOMAIN_ID=default
export OS_REGION_NAME=${OS_REGION_NAME:-RegionOne}
RC
chmod 600 "$SECRETS_DIR/openrc-$PROD_PROJECT"
echo "  $SECRETS_DIR/openrc-$PROD_PROJECT"

log "Evidence: user-to-tenant associations"
openstack role assignment list --names -f table | grep -E "$PROD_PROJECT|$DEV_PROJECT|Role" || true
echo
echo "Passwords for new users are in $PASSWORDS. Share them in person or a password manager."
