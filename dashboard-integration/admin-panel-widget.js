/**
 * Raliux Guardian - Admin Panel Widget
 * Admin paneline entegre edilebilir widget komponenti
 */

class GuardianWidget {
    constructor(options = {}) {
        this.guardianUrl = options.guardianUrl || 'https://your-guardian-service.railway.app';
        this.container = options.container || 'guardian-widget';
        this.credentials = options.credentials || { username: 'admin', password: 'guardian123' };
        this.refreshInterval = options.refreshInterval || 30000; // 30 saniye
        this.theme = options.theme || 'dark';
        
        this.stats = null;
        this.isLoading = false;
        this.intervalId = null;
        
        this.init();
    }

    init() {
        this.createWidget();
        this.loadStats();
        this.startAutoRefresh();
        
        console.log('🛡️ Guardian Widget initialized');
    }

    createWidget() {
        const container = document.getElementById(this.container);
        if (!container) {
            console.error(`Container ${this.container} not found`);
            return;
        }

        container.innerHTML = `
            <div class="guardian-widget ${this.theme}">
                <div class="guardian-widget-header">
                    <h3><i class="fas fa-shield-alt"></i> Guardian Security</h3>
                    <div class="guardian-widget-actions">
                        <button class="guardian-btn-small" onclick="guardianWidget.refresh()">
                            <i class="fas fa-refresh"></i>
                        </button>
                        <button class="guardian-btn-small" onclick="guardianWidget.openDashboard()">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </div>
                
                <div class="guardian-widget-content">
                    <div class="guardian-loading" id="guardian-loading">
                        <i class="fas fa-spinner fa-spin"></i> Yükleniyor...
                    </div>
                    
                    <div class="guardian-stats" id="guardian-stats" style="display: none;">
                        <div class="guardian-stat-item">
                            <div class="guardian-stat-label">Total Requests</div>
                            <div class="guardian-stat-value" id="total-requests">-</div>
                        </div>
                        
                        <div class="guardian-stat-item danger">
                            <div class="guardian-stat-label">Blocked</div>
                            <div class="guardian-stat-value" id="blocked-requests">-</div>
                        </div>
                        
                        <div class="guardian-stat-item success">
                            <div class="guardian-stat-label">Allowed</div>
                            <div class="guardian-stat-value" id="allowed-requests">-</div>
                        </div>
                        
                        <div class="guardian-stat-item">
                            <div class="guardian-stat-label">Block Rate</div>
                            <div class="guardian-stat-value" id="block-rate">-</div>
                        </div>
                    </div>
                    
                    <div class="guardian-recent-blocks" id="recent-blocks">
                        <h4>Recent Blocks</h4>
                        <div class="guardian-block-list" id="block-list">
                            <!-- Recent blocks will be inserted here -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.injectStyles();
    }

    injectStyles() {
        if (document.getElementById('guardian-widget-styles')) return;

        const styles = `
            <style id="guardian-widget-styles">
                .guardian-widget {
                    background: linear-gradient(135deg, #1a1a1a, #0d0d0d);
                    border: 1px solid #00ff88;
                    border-radius: 8px;
                    padding: 1rem;
                    color: #ffffff;
                    font-family: 'Segoe UI', sans-serif;
                    box-shadow: 0 4px 15px rgba(0, 255, 136, 0.2);
                }

                .guardian-widget-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                    padding-bottom: 0.5rem;
                    border-bottom: 1px solid #333;
                }

                .guardian-widget-header h3 {
                    margin: 0;
                    color: #00ff88;
                    font-size: 1.1rem;
                    display: flex;
                    align-items: center;
                }

                .guardian-widget-header h3 i {
                    margin-right: 0.5rem;
                }

                .guardian-widget-actions {
                    display: flex;
                    gap: 0.5rem;
                }

                .guardian-btn-small {
                    background: #00ff88;
                    color: #0d0d0d;
                    border: none;
                    padding: 0.4rem 0.8rem;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    transition: all 0.3s ease;
                }

                .guardian-btn-small:hover {
                    background: #00cc6a;
                    transform: translateY(-1px);
                }

                .guardian-loading {
                    text-align: center;
                    padding: 2rem;
                    color: #00ff88;
                }

                .guardian-stats {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                    margin-bottom: 1rem;
                }

                .guardian-stat-item {
                    background: rgba(0, 255, 136, 0.1);
                    padding: 0.75rem;
                    border-radius: 6px;
                    border-left: 3px solid #00ff88;
                }

                .guardian-stat-item.danger {
                    border-left-color: #ff4444;
                    background: rgba(255, 68, 68, 0.1);
                }

                .guardian-stat-item.success {
                    border-left-color: #00ff88;
                    background: rgba(0, 255, 136, 0.1);
                }

                .guardian-stat-label {
                    font-size: 0.8rem;
                    color: #cccccc;
                    margin-bottom: 0.25rem;
                }

                .guardian-stat-value {
                    font-size: 1.2rem;
                    font-weight: bold;
                    color: #ffffff;
                }

                .guardian-recent-blocks h4 {
                    margin: 0 0 0.5rem 0;
                    color: #00ff88;
                    font-size: 1rem;
                }

                .guardian-block-list {
                    max-height: 200px;
                    overflow-y: auto;
                }

                .guardian-block-item {
                    background: rgba(255, 68, 68, 0.1);
                    border: 1px solid #ff4444;
                    border-radius: 4px;
                    padding: 0.5rem;
                    margin-bottom: 0.5rem;
                    font-size: 0.9rem;
                }

                .guardian-block-ip {
                    font-weight: bold;
                    color: #ff4444;
                }

                .guardian-block-reason {
                    color: #cccccc;
                    font-size: 0.8rem;
                }

                .guardian-block-time {
                    color: #888888;
                    font-size: 0.7rem;
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    async loadStats() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const response = await this.makeRequest('/dashboard/api/stats');
            if (response && response.success) {
                this.stats = response.data;
                this.updateUI();
            }
        } catch (error) {
            console.error('Guardian stats load error:', error);
            this.showError('Stats yüklenemedi');
        } finally {
            this.isLoading = false;
        }
    }

    async makeRequest(endpoint) {
        const auth = btoa(`${this.credentials.username}:${this.credentials.password}`);
        
        const response = await fetch(`${this.guardianUrl}${endpoint}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    updateUI() {
        if (!this.stats) return;

        const loading = document.getElementById('guardian-loading');
        const statsDiv = document.getElementById('guardian-stats');
        
        loading.style.display = 'none';
        statsDiv.style.display = 'grid';

        // Stats güncelle
        document.getElementById('total-requests').textContent = this.stats.requests.totalRequests.toLocaleString();
        document.getElementById('blocked-requests').textContent = this.stats.requests.blockedRequests.toLocaleString();
        document.getElementById('allowed-requests').textContent = this.stats.requests.allowedRequests.toLocaleString();
        
        const blockRate = this.stats.requests.totalRequests > 0 
            ? (this.stats.requests.blockedRequests / this.stats.requests.totalRequests * 100).toFixed(1) + '%'
            : '0%';
        document.getElementById('block-rate').textContent = blockRate;

        // Recent blocks yükle
        this.loadRecentBlocks();
    }

    async loadRecentBlocks() {
        try {
            const response = await this.makeRequest('/dashboard/api/logs?limit=5');
            if (response && response.success) {
                const blockedLogs = response.data.filter(log => log.blocked);
                this.updateBlockList(blockedLogs.slice(0, 3));
            }
        } catch (error) {
            console.error('Recent blocks load error:', error);
        }
    }

    updateBlockList(blocks) {
        const blockList = document.getElementById('block-list');
        
        if (blocks.length === 0) {
            blockList.innerHTML = '<p style="text-align: center; color: #888;">No recent blocks</p>';
            return;
        }

        blockList.innerHTML = blocks.map(block => `
            <div class="guardian-block-item">
                <div class="guardian-block-ip">${block.ip}</div>
                <div class="guardian-block-reason">${this.formatReason(block.reason)}</div>
                <div class="guardian-block-time">${new Date(block.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');
    }

    formatReason(reason) {
        const reasons = {
            'TOR_EXIT_NODE': 'Tor Exit Node',
            'VPN_PROXY_DETECTED': 'VPN/Proxy',
            'BAD_IP_REPUTATION': 'Bad Reputation',
            'HIGH_RISK_SCORE': 'High Risk Score'
        };
        return reasons[reason] || reason;
    }

    showError(message) {
        const loading = document.getElementById('guardian-loading');
        loading.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        loading.style.color = '#ff4444';
    }

    refresh() {
        const loading = document.getElementById('guardian-loading');
        const statsDiv = document.getElementById('guardian-stats');
        
        loading.style.display = 'block';
        statsDiv.style.display = 'none';
        
        this.loadStats();
    }

    openDashboard() {
        const url = `${this.guardianUrl}/dashboard`;
        window.open(url, '_blank');
    }

    startAutoRefresh() {
        this.intervalId = setInterval(() => {
            if (!this.isLoading) {
                this.loadStats();
            }
        }, this.refreshInterval);
    }

    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

// Global instance (isteğe bağlı)
let guardianWidget;

// Auto-initialize (eğer container varsa)
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('guardian-widget');
    if (container) {
        guardianWidget = new GuardianWidget({
            guardianUrl: window.GUARDIAN_URL || 'https://your-guardian-service.railway.app',
            credentials: window.GUARDIAN_CREDENTIALS || { username: 'admin', password: 'guardian123' }
        });
    }
});
