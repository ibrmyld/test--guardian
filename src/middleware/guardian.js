const ipAnalyzer = require('../services/ip-analyzer');
const logService = require('../services/log-service');
const cacheService = require('../services/cache-service');
const logger = require('../utils/logger');

class GuardianMiddleware {
    constructor() {
        this.blockedIPs = new Set();
        this.allowedIPs = new Set();
    }

    async analyze(req, res, next) {
        try {
            const clientIP = this.getClientIP(req);
            const userAgent = req.headers['user-agent'] || '';
            const requestId = this.generateRequestId();

            // Cache kontrolü
            const cacheKey = `analysis:${clientIP}`;
            const cachedResult = await cacheService.get(cacheKey);
            
            if (cachedResult) {
                return this.handleResult(req, res, cachedResult, requestId);
            }

            // IP analizi
            const analysis = await ipAnalyzer.analyzeIP(clientIP, userAgent);
            
            // Sonucu cache'le (5 dakika)
            await cacheService.set(cacheKey, analysis, 300);
            
            // Log kaydet
            await logService.logRequest({
                requestId,
                ip: clientIP,
                userAgent,
                analysis,
                timestamp: new Date(),
                url: req.url,
                method: req.method
            });

            return this.handleResult(req, res, analysis, requestId);

        } catch (error) {
            logger.error('Guardian middleware error:', error);
            return res.status(500).json({
                error: 'Internal Guardian Error',
                code: 'GUARDIAN_ERROR'
            });
        }
    }

    handleResult(req, res, analysis, requestId) {
        const { isBlocked, reason, riskScore, details } = analysis;

        if (isBlocked) {
            // 403 - Bloklandı
            return res.status(403).json({
                blocked: true,
                reason,
                riskScore,
                message: 'IP adresiniz güvenlik nedeniyle engellenmiştir.',
                requestId,
                timestamp: new Date().toISOString()
            });
        }

        // 418 - İzin ver (Nginx için sinyal)
        res.status(418).json({
            allowed: true,
            riskScore,
            details,
            requestId,
            message: 'Request authorized by Guardian'
        });
    }

    getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               '127.0.0.1';
    }

    generateRequestId() {
        return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }
}

const guardianInstance = new GuardianMiddleware();
module.exports = (req, res, next) => guardianInstance.analyze(req, res, next);
