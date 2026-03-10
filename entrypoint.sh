#!/bin/sh
set -e

# Discover DNS resolver from /etc/resolv.conf
export DNS_RESOLVER=$(grep nameserver /etc/resolv.conf | awk '{print $2}' | head -n 1)
if [ -z "$DNS_RESOLVER" ]; then
    echo "Warning: DNS resolver not found in /etc/resolv.conf, defaulting to kube-dns"
    export DNS_RESOLVER="10.96.0.10"
fi
echo "Discovered DNS resolver: $DNS_RESOLVER"

# Replace KEYCLOAK_URL in index.html
if [ -n "$KEYCLOAK_URL" ]; then
    echo "Injecting KEYCLOAK_URL: $KEYCLOAK_URL"
    # Escape special characters for sed
    ESCAPED_URL=$(echo "$KEYCLOAK_URL" | sed 's/[&/\]/\\&/g')
    sed -i "s|\${KEYCLOAK_URL}|$ESCAPED_URL|g" /usr/share/nginx/html/index.html
else
    echo "Warning: KEYCLOAK_URL environment variable is not set"
fi

# Run the original Nginx entrypoint
echo "Starting Nginx..."
exec /docker-entrypoint.sh nginx -g 'daemon off;'
