const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class LogService {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.requestLogs = [];
        this.maxLogsInMemory = 1000;
        this.flushInterval = 30000; // 30 saniye
    }

    async initialize() {
        try {
            // Logs dizinini oluştur
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }

            // Periyodik flush
            setInterval(() => {
                this.flushLogsToDisk();
            }, this.flushInterval);

            logger.info('Log service initialized');
        } catch (error) {
            logger.error('Failed to initialize log service:', error);
            throw error;
        }
    }

    async logRequest(requestData) {
        try {
            const logEntry = {
                timestamp: requestData.timestamp || new Date(),
                requestId: requestData.requestId,
                ip: requestData.ip,
                userAgent: requestData.userAgent,
                method: requestData.method,
                url: requestData.url,
                analysis: requestData.analysis,
                blocked: requestData.analysis.isBlocked,
                riskScore: requestData.analysis.riskScore,
                reason: requestData.analysis.reason
            };

            // Memory'ye ekle
            this.requestLogs.push(logEntry);

            // Memory limitini kontrol et
            if (this.requestLogs.length >= this.maxLogsInMemory) {
                await this.flushLogsToDisk();
            }

            // Bloklanmış istekleri ayrı logla
            if (logEntry.blocked) {
                logger.warn(`BLOCKED REQUEST: ${logEntry.ip} - ${logEntry.reason} (Risk: ${logEntry.riskScore})`);
            }

        } catch (error) {
            logger.error('Failed to log request:', error);
        }
    }

    async flushLogsToDisk() {
        if (this.requestLogs.length === 0) return;

        try {
            const today = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.logDir, `requests-${today}.json`);
            
            // Mevcut logs'u oku
            let existingLogs = [];
            if (fs.existsSync(logFile)) {
                try {
                    const content = fs.readFileSync(logFile, 'utf8');
                    existingLogs = JSON.parse(content);
                } catch (error) {
                    logger.warn('Could not parse existing log file:', error);
                }
            }

            // Yeni logs'u ekle
            existingLogs.push(...this.requestLogs);

            // Dosyaya yaz
            fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2));
            
            logger.debug(`Flushed ${this.requestLogs.length} logs to ${logFile}`);
            
            // Memory'yi temizle
            this.requestLogs = [];

        } catch (error) {
            logger.error('Failed to flush logs to disk:', error);
        }
    }

    async getRecentLogs(limit = 100) {
        try {
            // Memory'deki logs + disk'teki son logs
            const recentFromMemory = [...this.requestLogs].slice(-limit);
            
            // Bugünkü dosyadan da oku
            const today = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.logDir, `requests-${today}.json`);
            
            let recentFromDisk = [];
            if (fs.existsSync(logFile)) {
                try {
                    const content = fs.readFileSync(logFile, 'utf8');
                    const allLogs = JSON.parse(content);
                    recentFromDisk = allLogs.slice(-limit);
                } catch (error) {
                    logger.warn('Could not read log file:', error);
                }
            }

            // Birleştir ve tarih sırala
            const combined = [...recentFromDisk, ...recentFromMemory]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);

            return combined;

        } catch (error) {
            logger.error('Failed to get recent logs:', error);
            return [];
        }
    }

    async getStats() {
        try {
            const recentLogs = await this.getRecentLogs(1000);
            
            const stats = {
                totalRequests: recentLogs.length,
                blockedRequests: recentLogs.filter(log => log.blocked).length,
                allowedRequests: recentLogs.filter(log => !log.blocked).length,
                avgRiskScore: 0,
                topBlockReasons: {},
                topCountries: {},
                lastHour: {
                    total: 0,
                    blocked: 0
                }
            };

            if (recentLogs.length > 0) {
                // Ortalama risk skoru
                stats.avgRiskScore = recentLogs.reduce((sum, log) => sum + log.riskScore, 0) / recentLogs.length;

                // Top block reasons
                recentLogs.filter(log => log.blocked).forEach(log => {
                    stats.topBlockReasons[log.reason] = (stats.topBlockReasons[log.reason] || 0) + 1;
                });

                // Top countries
                recentLogs.forEach(log => {
                    const country = log.analysis?.details?.country || 'Unknown';
                    stats.topCountries[country] = (stats.topCountries[country] || 0) + 1;
                });

                // Son 1 saat
                const oneHourAgo = new Date(Date.now() - 3600000);
                const lastHourLogs = recentLogs.filter(log => new Date(log.timestamp) > oneHourAgo);
                stats.lastHour.total = lastHourLogs.length;
                stats.lastHour.blocked = lastHourLogs.filter(log => log.blocked).length;
            }

            return stats;

        } catch (error) {
            logger.error('Failed to get stats:', error);
            return null;
        }
    }
}

module.exports = new LogService();
