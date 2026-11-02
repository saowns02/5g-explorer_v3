#!/usr/bin/env bash
# Runs ON the web VM (as root), called by deploy.sh.
# Publishes the frontend and proxies /api to every API node (round robin).
set -euo pipefail
: "${API_UPSTREAMS:?}" "${API_PORT:?}"
WEB=/var/www/5g-explorer

rm -rf "$WEB.new" && mkdir -p "$WEB.new"
tar -xzf /tmp/dist.tar.gz -C "$WEB.new"
rm -rf "$WEB.old"; [[ -d $WEB ]] && mv "$WEB" "$WEB.old"
mv "$WEB.new" "$WEB"

SERVERS=""
for ip in $API_UPSTREAMS; do SERVERS+="    server $ip:$API_PORT max_fails=2 fail_timeout=5s;"$'\n'; done

cat > /etc/nginx/sites-available/5g-explorer <<CONF
upstream fiveg_api {
$SERVERS    keepalive 16;
}

server {
    listen 80 default_server;
    server_name _;
    root $WEB;
    index index.html;

    gzip on;
    gzip_types application/json application/javascript text/css;

    location /api/ {
        proxy_pass http://fiveg_api/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
CONF
ln -sf /etc/nginx/sites-available/5g-explorer /etc/nginx/sites-enabled/5g-explorer
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx
echo "web tier serving $(find "$WEB" -type f | wc -l) files, upstreams: $API_UPSTREAMS"
