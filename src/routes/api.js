const express = require('express');
const ipAnalyzer = require('../services/ip-analyzer');
const logService = require('../services/log-service');
const logger = require('../utils/logger');

const router = express.Router();

// API test endpoint
router.get('/status', (req, res) => {
    res.json({
        status: 'active',
        service: 'Raliux Web Guardian',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// IP analiz endpoint
router.post('/analyze', async (req, res) => {
    try {
        const { ip, userAgent } = req.body;
        
        if (!ip) {
            return res.status(400).json({
                error: 'IP address is required',
                code: 'MISSING_IP'
            });
        }

        const analysis = await ipAnalyzer.analyzeIP(ip, userAgent);
        
        res.json({
            success: true,
            data: analysis
        });

    } catch (error) {
        logger.error('API analyze error:', error);
        res.status(500).json({
            error: 'Analysis failed',
            code: 'ANALYSIS_ERROR'
        });
    }
});

// Bulk IP analizi
router.post('/analyze/bulk', async (req, res) => {
    try {
        const { ips } = req.body;
        
        if (!Array.isArray(ips) || ips.length === 0) {
            return res.status(400).json({
                error: 'IPs array is required',
                code: 'MISSING_IPS'
            });
        }

        if (ips.length > 100) {
            return res.status(400).json({
                error: 'Maximum 100 IPs allowed per request',
                code: 'TOO_MANY_IPS'
            });
        }

        const results = await Promise.all(
            ips.map(async (ip) => {
                try {
                    return await ipAnalyzer.analyzeIP(ip);
                } catch (error) {
                    return {
                        ip,
                        error: 'Analysis failed',
                        isBlocked: true,
                        reason: 'ANALYSIS_ERROR'
                    };
                }
            })
        );

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        logger.error('API bulk analyze error:', error);
        res.status(500).json({
            error: 'Bulk analysis failed',
            code: 'BULK_ANALYSIS_ERROR'
        });
    }
});

// Basit health check
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
