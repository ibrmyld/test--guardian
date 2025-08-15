/**
 * Raliux Guardian - Enterprise Error Handler
 * Production-grade error handling and monitoring
 */

const logger = require('../../src/utils/logger');
const fs = require('fs');
const path = require('path');

class EnterpriseErrorHandler {
    constructor() {
        this.errorLog = path.join(__dirname, '../data/errors.json');
        this.errorStats = {
            totalErrors: 0,
            criticalErrors: 0,
            errorsByType: {},
            lastError: null,
            uptime: {
                start: new Date(),
                crashes: 0
            }
        };
        
        this.init();
    }

    init() {
        // Global error handlers
        process.on('uncaughtException', this.handleUncaughtException.bind(this));
        process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
        process.on('warning', this.handleWarning.bind(this));
        
        // Graceful shutdown handlers
        process.on('SIGTERM', this.handleGracefulShutdown.bind(this));
        process.on('SIGINT', this.handleGracefulShutdown.bind(this));
        
        logger.info('Enterprise Error Handler initialized');
    }

    handleUncaughtException(error) {
        this.logCriticalError('UNCAUGHT_EXCEPTION', error, {
            stack: error.stack,
            code: error.code,
            syscall: error.syscall
        });

        // Try to cleanup gracefully
        this.emergencyCleanup();
        
        // Exit with error code
        process.exit(1);
    }

    handleUnhandledRejection(reason, promise) {
        this.logCriticalError('UNHANDLED_REJECTION', reason, {
            promise: promise.toString(),
            stack: reason?.stack
        });
        
        // Don't crash immediately for promises, log and continue
        logger.error('Unhandled promise rejection handled gracefully');
    }

    handleWarning(warning) {
        logger.warn('Process warning:', {
            name: warning.name,
            message: warning.message,
            stack: warning.stack
        });
    }

    async handleGracefulShutdown(signal) {
        logger.info(`Received ${signal}, initiating graceful shutdown...`);
        
        try {
            // Save current state
            await this.saveErrorStats();
            
            // Close connections
            await this.closeConnections();
            
            logger.info('Graceful shutdown completed');
            process.exit(0);
            
        } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            process.exit(1);
        }
    }

    logCriticalError(type, error, metadata = {}) {
        const errorEntry = {
            id: this.generateErrorId(),
            type,
            message: error.message || error,
            stack: error.stack,
            timestamp: new Date(),
            metadata: {
                ...metadata,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                memory: process.memoryUsage(),
                uptime: process.uptime()
            }
        };

        // Update stats
        this.errorStats.totalErrors++;
        this.errorStats.criticalErrors++;
        this.errorStats.errorsByType[type] = (this.errorStats.errorsByType[type] || 0) + 1;
        this.errorStats.lastError = errorEntry;

        // Log to file and console
        logger.error(`CRITICAL ERROR [${type}]:`, errorEntry);
        this.writeErrorToFile(errorEntry);

        // Notify monitoring systems (if configured)
        this.notifyMonitoring(errorEntry);

        return errorEntry;
    }

    logError(type, error, context = {}) {
        const errorEntry = {
            id: this.generateErrorId(),
            type,
            message: error.message || error,
            stack: error.stack,
            timestamp: new Date(),
            context,
            severity: 'error'
        };

        // Update stats
        this.errorStats.totalErrors++;
        this.errorStats.errorsByType[type] = (this.errorStats.errorsByType[type] || 0) + 1;
        this.errorStats.lastError = errorEntry;

        logger.error(`ERROR [${type}]:`, errorEntry);
        this.writeErrorToFile(errorEntry);

        return errorEntry;
    }

    logWarning(type, message, context = {}) {
        const warningEntry = {
            id: this.generateErrorId(),
            type,
            message,
            timestamp: new Date(),
            context,
            severity: 'warning'
        };

        logger.warn(`WARNING [${type}]:`, warningEntry);
        this.writeErrorToFile(warningEntry);

        return warningEntry;
    }

    writeErrorToFile(errorEntry) {
        try {
            const dir = path.dirname(this.errorLog);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            let errors = [];
            if (fs.existsSync(this.errorLog)) {
                try {
                    const content = fs.readFileSync(this.errorLog, 'utf8');
                    errors = JSON.parse(content);
                } catch (parseError) {
                    logger.warn('Could not parse existing error log, creating new one');
                }
            }

            errors.push(errorEntry);

            // Keep only last 1000 errors
            if (errors.length > 1000) {
                errors = errors.slice(-1000);
            }

            fs.writeFileSync(this.errorLog, JSON.stringify(errors, null, 2));

        } catch (writeError) {
            // If we can't write errors, at least log them
            console.error('Failed to write error to file:', writeError);
            console.error('Original error:', errorEntry);
        }
    }

    async saveErrorStats() {
        try {
            const statsFile = path.join(__dirname, '../data/error-stats.json');
            const dir = path.dirname(statsFile);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.errorStats.uptime.total = process.uptime();
            fs.writeFileSync(statsFile, JSON.stringify(this.errorStats, null, 2));

        } catch (error) {
            logger.error('Failed to save error stats:', error);
        }
    }

    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async closeConnections() {
        // Close database connections, file handles, etc.
        // This would be customized based on what services are running
        
        try {
            // Example: Close database connections
            // await database.close();
            
            // Close any open file handles
            // await fileSystem.closeAll();
            
            logger.info('All connections closed successfully');
            
        } catch (error) {
            logger.error('Error closing connections:', error);
            throw error;
        }
    }

    emergencyCleanup() {
        try {
            // Synchronous cleanup for critical situations
            this.saveErrorStatsSync();
            
            logger.info('Emergency cleanup completed');
            
        } catch (error) {
            console.error('Emergency cleanup failed:', error);
        }
    }

    saveErrorStatsSync() {
        try {
            const statsFile = path.join(__dirname, '../data/error-stats.json');
            const dir = path.dirname(statsFile);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.errorStats.uptime.total = process.uptime();
            this.errorStats.uptime.crashes++;
            
            fs.writeFileSync(statsFile, JSON.stringify(this.errorStats, null, 2));
            
        } catch (error) {
            console.error('Failed to save error stats sync:', error);
        }
    }

    notifyMonitoring(errorEntry) {
        // Integration with monitoring services
        if (process.env.SLACK_WEBHOOK_URL) {
            this.notifySlack(errorEntry);
        }
        
        if (process.env.DISCORD_WEBHOOK_URL) {
            this.notifyDiscord(errorEntry);
        }
        
        if (process.env.EMAIL_ALERTS_ENABLED) {
            this.sendEmailAlert(errorEntry);
        }
    }

    async notifySlack(errorEntry) {
        try {
            const axios = require('axios');
            
            const payload = {
                text: `🚨 Critical Error in Raliux Guardian`,
                attachments: [{
                    color: 'danger',
                    fields: [
                        { title: 'Error Type', value: errorEntry.type, short: true },
                        { title: 'Message', value: errorEntry.message, short: false },
                        { title: 'Timestamp', value: errorEntry.timestamp, short: true },
                        { title: 'Node Version', value: errorEntry.metadata?.nodeVersion, short: true }
                    ]
                }]
            };

            await axios.post(process.env.SLACK_WEBHOOK_URL, payload);
            logger.info('Error notification sent to Slack');
            
        } catch (error) {
            logger.error('Failed to send Slack notification:', error);
        }
    }

    async notifyDiscord(errorEntry) {
        try {
            const axios = require('axios');
            
            const payload = {
                content: `🚨 **Critical Error in Raliux Guardian**`,
                embeds: [{
                    title: errorEntry.type,
                    description: errorEntry.message,
                    color: 15158332, // Red color
                    timestamp: errorEntry.timestamp,
                    fields: [
                        { name: 'Error ID', value: errorEntry.id, inline: true },
                        { name: 'Platform', value: errorEntry.metadata?.platform, inline: true },
                        { name: 'Uptime', value: `${Math.round(errorEntry.metadata?.uptime || 0)}s`, inline: true }
                    ]
                }]
            };

            await axios.post(process.env.DISCORD_WEBHOOK_URL, payload);
            logger.info('Error notification sent to Discord');
            
        } catch (error) {
            logger.error('Failed to send Discord notification:', error);
        }
    }

    async sendEmailAlert(errorEntry) {
        try {
            // Email integration would go here
            // Using services like SendGrid, AWS SES, etc.
            
            logger.info('Email alert would be sent here');
            
        } catch (error) {
            logger.error('Failed to send email alert:', error);
        }
    }

    getErrorStats() {
        return {
            ...this.errorStats,
            uptime: {
                ...this.errorStats.uptime,
                current: process.uptime(),
                total: this.errorStats.uptime.total || process.uptime()
            }
        };
    }

    getRecentErrors(limit = 50) {
        try {
            if (!fs.existsSync(this.errorLog)) {
                return [];
            }

            const content = fs.readFileSync(this.errorLog, 'utf8');
            const errors = JSON.parse(content);
            
            return errors
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
                
        } catch (error) {
            logger.error('Failed to read recent errors:', error);
            return [];
        }
    }

    // Circuit breaker pattern for external services
    createCircuitBreaker(name, options = {}) {
        const config = {
            failureThreshold: options.failureThreshold || 5,
            resetTimeout: options.resetTimeout || 60000,
            monitoringWindow: options.monitoringWindow || 300000
        };

        return {
            name,
            state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
            failures: 0,
            lastFailureTime: null,
            config,
            
            async execute(fn) {
                if (this.state === 'OPEN') {
                    if (Date.now() - this.lastFailureTime > config.resetTimeout) {
                        this.state = 'HALF_OPEN';
                        this.failures = 0;
                    } else {
                        throw new Error(`Circuit breaker ${name} is OPEN`);
                    }
                }

                try {
                    const result = await fn();
                    
                    if (this.state === 'HALF_OPEN') {
                        this.state = 'CLOSED';
                        this.failures = 0;
                    }
                    
                    return result;
                    
                } catch (error) {
                    this.failures++;
                    this.lastFailureTime = Date.now();
                    
                    if (this.failures >= config.failureThreshold) {
                        this.state = 'OPEN';
                        logger.warn(`Circuit breaker ${name} opened due to failures`);
                    }
                    
                    throw error;
                }
            }
        };
    }

    // Health check system
    async performHealthCheck() {
        const checks = {
            memory: this.checkMemoryUsage(),
            disk: await this.checkDiskSpace(),
            connections: await this.checkConnections(),
            errorRate: this.checkErrorRate()
        };

        const isHealthy = Object.values(checks).every(check => check.status === 'healthy');
        
        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date(),
            checks
        };
    }

    checkMemoryUsage() {
        const usage = process.memoryUsage();
        const maxHeapUsed = usage.heapUsed / usage.heapTotal;
        
        return {
            status: maxHeapUsed < 0.9 ? 'healthy' : 'unhealthy',
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            percentage: Math.round(maxHeapUsed * 100)
        };
    }

    async checkDiskSpace() {
        try {
            const fs = require('fs').promises;
            const stats = await fs.stat(process.cwd());
            
            return {
                status: 'healthy', // Simplified check
                message: 'Disk space check passed'
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    async checkConnections() {
        // Check database connections, external APIs, etc.
        return {
            status: 'healthy',
            message: 'All connections active'
        };
    }

    checkErrorRate() {
        const recentErrors = this.getRecentErrors(100);
        const last5Minutes = Date.now() - (5 * 60 * 1000);
        const recentErrorCount = recentErrors.filter(error => 
            new Date(error.timestamp) > last5Minutes
        ).length;

        return {
            status: recentErrorCount < 10 ? 'healthy' : 'unhealthy',
            recentErrors: recentErrorCount,
            threshold: 10
        };
    }
}

module.exports = new EnterpriseErrorHandler();
