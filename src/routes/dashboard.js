const express = require('express');
const path = require('path');
const logService = require('../services/log-service');
const cacheService = require('../services/cache-service');
const torService = require('../services/tor-service');
const logger = require('../utils/logger');

const router = express.Router();

// Dashboard authentication middleware
function authenticate(req, res, next) {
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Guardian Dashboard"');
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const credentials = Buffer.from(auth.slice(6), 'base64').toString();
        const [username, password] = credentials.split(':');
        
        if (username === process.env.DASHBOARD_USERNAME && 
            password === process.env.DASHBOARD_PASSWORD) {
            next();
        } else {
            res.setHeader('WWW-Authenticate', 'Basic realm="Guardian Dashboard"');
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(401).json({ error: 'Invalid authorization header' });
    }
}

// Dashboard ana sayfa
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

// Dashboard API endpoints
router.get('/api/stats', authenticate, async (req, res) => {
    try {
        const stats = await logService.getStats();
        const cacheStats = cacheService.getStats();
        const torStats = {
            exitNodeCount: torService.getExitNodeCount(),
            lastUpdate: torService.getLastUpdateTime()
        };

        res.json({
            success: true,
            data: {
                requests: stats,
                cache: cacheStats,
                tor: torStats,
                uptime: process.uptime(),
                memory: process.memoryUsage()
            }
        });
    } catch (error) {
        logger.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

router.get('/api/logs', authenticate, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await logService.getRecentLogs(limit);
        
        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        logger.error('Dashboard logs error:', error);
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

router.post('/api/cache/clear', authenticate, async (req, res) => {
    try {
        await cacheService.clear();
        res.json({ success: true, message: 'Cache cleared' });
    } catch (error) {
        logger.error('Cache clear error:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

router.post('/api/tor/update', authenticate, async (req, res) => {
    try {
        await torService.updateTorExitNodes();
        res.json({ success: true, message: 'Tor exit nodes updated' });
    } catch (error) {
        logger.error('Tor update error:', error);
        res.status(500).json({ error: 'Failed to update Tor nodes' });
    }
});

module.exports = router;
