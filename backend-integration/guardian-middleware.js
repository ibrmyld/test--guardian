/**
 * Raliux Web Guardian - Backend Entegrasyon Middleware
 * Çok kolay kurulum ve kullanım için hazırlanmıştır
 */

const axios = require('axios');

class GuardianMiddleware {
    constructor(options = {}) {
        this.guardianUrl = options.guardianUrl || process.env.GUARDIAN_URL;
        this.timeout = options.timeout || 5000;
        this.retries = options.retries || 2;
        this.enableCache = options.cache !== false;
        this.cacheTTL = options.cacheTTL || 300000; // 5 dakika
        this.cache = new Map();
        this.stats = {
            total: 0,
            blocked: 0,
            allowed: 0,
            errors: 0
        };

        if (!this.guardianUrl) {
            throw new Error('Guardian URL gerekli! GUARDIAN_URL environment variable ayarlayın.');
        }

        // Cache temizleme
        if (this.enableCache) {
            setInterval(() => this.clearExpiredCache(), 60000);
        }

        console.log(`🛡️ Guardian Middleware initialized: ${this.guardianUrl}`);
    }

    // Ana middleware fonksiyonu
    middleware() {
        return async (req, res, next) => {
            try {
                const clientIP = this.getClientIP(req);
                const userAgent = req.headers['user-agent'] || '';
                const cacheKey = `${clientIP}:${userAgent}`;

                // Cache kontrolü
                if (this.enableCache && this.cache.has(cacheKey)) {
                    const cached = this.cache.get(cacheKey);
                    if (Date.now() - cached.timestamp < this.cacheTTL) {
                        return this.handleGuardianResponse(cached.result, req, res, next);
                    }
                    this.cache.delete(cacheKey);
                }

                // Guardian'a istek gönder
                const result = await this.checkWithGuardian(clientIP, userAgent);
                
                // Cache'e kaydet
                if (this.enableCache) {
                    this.cache.set(cacheKey, {
                        result,
                        timestamp: Date.now()
                    });
                }

                return this.handleGuardianResponse(result, req, res, next);

            } catch (error) {
                console.error('Guardian middleware error:', error);
                this.stats.errors++;
                
                // Fail-safe: Guardian erişilemezse isteği geçir
                return next();
            }
        };
    }

    async checkWithGuardian(ip, userAgent) {
        let lastError;
        
        for (let i = 0; i < this.retries; i++) {
            try {
                const response = await axios.post(
                    `${this.guardianUrl}/api/analyze`,
                    { ip, userAgent },
                    { 
                        timeout: this.timeout,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );

                if (response.data && response.data.success) {
                    return response.data.data;
                }
            } catch (error) {
                lastError = error;
                if (i === this.retries - 1) break;
                
                // Kısa bekleme
                await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
            }
        }

        throw lastError;
    }

    handleGuardianResponse(analysis, req, res, next) {
        this.stats.total++;

        if (analysis.isBlocked) {
            this.stats.blocked++;
            
            // Guardian IP'yi bloklamış
            return res.status(403).json({
                error: 'Access denied by security system',
                reason: analysis.reason,
                riskScore: analysis.riskScore,
                blocked: true,
                timestamp: new Date().toISOString()
            });
        }

        this.stats.allowed++;
        
        // IP'ye izin verilmiş, request'i geçir
        req.guardian = {
            analysis,
            allowed: true,
            riskScore: analysis.riskScore
        };

        return next();
    }

    getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               '127.0.0.1';
    }

    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheTTL) {
                this.cache.delete(key);
            }
        }
    }

    // İstatistikler
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            blockRate: this.stats.total > 0 ? (this.stats.blocked / this.stats.total * 100).toFixed(2) + '%' : '0%'
        };
    }

    // Cache temizle
    clearCache() {
        this.cache.clear();
    }
}

module.exports = GuardianMiddleware;
