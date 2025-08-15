#!/bin/bash

# Raliux Guardian - Update Tor/ASN Lists Script
set -e

echo "🔄 Updating Guardian threat lists..."

CONTAINER_NAME="${1:-raliux-guardian}"

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ Guardian container '$CONTAINER_NAME' is not running"
    exit 1
fi

# Update Tor exit nodes
echo "📡 Updating Tor exit nodes..."
docker exec "$CONTAINER_NAME" curl -o /app/data/tor-exit-nodes.txt \
    https://check.torproject.org/torbulkexitlist

# Update VPN/Proxy ranges
echo "🔒 Updating VPN/Proxy IP ranges..."
docker exec "$CONTAINER_NAME" curl -o /app/data/vpn-ranges.txt \
    https://raw.githubusercontent.com/X4BNet/lists_vpn/main/ipv4.txt

# Update GeoLite2 ASN database (if MaxMind key available)
if [ ! -z "$MAXMIND_LICENSE_KEY" ]; then
    echo "🌍 Updating GeoLite2 ASN database..."
    docker exec "$CONTAINER_NAME" curl -o /app/data/GeoLite2-ASN.mmdb.gz \
        "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz"
    docker exec "$CONTAINER_NAME" gunzip -f /app/data/GeoLite2-ASN.mmdb.gz
fi

# Reload Guardian configuration
echo "🔄 Reloading Guardian configuration..."
docker exec "$CONTAINER_NAME" kill -HUP 1

# Verify update
echo "✅ Checking update status..."
RESPONSE=$(docker exec "$CONTAINER_NAME" curl -s http://localhost:9000/health)

if echo "$RESPONSE" | grep -q "healthy"; then
    echo "✅ Lists updated successfully!"
    echo "📊 Guardian stats:"
    echo "$RESPONSE" | jq '.stats' 2>/dev/null || echo "$RESPONSE"
else
    echo "❌ Update verification failed"
    exit 1
fi

echo ""
echo "🎉 Threat lists updated successfully!"
echo "📝 View logs: docker logs $CONTAINER_NAME --tail 20"
