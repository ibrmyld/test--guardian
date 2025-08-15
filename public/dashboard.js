// Raliux Web Guardian Dashboard JavaScript
class Dashboard {
    constructor() {
        this.refreshInterval = 5000; // 5 saniye
        this.isLoading = false;
        this.credentials = null;
        this.init();
    }

    init() {
        this.setupAuth();
        this.loadInitialData();
        this.startAutoRefresh();
    }

    setupAuth() {
        // Basic auth için credentials iste
        const username = prompt('Dashboard Username:') || 'admin';
        const password = prompt('Dashboard Password:') || 'guardian123';
        
        this.credentials = btoa(`${username}:${password}`);
    }

    async makeRequest(url, options = {}) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Authorization': `Basic ${this.credentials}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (response.status === 401) {
                this.showToast('Authentication failed', 'error');
                this.setupAuth();
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Request failed:', error);
            this.showToast('Network error occurred', 'error');
            return null;
        }
    }

    async loadInitialData() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            await Promise.all([
                this.loadStats(),
                this.loadLogs()
            ]);
        } catch (error) {
            console.error('Failed to load initial data:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async loadStats() {
        const response = await this.makeRequest('/dashboard/api/stats');
        if (!response || !response.success) return;

        const { requests, cache, tor, uptime, memory } = response.data;

        // Request stats
        document.getElementById('totalRequests').textContent = requests.totalRequests.toLocaleString();
        document.getElementById('blockedRequests').textContent = requests.blockedRequests.toLocaleString();
        document.getElementById('allowedRequests').textContent = requests.allowedRequests.toLocaleString();
        document.getElementById('avgRiskScore').textContent = Math.round(requests.avgRiskScore);

        // System stats
        document.getElementById('uptime').textContent = this.formatUptime(uptime);
        document.getElementById('memoryUsage').textContent = this.formatMemory(memory.used);
        document.getElementById('cacheHitRate').textContent = `${Math.round(cache.hitRate * 100)}%`;
        document.getElementById('torExitNodes').textContent = tor.exitNodeCount.toLocaleString();

        // Block reasons
        this.updateBlockReasons(requests.topBlockReasons);
        
        // Top countries
        this.updateTopCountries(requests.topCountries);
    }

    async loadLogs() {
        const response = await this.makeRequest('/dashboard/api/logs?limit=50');
        if (!response || !response.success) return;

        this.updateLogsTable(response.data);
    }

    updateLogsTable(logs) {
        const tbody = document.getElementById('logsTableBody');
        tbody.innerHTML = '';

        logs.forEach(log => {
            const row = document.createElement('tr');
            
            const time = new Date(log.timestamp).toLocaleTimeString();
            const country = log.analysis?.details?.country || '-';
            const riskScore = log.riskScore || 0;
            const status = log.blocked ? 'BLOCKED' : 'ALLOWED';
            const reason = log.reason || '-';

            row.innerHTML = `
                <td>${time}</td>
                <td title="${log.ip}">${this.truncateIP(log.ip)}</td>
                <td>${country}</td>
                <td><span class="risk-score ${this.getRiskClass(riskScore)}">${riskScore}</span></td>
                <td><span class="status-badge ${log.blocked ? 'status-blocked' : 'status-allowed'}">${status}</span></td>
                <td>${reason}</td>
            `;

            tbody.appendChild(row);
        });
    }

    updateBlockReasons(reasons) {
        const container = document.getElementById('blockReasons');
        container.innerHTML = '';

        const sorted = Object.entries(reasons)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        sorted.forEach(([reason, count]) => {
            const item = document.createElement('div');
            item.className = 'reason-item';
            item.innerHTML = `
                <span class="reason-name">${this.formatReason(reason)}</span>
                <span class="reason-count">${count}</span>
            `;
            container.appendChild(item);
        });

        if (sorted.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No blocked requests</p>';
        }
    }

    updateTopCountries(countries) {
        const container = document.getElementById('topCountries');
        container.innerHTML = '';

        const sorted = Object.entries(countries)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        sorted.forEach(([country, count]) => {
            const item = document.createElement('div');
            item.className = 'country-item';
            item.innerHTML = `
                <span class="country-name">${this.getCountryName(country)}</span>
                <span class="country-count">${count}</span>
            `;
            container.appendChild(item);
        });

        if (sorted.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No data available</p>';
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            if (!this.isLoading) {
                this.loadInitialData();
            }
        }, this.refreshInterval);
    }

    // Utility functions
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    formatMemory(bytes) {
        const mb = bytes / 1024 / 1024;
        return `${Math.round(mb)} MB`;
    }

    truncateIP(ip) {
        return ip.length > 15 ? ip.substring(0, 12) + '...' : ip;
    }

    getRiskClass(score) {
        if (score >= 70) return 'risk-high';
        if (score >= 40) return 'risk-medium';
        return 'risk-low';
    }

    formatReason(reason) {
        const reasons = {
            'TOR_EXIT_NODE': 'Tor Exit Node',
            'VPN_PROXY_DETECTED': 'VPN/Proxy',
            'BAD_IP_REPUTATION': 'Bad Reputation',
            'HIGH_RISK_SCORE': 'High Risk Score',
            'ANALYSIS_ERROR': 'Analysis Error'
        };
        return reasons[reason] || reason;
    }

    getCountryName(code) {
        const countries = {
            'US': 'United States',
            'CN': 'China',
            'RU': 'Russia',
            'DE': 'Germany',
            'TR': 'Turkey',
            'FR': 'France',
            'GB': 'United Kingdom',
            'Unknown': 'Unknown'
        };
        return countries[code] || code;
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }
}

// Global functions for buttons
async function clearCache() {
    const dashboard = window.dashboardInstance;
    const response = await dashboard.makeRequest('/dashboard/api/cache/clear', {
        method: 'POST'
    });
    
    if (response && response.success) {
        dashboard.showToast('Cache cleared successfully');
    } else {
        dashboard.showToast('Failed to clear cache', 'error');
    }
}

async function updateTorNodes() {
    const dashboard = window.dashboardInstance;
    const response = await dashboard.makeRequest('/dashboard/api/tor/update', {
        method: 'POST'
    });
    
    if (response && response.success) {
        dashboard.showToast('Tor nodes updated successfully');
        dashboard.loadStats(); // Refresh stats
    } else {
        dashboard.showToast('Failed to update Tor nodes', 'error');
    }
}

function refreshLogs() {
    window.dashboardInstance.loadLogs();
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardInstance = new Dashboard();
});
