const NodeCache = require('node-cache');
const logger = require('../utils/logger');

class CacheService {
    constructor() {
        this.cache = null;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0
        };
    }

    async initialize() {
        try {
            // Varsayılan olarak memory cache kullan
            this.cache = new NodeCache({
                stdTTL: 300, // 5 dakika varsayılan
                checkperiod: 120, // 2 dakikada bir temizlik
                useClones: false
            });

            // Cache events
            this.cache.on('set', (key, value) => {
                this.stats.sets++;
                logger.debug(`Cache SET: ${key}`);
            });

            this.cache.on('expired', (key, value) => {
                logger.debug(`Cache EXPIRED: ${key}`);
            });

            logger.info('Cache service initialized (Memory Cache)');
            
            // TODO: Redis desteği eklenebilir
            // if (process.env.REDIS_URL) {
            //     await this.initializeRedis();
            // }
            
        } catch (error) {
            logger.error('Failed to initialize cache service:', error);
            throw error;
        }
    }

    async get(key) {
        try {
            const value = this.cache.get(key);
            
            if (value !== undefined) {
                this.stats.hits++;
                logger.debug(`Cache HIT: ${key}`);
                return value;
            } else {
                this.stats.misses++;
                logger.debug(`Cache MISS: ${key}`);
                return null;
            }
        } catch (error) {
            logger.warn(`Cache GET error for key ${key}:`, error);
            return null;
        }
    }

    async set(key, value, ttl = 300) {
        try {
            const success = this.cache.set(key, value, ttl);
            if (success) {
                logger.debug(`Cache SET successful: ${key} (TTL: ${ttl}s)`);
            }
            return success;
        } catch (error) {
            logger.warn(`Cache SET error for key ${key}:`, error);
            return false;
        }
    }

    async del(key) {
        try {
            const deleted = this.cache.del(key);
            if (deleted > 0) {
                logger.debug(`Cache DEL: ${key}`);
            }
            return deleted > 0;
        } catch (error) {
            logger.warn(`Cache DEL error for key ${key}:`, error);
            return false;
        }
    }

    async clear() {
        try {
            this.cache.flushAll();
            logger.info('Cache cleared');
            return true;
        } catch (error) {
            logger.warn('Cache clear error:', error);
            return false;
        }
    }

    getStats() {
        const cacheStats = this.cache.getStats();
        return {
            ...this.stats,
            keys: cacheStats.keys,
            ksize: cacheStats.ksize,
            vsize: cacheStats.vsize,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    // Bellek temizleme
    cleanup() {
        try {
            this.cache.flushAll();
            this.stats = { hits: 0, misses: 0, sets: 0 };
            logger.info('Cache cleanup completed');
        } catch (error) {
            logger.warn('Cache cleanup error:', error);
        }
    }
}

module.exports = new CacheService();
