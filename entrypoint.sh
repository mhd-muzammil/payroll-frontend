#!/bin/sh
set -eu

BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-}"
BACKEND_UPSTREAM="${BACKEND_UPSTREAM%/}"

case "$BACKEND_UPSTREAM" in
    http://*|https://*) ;;
    *)
        echo "ERROR: BACKEND_UPSTREAM must be an http:// or https:// URL." >&2
        exit 1
        ;;
esac

export BACKEND_UPSTREAM

envsubst '${BACKEND_UPSTREAM}' \
    < /etc/nginx/nginx.conf.template \
    > /tmp/nginx/nginx.conf

nginx -t -c /tmp/nginx/nginx.conf
exec nginx -c /tmp/nginx/nginx.conf -g "daemon off;"
