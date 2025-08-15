#!/bin/bash

# Raliux Guardian - Production Install Script
set -e

echo "🛡️ Raliux Guardian Production Installer"
echo "======================================="

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Please don't run as root. Use a regular user with sudo access."
    exit 1
fi

# Check LICENSE_KEY
if [ -z "$LICENSE_KEY" ]; then
    echo "❌ LICENSE_KEY environment variable required!"
    echo "Usage: LICENSE_KEY=your_license_key ./scripts/install.sh"
    exit 1
fi

# Create guardian directory
GUARDIAN_DIR="/opt/guardian"
sudo mkdir -p "$GUARDIAN_DIR"
sudo chown $(whoami):$(whoami) "$GUARDIAN_DIR"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $(whoami)
    rm get-docker.sh
    echo "✅ Docker installed"
fi

# Create config file
cat > "$GUARDIAN_DIR/config.yml" << EOF
guardian:
  port: ${PORT:-9000}
  license_key: "$LICENSE_KEY"
  
security:
  block_vpn_tor: true
  strict_mode: false
  cors_enabled: false
  
logging:
  format: jsonl
  file: /app/logs/guardian.jsonl
  rotation: true
  max_size: 100MB
  max_files: 10

endpoints:
  health: true
  verify: true
  dashboard: false
  api: false
EOF

echo "✅ Config created at $GUARDIAN_DIR/config.yml"

# Pull and run Guardian container
echo "🚀 Starting Guardian container..."
docker pull raliux/guardian:latest

docker run -d \
    --name raliux-guardian \
    --restart unless-stopped \
    -p ${PORT:-9000}:9000 \
    -v "$GUARDIAN_DIR/config.yml:/app/guardian/config.yml:ro" \
    -v "$GUARDIAN_DIR/logs:/app/logs" \
    -e LICENSE_KEY="$LICENSE_KEY" \
    -e CFG_FILE="/app/guardian/config.yml" \
    -e PORT=9000 \
    raliux/guardian:latest

# Wait for startup
echo "⏳ Waiting for Guardian to start..."
sleep 5

# Health check
if curl -f -s http://localhost:${PORT:-9000}/health > /dev/null; then
    echo "✅ Guardian is running!"
    echo "🌐 Health check: http://localhost:${PORT:-9000}/health"
    echo "🔍 Verify endpoint: http://localhost:${PORT:-9000}/verify"
else
    echo "❌ Guardian failed to start. Check logs:"
    echo "docker logs raliux-guardian"
    exit 1
fi

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "Guardian URL: http://localhost:${PORT:-9000}"
echo "Config file: $GUARDIAN_DIR/config.yml"
echo "Logs: $GUARDIAN_DIR/logs/"
echo ""
echo "Next steps:"
echo "1. Test: curl http://localhost:${PORT:-9000}/verify?ip=1.2.3.4"
echo "2. Integrate with your backend"
echo "3. Check logs: tail -f $GUARDIAN_DIR/logs/guardian.jsonl"
