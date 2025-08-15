#!/bin/bash

# Raliux Guardian - One-Click Enterprise Installation
# Professional deployment script for customers

set -e

echo "🛡️  RALIUX GUARDIAN ENTERPRISE INSTALLER"
echo "========================================"
echo "Version: 1.0 Enterprise Edition"
echo "Estimated time: 2-3 minutes"
echo ""

# Color codes for professional output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking system requirements..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed."
        echo "Please install Node.js 16+ and try again."
        echo "Download: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt "16" ]; then
        log_error "Node.js 16+ is required. Current version: $(node -v)"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is required but not installed."
        exit 1
    fi
    
    # Check available ports
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        log_warning "Port 3000 is already in use. Guardian will use port 3001."
        export GUARDIAN_PORT=3001
    else
        export GUARDIAN_PORT=3000
    fi
    
    log_success "System requirements check passed ✓"
}

# Install Guardian
install_guardian() {
    log_info "Installing Raliux Guardian Enterprise..."
    
    # Create installation directory
    INSTALL_DIR="/opt/raliux-guardian"
    if [ ! -d "$INSTALL_DIR" ]; then
        sudo mkdir -p "$INSTALL_DIR"
        sudo chown $(whoami):$(whoami) "$INSTALL_DIR"
    fi
    
    cd "$INSTALL_DIR"
    
    # Download and extract Guardian
    log_info "Downloading Guardian Enterprise package..."
    curl -L -o guardian-enterprise.tar.gz "https://releases.raliux.com/guardian/latest.tar.gz"
    tar -xzf guardian-enterprise.tar.gz
    rm guardian-enterprise.tar.gz
    
    # Install dependencies
    log_info "Installing dependencies..."
    npm ci --production --silent
    
    log_success "Guardian installed successfully ✓"
}

# Configure Guardian
configure_guardian() {
    log_info "Configuring Guardian Enterprise..."
    
    # Generate secure configuration
    cat > .env << EOF
# Raliux Guardian Enterprise Configuration
NODE_ENV=production
PORT=${GUARDIAN_PORT}

# Security Settings
BLOCK_VPN_TOR=true
STRICT_MODE=false
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=900000

# Enterprise Features
ENTERPRISE_MODE=true
MULTI_TENANT=true
API_RATE_LIMITING=true
ADVANCED_ANALYTICS=true

# Dashboard
DASHBOARD_ENABLED=true
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$(openssl rand -base64 12)

# Database (Production)
DATABASE_URL=sqlite:./data/guardian.db

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=30

# Generated License Key
LICENSE_KEY=$(uuidgen)
INSTALLATION_ID=$(uuidgen)
EOF

    # Create data directory
    mkdir -p data logs
    
    # Set proper permissions
    chmod 600 .env
    chmod -R 755 data logs
    
    log_success "Configuration completed ✓"
}

# Setup service
setup_service() {
    log_info "Setting up system service..."
    
    # Create systemd service
    sudo cat > /etc/systemd/system/raliux-guardian.service << EOF
[Unit]
Description=Raliux Guardian Enterprise
After=network.target
Wants=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${INSTALL_DIR}/data ${INSTALL_DIR}/logs

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable raliux-guardian
    
    log_success "System service configured ✓"
}

# Start Guardian
start_guardian() {
    log_info "Starting Raliux Guardian Enterprise..."
    
    sudo systemctl start raliux-guardian
    sleep 3
    
    # Check if service is running
    if sudo systemctl is-active --quiet raliux-guardian; then
        log_success "Guardian is running ✓"
    else
        log_error "Failed to start Guardian service"
        echo "Check logs: sudo journalctl -u raliux-guardian -f"
        exit 1
    fi
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    # Wait for service to fully start
    sleep 5
    
    # Check health endpoint
    HEALTH_URL="http://localhost:${GUARDIAN_PORT}/api/health"
    if curl -f -s "$HEALTH_URL" > /dev/null; then
        log_success "Health check passed ✓"
    else
        log_error "Health check failed"
        echo "Service may still be starting. Please wait a moment and check:"
        echo "curl $HEALTH_URL"
        exit 1
    fi
}

# Display completion info
show_completion_info() {
    DASHBOARD_PASSWORD=$(grep DASHBOARD_PASSWORD .env | cut -d'=' -f2)
    
    echo ""
    echo "🎉 INSTALLATION COMPLETED SUCCESSFULLY!"
    echo "======================================"
    echo ""
    echo "📊 Dashboard URL: http://localhost:${GUARDIAN_PORT}/dashboard"
    echo "👤 Username: admin"
    echo "🔒 Password: $DASHBOARD_PASSWORD"
    echo ""
    echo "🔧 API Endpoint: http://localhost:${GUARDIAN_PORT}/api"
    echo "📈 Health Check: http://localhost:${GUARDIAN_PORT}/api/health"
    echo ""
    echo "📁 Installation Directory: $INSTALL_DIR"
    echo "📋 Configuration File: $INSTALL_DIR/.env"
    echo "📜 Logs: sudo journalctl -u raliux-guardian -f"
    echo ""
    echo "🚀 Service Commands:"
    echo "   Start:   sudo systemctl start raliux-guardian"
    echo "   Stop:    sudo systemctl stop raliux-guardian"
    echo "   Restart: sudo systemctl restart raliux-guardian"
    echo "   Status:  sudo systemctl status raliux-guardian"
    echo ""
    echo "📖 Documentation: https://docs.raliux.com/guardian"
    echo "🆘 Support: support@raliux.com"
    echo ""
    echo "⚠️  IMPORTANT: Save your dashboard password securely!"
    echo ""
}

# Main installation flow
main() {
    echo "Starting Raliux Guardian Enterprise installation..."
    echo ""
    
    check_prerequisites
    install_guardian
    configure_guardian
    setup_service
    start_guardian
    health_check
    show_completion_info
    
    log_success "Raliux Guardian Enterprise is ready for production use!"
}

# Error handler
error_handler() {
    log_error "Installation failed on line $1"
    echo ""
    echo "Please contact support@raliux.com with the error details."
    echo "Include this information:"
    echo "- Operating System: $(uname -a)"
    echo "- Node.js Version: $(node -v)"
    echo "- Installation Directory: $PWD"
    exit 1
}

# Set error trap
trap 'error_handler $LINENO' ERR

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run this installer as root."
    echo "Run as a regular user with sudo privileges."
    exit 1
fi

# Run main installation
main "$@"
