/**
 * Mobile App API - Log izleme ve yönetim
 */

const express = require('express');
const logService = require('../services/log-service');
const cacheService = require('../services/cache-service');

const router = express.Router();

// Mobile app authentication (basit token sistemi)
function mobileAuth(req, res, next) {
    const token = req.headers['x-mobile-token'] || req.query.token;
    
    // Basit token check (production'da JWT kullan)
    if (token === process.env.MOBILE_API_TOKEN || token === 'mobile123') {
        next();
    } else {
        res.status(401).json({ 
            error: 'Invalid mobile token',
            code: 'MOBILE_AUTH_FAILED' 
        });
    }
}

// Get real-time logs for mobile app
router.get('/logs', mobileAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await logService.getRecentLogs(limit);
        
        // Mobile için optimize et
        const mobileLogs = logs.map(log => ({
            id: log.requestId,
            timestamp: log.timestamp,
            ip: log.ip,
            country: log.analysis?.details?.country || 'Unknown',
            blocked: log.blocked,
            reason: log.reason,
            riskScore: log.riskScore,
            userAgent: log.userAgent?.substring(0, 50) + '...' // Kısa tut
        }));

        res.json({
            success: true,
            count: mobileLogs.length,
            data: mobileLogs
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get logs',
            code: 'LOGS_ERROR'
        });
    }
});

// Get stats for mobile dashboard
router.get('/stats', mobileAuth, async (req, res) => {
    try {
        const stats = await logService.getStats();
        
        // Mobile için basitleştir
        const mobileStats = {
            totalRequests: stats.totalRequests,
            blockedRequests: stats.blockedRequests,
            allowedRequests: stats.allowedRequests,
            blockRate: stats.totalRequests > 0 
                ? Math.round((stats.blockedRequests / stats.totalRequests) * 100) 
                : 0,
            avgRiskScore: Math.round(stats.avgRiskScore),
            lastHour: stats.lastHour,
            topCountries: Object.entries(stats.topCountries)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([country, count]) => ({ country, count })),
            topReasons: Object.entries(stats.topBlockReasons)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([reason, count]) => ({ reason, count }))
        };

        res.json({
            success: true,
            data: mobileStats
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get stats',
            code: 'STATS_ERROR'
        });
    }
});

// Get live activity stream (Server-Sent Events)
router.get('/live', mobileAuth, (req, res) => {
    // SSE setup
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // Heartbeat her 30 saniye
    const heartbeat = setInterval(() => {
        res.write('data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
    }, 30000);

    // Gerçek uygulamada event emitter kullan
    // Bu örnekte basit log stream simülasyonu
    const sendLiveUpdate = () => {
        const fakeLog = {
            type: 'new_request',
            timestamp: new Date().toISOString(),
            ip: '192.168.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255),
            blocked: Math.random() > 0.8,
            country: ['US', 'TR', 'DE', 'CN', 'RU'][Math.floor(Math.random() * 5)],
            riskScore: Math.floor(Math.random() * 100)
        };
        
        res.write(`data: ${JSON.stringify(fakeLog)}\n\n`);
    };

    // Her 5 saniyede fake update (gerçek uygulamada event-driven olacak)
    const liveInterval = setInterval(sendLiveUpdate, 5000);

    // Connection kapandığında temizle
    req.on('close', () => {
        clearInterval(heartbeat);
        clearInterval(liveInterval);
    });
});

// System health for mobile
router.get('/health', mobileAuth, (req, res) => {
    const stats = cacheService.getStats();
    
    res.json({
        success: true,
        status: 'healthy',
        uptime: process.uptime(),
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        },
        cache: {
            hitRate: Math.round(stats.hitRate * 100) + '%',
            keys: stats.keys
        },
        timestamp: new Date().toISOString()
    });
});

// Mobile device registration (push notifications için)
router.post('/register-device', mobileAuth, (req, res) => {
    try {
        const { deviceId, pushToken, platform } = req.body;
        
        // Device bilgilerini kaydet (gerçek uygulamada database'e kaydet)
        console.log('Mobile device registered:', { deviceId, platform });
        
        res.json({
            success: true,
            message: 'Device registered successfully',
            deviceId
        });

    } catch (error) {
        res.status(500).json({
            error: 'Device registration failed',
            code: 'DEVICE_REG_ERROR'
        });
    }
});

module.exports = router;
