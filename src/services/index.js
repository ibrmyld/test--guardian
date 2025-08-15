const ipAnalyzer = require('./ip-analyzer');
const logService = require('./log-service');
const cacheService = require('./cache-service');
const torService = require('./tor-service');
const logger = require('../utils/logger');

async function initializeServices() {
    try {
        logger.info('Initializing Guardian services...');
        
        // Cache servisini başlat
        await cacheService.initialize();
        logger.info('✅ Cache service initialized');
        
        // Tor exit node listesini yükle
        await torService.updateTorExitNodes();
        logger.info('✅ Tor service initialized');
        
        // IP veritabanlarını kontrol et
        await ipAnalyzer.initialize();
        logger.info('✅ IP analyzer initialized');
        
        // Log servisini başlat
        await logService.initialize();
        logger.info('✅ Log service initialized');
        
        logger.info('🚀 All Guardian services ready!');
        
    } catch (error) {
        logger.error('Failed to initialize Guardian services:', error);
        throw error;
    }
}

module.exports = {
    initializeServices,
    ipAnalyzer,
    logService,
    cacheService,
    torService
};
