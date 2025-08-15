/**
 * Raliux Guardian - Enterprise License Manager
 * Handles licensing, subscription validation, and feature gating
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class LicenseManager {
    constructor() {
        this.licenseFile = path.join(__dirname, '../data/license.json');
        this.publicKey = this.loadPublicKey();
        this.license = null;
        this.features = new Map();
        this.usageStats = {
            requestsThisMonth: 0,
            lastReset: new Date()
        };
        
        this.init();
    }

    async init() {
        try {
            await this.loadLicense();
            await this.validateLicense();
            this.setupFeatures();
            this.startUsageTracking();
            
            logger.info('License Manager initialized', {
                plan: this.license?.plan || 'unknown',
                expiresAt: this.license?.expiresAt,
                features: Array.from(this.features.keys())
            });
        } catch (error) {
            logger.error('License Manager initialization failed:', error);
            this.setTrialMode();
        }
    }

    loadPublicKey() {
        // Raliux public key for license verification
        return `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2vX8HqX6P1hQ7Y8KjL5X
R3mF9oV2tN8W4jB6kS2yU9rA7fG3hJ8vL2sC1qE5nK9zF6xP4tY7wQ8uE1mR5vX
L3sK8jF2pV6yG9tR4hN7cQ1wE8fB5zY2xV6pK7nF9sR4tG2vX8HqX6P1hQ7Y8K
jL5XR3mF9oV2tN8W4jB6kS2yU9rA7fG3hJ8vL2sC1qE5nK9zF6xP4tY7wQ8uE1
mR5vXL3sK8jF2pV6yG9tR4hN7cQ1wE8fB5zY2xV6pK7nF9sR4tG2vX8HqX6P1h
Q7Y8KjL5XR3mF9oV2tN8W4jB6kS2yU9rA7fG3hJ8vL2sC1qE5nK9zF6xP4tY7w
Q8uE1mR5vXL3sK8jF2pV6yG9tR4hN7cQ1wE8fB5zY2xV6pK7nF9sR4tG
-----END PUBLIC KEY-----`;
    }

    async loadLicense() {
        try {
            if (fs.existsSync(this.licenseFile)) {
                const licenseData = fs.readFileSync(this.licenseFile, 'utf8');
                this.license = JSON.parse(licenseData);
            } else {
                // Check environment for license
                const envLicense = process.env.RALIUX_LICENSE_KEY;
                if (envLicense) {
                    this.license = await this.validateLicenseKey(envLicense);
                    this.saveLicense();
                }
            }
        } catch (error) {
            logger.error('Failed to load license:', error);
            throw error;
        }
    }

    async validateLicenseKey(licenseKey) {
        try {
            // Decode base64 license
            const decoded = Buffer.from(licenseKey, 'base64').toString('utf8');
            const licenseData = JSON.parse(decoded);

            // Verify signature
            const verify = crypto.createVerify('SHA256');
            verify.update(licenseData.payload);
            
            const isValid = verify.verify(this.publicKey, licenseData.signature, 'base64');
            
            if (!isValid) {
                throw new Error('Invalid license signature');
            }

            // Parse payload
            const payload = JSON.parse(licenseData.payload);
            
            // Check expiration
            const expiresAt = new Date(payload.expiresAt);
            if (expiresAt < new Date()) {
                throw new Error('License has expired');
            }

            return {
                customerId: payload.customerId,
                plan: payload.plan,
                features: payload.features,
                limits: payload.limits,
                issuedAt: new Date(payload.issuedAt),
                expiresAt: expiresAt,
                domain: payload.domain
            };

        } catch (error) {
            logger.error('License validation failed:', error);
            throw error;
        }
    }

    async validateLicense() {
        if (!this.license) {
            throw new Error('No license found');
        }

        // Check expiration
        if (this.license.expiresAt < new Date()) {
            throw new Error('License has expired');
        }

        // Check domain (if specified)
        if (this.license.domain) {
            const currentDomain = process.env.DOMAIN || 'localhost';
            if (this.license.domain !== currentDomain && this.license.domain !== '*') {
                logger.warn(`License domain mismatch: ${this.license.domain} vs ${currentDomain}`);
            }
        }

        return true;
    }

    setupFeatures() {
        if (!this.license) {
            this.setTrialFeatures();
            return;
        }

        // Enable licensed features
        this.license.features.forEach(feature => {
            this.features.set(feature, true);
        });

        logger.info('Licensed features enabled:', Array.from(this.features.keys()));
    }

    setTrialMode() {
        logger.warn('No valid license found. Running in trial mode.');
        
        this.license = {
            plan: 'trial',
            features: ['basicProtection', 'dashboard'],
            limits: {
                requestsPerMonth: 10000,
                maxCustomRules: 1,
                dataRetentionDays: 7
            },
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
        };

        this.setTrialFeatures();
    }

    setTrialFeatures() {
        this.features.clear();
        this.features.set('basicProtection', true);
        this.features.set('dashboard', true);
        this.features.set('trial', true);
    }

    hasFeature(featureName) {
        return this.features.has(featureName);
    }

    checkLimit(limitName, currentValue) {
        if (!this.license || !this.license.limits) {
            return { allowed: true, limit: Infinity };
        }

        const limit = this.license.limits[limitName];
        if (limit === undefined) {
            return { allowed: true, limit: Infinity };
        }

        return {
            allowed: currentValue < limit,
            limit: limit,
            current: currentValue,
            remaining: limit - currentValue
        };
    }

    trackRequest() {
        // Reset monthly counter if needed
        const now = new Date();
        const lastReset = new Date(this.usageStats.lastReset);
        
        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
            this.usageStats.requestsThisMonth = 0;
            this.usageStats.lastReset = now;
            this.saveUsageStats();
        }

        this.usageStats.requestsThisMonth++;
        
        // Check monthly limit
        const limitCheck = this.checkLimit('requestsPerMonth', this.usageStats.requestsThisMonth);
        
        if (!limitCheck.allowed) {
            logger.warn('Monthly request limit exceeded', {
                current: limitCheck.current,
                limit: limitCheck.limit
            });
            
            return { exceeded: true, ...limitCheck };
        }

        // Save stats periodically
        if (this.usageStats.requestsThisMonth % 1000 === 0) {
            this.saveUsageStats();
        }

        return { exceeded: false, ...limitCheck };
    }

    getLicenseInfo() {
        if (!this.license) {
            return { status: 'unlicensed' };
        }

        return {
            status: this.license.plan === 'trial' ? 'trial' : 'licensed',
            plan: this.license.plan,
            customerId: this.license.customerId,
            expiresAt: this.license.expiresAt,
            features: Array.from(this.features.keys()),
            limits: this.license.limits,
            usage: this.usageStats
        };
    }

    getUsageStats() {
        return {
            ...this.usageStats,
            limits: this.license?.limits || {},
            percentUsed: {
                requests: this.license?.limits?.requestsPerMonth 
                    ? (this.usageStats.requestsThisMonth / this.license.limits.requestsPerMonth * 100).toFixed(2)
                    : 0
            }
        };
    }

    saveLicense() {
        try {
            const dir = path.dirname(this.licenseFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this.licenseFile, JSON.stringify(this.license, null, 2));
        } catch (error) {
            logger.error('Failed to save license:', error);
        }
    }

    saveUsageStats() {
        try {
            const statsFile = path.join(__dirname, '../data/usage-stats.json');
            const dir = path.dirname(statsFile);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(statsFile, JSON.stringify(this.usageStats, null, 2));
        } catch (error) {
            logger.error('Failed to save usage stats:', error);
        }
    }

    startUsageTracking() {
        // Save usage stats every 5 minutes
        setInterval(() => {
            this.saveUsageStats();
        }, 5 * 60 * 1000);

        // Check license expiration daily
        setInterval(() => {
            this.validateLicense().catch(error => {
                logger.error('License validation failed during periodic check:', error);
            });
        }, 24 * 60 * 60 * 1000);
    }

    // Enterprise feature gates
    canUseAdvancedAnalytics() {
        return this.hasFeature('advancedAnalytics');
    }

    canUseCustomRules() {
        return this.hasFeature('customRules');
    }

    canUseWebhooks() {
        return this.hasFeature('webhookSupport');
    }

    canUseSSO() {
        return this.hasFeature('ssoIntegration');
    }

    canUseWhiteLabeling() {
        return this.hasFeature('whiteLabeling');
    }

    getMaxCustomRules() {
        return this.license?.limits?.maxCustomRules || 1;
    }

    getMaxWebhooks() {
        return this.license?.limits?.maxWebhooks || 0;
    }

    getDataRetentionDays() {
        return this.license?.limits?.dataRetentionDays || 7;
    }
}

module.exports = new LicenseManager();
