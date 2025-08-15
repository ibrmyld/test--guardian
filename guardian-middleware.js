/**
 * Raliux Guardian - Middleware (Kendi Sitene Entegre Et)
 * Bu dosyayı kendi backend projena kopyala
 */

const axios = require('axios');

class GuardianMiddleware {
    constructor(options = {}) {
        this.guardianUrl = options.guardianUrl || process.env.GUARDIAN_URL;
        this.timeout = options.timeout || 5000;
        this.cache = new Map();
        this.cacheTTL = 300000; // 5 dakika
        
        if (!this.guardianUrl) {
            throw new Error('Guardian URL gerekli! Örnek: https://your-guardian.railway.app');
        }
        
        console.log(`🛡️ Guardian Middleware ready: ${this.guardianUrl}`);
    }

    middleware() {
        return async (req, res, next) => {
            try {
                const clientIP = this.getClientIP(req);
                const userAgent = req.headers['user-agent'] || '';
                
                // Cache check
                const cacheKey = `${clientIP}:${userAgent}`;
                if (this.cache.has(cacheKey)) {
                    const cached = this.cache.get(cacheKey);
                    if (Date.now() - cached.timestamp < this.cacheTTL) {
                        if (cached.blocked) {
                            return this.sendBlockPage(res, cached.reason, cached.riskScore);
                        }
                        return next();
                    }
                    this.cache.delete(cacheKey);
                }

                // Guardian'a kontrol et
                const result = await this.checkWithGuardian(clientIP, userAgent);
                
                // Cache'e kaydet
                this.cache.set(cacheKey, {
                    blocked: result.isBlocked,
                    reason: result.reason,
                    riskScore: result.riskScore,
                    timestamp: Date.now()
                });

                if (result.isBlocked) {
                    return this.sendBlockPage(res, result.reason, result.riskScore);
                }

                // İsteği geçir
                next();

            } catch (error) {
                console.error('Guardian error:', error);
                // Hata durumunda geçir (fail-safe)
                next();
            }
        };
    }

    async checkWithGuardian(ip, userAgent) {
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

            throw new Error('Invalid Guardian response');

        } catch (error) {
            console.error('Guardian check failed:', error);
            // Fail-safe: Guardian erişilemezse geçir
            return { isBlocked: false, reason: null, riskScore: 0 };
        }
    }

    sendBlockPage(res, reason, riskScore) {
        const blockReasons = {
            'TOR_EXIT_NODE': 'Tor Ağı',
            'VPN_PROXY_DETECTED': 'VPN/Proxy',
            'BAD_IP_REPUTATION': 'Şüpheli IP',
            'HIGH_RISK_SCORE': 'Yüksek Risk'
        };

        const reasonText = blockReasons[reason] || 'Güvenlik';

        res.status(403).send(`
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erişim Engellendi - Guardian</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0d0d0d, #1a1a1a);
            color: #00ff88;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
        }
        .container {
            max-width: 500px;
            padding: 2rem;
            background: rgba(26, 26, 26, 0.8);
            border-radius: 12px;
            border: 1px solid #00ff88;
            box-shadow: 0 0 30px rgba(0, 255, 136, 0.3);
        }
        .shield { 
            font-size: 80px; 
            margin-bottom: 1rem;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .title { 
            font-size: 28px; 
            margin-bottom: 1rem;
            font-weight: bold;
        }
        .reason { 
            background: rgba(255, 68, 68, 0.1);
            color: #ff4444;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            margin: 1rem 0;
            border: 1px solid #ff4444;
        }
        .details { 
            font-size: 16px; 
            color: #cccccc;
            line-height: 1.6;
            margin: 1rem 0;
        }
        .powered-by {
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid #333;
            font-size: 14px;
            color: #888;
        }
        .risk-score {
            background: rgba(255, 170, 0, 0.1);
            color: #ffaa00;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            margin: 0.5rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="shield">🛡️</div>
        <div class="title">Erişim Engellendi</div>
        
        <div class="reason">
            Engellenme Nedeni: ${reasonText}
        </div>
        
        ${riskScore > 0 ? `<div class="risk-score">Risk Skoru: ${riskScore}/100</div>` : ''}
        
        <div class="details">
            <p>IP adresiniz güvenlik nedeniyle engellenmiştir.</p>
            <p>VPN/Proxy kullanıyorsanız kapatıp tekrar deneyin.</p>
            <p>Bu bir hata olduğunu düşünüyorsanız site yöneticisi ile iletişime geçin.</p>
        </div>
        
        <div class="powered-by">
            <strong>🛡️ Powered by Raliux Guardian</strong><br>
            Enterprise Web Security
        </div>
    </div>
</body>
</html>
        `);
    }

    getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               '127.0.0.1';
    }
}

module.exports = GuardianMiddleware;
