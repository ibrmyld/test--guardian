/**
 * JSONL Logger with File Rotation
 * Production-grade logging for Guardian
 */

const fs = require('fs');
const path = require('path');

class JSONLLogger {
    constructor(options = {}) {
        this.logFile = options.file || path.join(__dirname, '../../logs/guardian.jsonl');
        this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB
        this.maxFiles = options.maxFiles || 10;
        
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    log(event, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event,
            ...data
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            // Check file size and rotate if needed
            if (this.shouldRotate()) {
                this.rotateLog();
            }

            fs.appendFileSync(this.logFile, logLine);
        } catch (error) {
            console.error('Failed to write log:', error);
        }
    }

    shouldRotate() {
        try {
            const stats = fs.statSync(this.logFile);
            return stats.size >= this.maxSize;
        } catch (error) {
            return false; // File doesn't exist yet
        }
    }

    rotateLog() {
        try {
            // Move current log to .1, .2, etc.
            for (let i = this.maxFiles - 1; i >= 1; i--) {
                const oldFile = `${this.logFile}.${i}`;
                const newFile = `${this.logFile}.${i + 1}`;
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // Delete oldest
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }
            
            // Move current log to .1
            if (fs.existsSync(this.logFile)) {
                fs.renameSync(this.logFile, `${this.logFile}.1`);
            }
            
        } catch (error) {
            console.error('Log rotation failed:', error);
        }
    }

    // Guardian-specific log methods
    logRequest(ip, userAgent, result) {
        this.log('request', {
            ip,
            userAgent: userAgent?.substring(0, 200), // Truncate
            blocked: result.isBlocked,
            reason: result.reason,
            riskScore: result.riskScore,
            country: result.details?.country
        });
    }

    logBlock(ip, reason, riskScore) {
        this.log('block', {
            ip,
            reason,
            riskScore,
            severity: 'high'
        });
    }

    logError(error, context = {}) {
        this.log('error', {
            message: error.message,
            stack: error.stack,
            ...context
        });
    }

    logStartup(config) {
        this.log('startup', {
            version: '1.0.0',
            nodeVersion: process.version,
            platform: process.platform,
            config: {
                blockVpnTor: config.blockVpnTor,
                strictMode: config.strictMode,
                port: config.port
            }
        });
    }

    logListUpdate(type, count) {
        this.log('list_update', {
            type, // 'tor_nodes' | 'vpn_ranges' | 'asn_database'
            count,
            success: true
        });
    }
}

module.exports = new JSONLLogger({
    file: process.env.LOG_FILE || path.join(__dirname, '../../logs/guardian.jsonl'),
    maxSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 10
});
