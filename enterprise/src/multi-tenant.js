/**
 * Raliux Guardian - Multi-Tenant Architecture
 * Customer isolation and tenant management system
 */

const crypto = require('crypto');
const logger = require('../../src/utils/logger');

class MultiTenantManager {
    constructor() {
        this.tenants = new Map();
        this.tenantConfigs = new Map();
        this.tenantStats = new Map();
        this.defaultConfig = this.getDefaultTenantConfig();
        
        this.init();
    }

    init() {
        // Load existing tenants from database/file
        this.loadTenants();
        
        // Start tenant monitoring
        this.startTenantMonitoring();
        
        logger.info('Multi-tenant manager initialized');
    }

    async createTenant(customerData) {
        try {
            const tenantId = this.generateTenantId();
            
            const tenant = {
                id: tenantId,
                customerId: customerData.customerId,
                companyName: customerData.companyName,
                domain: customerData.domain,
                adminEmail: customerData.adminEmail,
                plan: customerData.plan || 'starter',
                status: 'active',
                createdAt: new Date(),
                config: {
                    ...this.defaultConfig,
                    ...customerData.config
                },
                usage: {
                    requestsThisMonth: 0,
                    lastReset: new Date(),
                    totalRequests: 0
                },
                billing: {
                    nextBillingDate: this.calculateNextBillingDate(),
                    isTrialActive: true,
                    trialEndsAt: this.calculateTrialEndDate()
                }
            };

            // Store tenant
            this.tenants.set(tenantId, tenant);
            this.tenantConfigs.set(tenantId, tenant.config);
            this.tenantStats.set(tenantId, {
                requestsThisMonth: 0,
                blockedThisMonth: 0,
                lastActivity: new Date()
            });

            // Create tenant-specific resources
            await this.createTenantResources(tenantId);
            
            // Save to persistent storage
            await this.saveTenant(tenant);

            logger.info('Tenant created successfully', {
                tenantId,
                customerId: customerData.customerId,
                companyName: customerData.companyName
            });

            return tenant;

        } catch (error) {
            logger.error('Failed to create tenant:', error);
            throw error;
        }
    }

    async getTenant(tenantId) {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            throw new Error(`Tenant not found: ${tenantId}`);
        }
        return tenant;
    }

    async getTenantByDomain(domain) {
        for (const [tenantId, tenant] of this.tenants) {
            if (tenant.domain === domain) {
                return tenant;
            }
        }
        throw new Error(`Tenant not found for domain: ${domain}`);
    }

    async getTenantByCustomerId(customerId) {
        for (const [tenantId, tenant] of this.tenants) {
            if (tenant.customerId === customerId) {
                return tenant;
            }
        }
        throw new Error(`Tenant not found for customer: ${customerId}`);
    }

    async updateTenant(tenantId, updates) {
        try {
            const tenant = await this.getTenant(tenantId);
            
            // Update tenant data
            Object.assign(tenant, updates, {
                updatedAt: new Date()
            });

            // Update config if provided
            if (updates.config) {
                Object.assign(tenant.config, updates.config);
                this.tenantConfigs.set(tenantId, tenant.config);
            }

            // Save changes
            await this.saveTenant(tenant);

            logger.info('Tenant updated successfully', { tenantId, updates });

            return tenant;

        } catch (error) {
            logger.error('Failed to update tenant:', error);
            throw error;
        }
    }

    async suspendTenant(tenantId, reason = 'Payment failure') {
        try {
            const tenant = await this.getTenant(tenantId);
            
            tenant.status = 'suspended';
            tenant.suspendedAt = new Date();
            tenant.suspensionReason = reason;

            await this.saveTenant(tenant);

            logger.warn('Tenant suspended', { tenantId, reason });

            return tenant;

        } catch (error) {
            logger.error('Failed to suspend tenant:', error);
            throw error;
        }
    }

    async deleteTenant(tenantId) {
        try {
            const tenant = await this.getTenant(tenantId);
            
            // Cleanup tenant resources
            await this.cleanupTenantResources(tenantId);
            
            // Remove from memory
            this.tenants.delete(tenantId);
            this.tenantConfigs.delete(tenantId);
            this.tenantStats.delete(tenantId);

            // Mark as deleted in storage (don't actually delete for audit)
            tenant.status = 'deleted';
            tenant.deletedAt = new Date();
            await this.saveTenant(tenant);

            logger.info('Tenant deleted successfully', { tenantId });

        } catch (error) {
            logger.error('Failed to delete tenant:', error);
            throw error;
        }
    }

    // Tenant isolation middleware
    tenantMiddleware() {
        return async (req, res, next) => {
            try {
                const tenantId = this.extractTenantId(req);
                
                if (!tenantId) {
                    return res.status(400).json({
                        error: 'Tenant ID required',
                        code: 'MISSING_TENANT_ID'
                    });
                }

                const tenant = await this.getTenant(tenantId);
                
                // Check tenant status
                if (tenant.status !== 'active') {
                    return res.status(403).json({
                        error: 'Tenant not active',
                        code: 'TENANT_INACTIVE',
                        status: tenant.status
                    });
                }

                // Check usage limits
                const usageCheck = await this.checkUsageLimits(tenantId);
                if (!usageCheck.allowed) {
                    return res.status(429).json({
                        error: 'Usage limit exceeded',
                        code: 'USAGE_LIMIT_EXCEEDED',
                        limit: usageCheck.limit,
                        current: usageCheck.current
                    });
                }

                // Add tenant context to request
                req.tenant = tenant;
                req.tenantConfig = this.tenantConfigs.get(tenantId);

                // Track request
                await this.trackTenantRequest(tenantId);

                next();

            } catch (error) {
                logger.error('Tenant middleware error:', error);
                res.status(500).json({
                    error: 'Tenant validation failed',
                    code: 'TENANT_ERROR'
                });
            }
        };
    }

    extractTenantId(req) {
        // Multiple ways to identify tenant
        return req.headers['x-tenant-id'] ||
               req.query.tenantId ||
               req.body?.tenantId ||
               this.extractFromApiKey(req.headers.authorization) ||
               this.extractFromDomain(req.headers.host);
    }

    extractFromApiKey(authorization) {
        if (!authorization?.startsWith('Bearer ')) return null;
        
        try {
            const apiKey = authorization.slice(7);
            // API key format: gt_<tenantId>_<random>
            const parts = apiKey.split('_');
            if (parts[0] === 'gt' && parts[1]) {
                return parts[1];
            }
        } catch (error) {
            logger.warn('Failed to extract tenant from API key:', error);
        }
        
        return null;
    }

    extractFromDomain(host) {
        if (!host) return null;
        
        // Support for tenant subdomains: tenant123.guardian.raliux.com
        const parts = host.split('.');
        if (parts.length >= 3 && parts[1] === 'guardian') {
            return parts[0];
        }
        
        return null;
    }

    async checkUsageLimits(tenantId) {
        try {
            const tenant = await this.getTenant(tenantId);
            const limits = this.getPlanLimits(tenant.plan);
            const stats = this.tenantStats.get(tenantId);

            // Check monthly request limit
            const requestLimit = limits.requestsPerMonth;
            const currentRequests = stats?.requestsThisMonth || 0;

            if (currentRequests >= requestLimit) {
                return {
                    allowed: false,
                    limit: requestLimit,
                    current: currentRequests,
                    reason: 'Monthly request limit exceeded'
                };
            }

            // Check rate limiting
            const rateLimit = limits.requestsPerMinute || 1000;
            const rateLimitCheck = await this.checkRateLimit(tenantId, rateLimit);
            
            if (!rateLimitCheck.allowed) {
                return rateLimitCheck;
            }

            return {
                allowed: true,
                limit: requestLimit,
                current: currentRequests,
                remaining: requestLimit - currentRequests
            };

        } catch (error) {
            logger.error('Usage limit check failed:', error);
            return { allowed: true }; // Fail open
        }
    }

    async checkRateLimit(tenantId, limit) {
        // Simple in-memory rate limiting (in production, use Redis)
        const key = `rate_${tenantId}`;
        const now = Date.now();
        const windowMs = 60000; // 1 minute

        if (!this.rateLimiters) {
            this.rateLimiters = new Map();
        }

        let rateLimiter = this.rateLimiters.get(key);
        if (!rateLimiter) {
            rateLimiter = { requests: [], windowStart: now };
            this.rateLimiters.set(key, rateLimiter);
        }

        // Clean old requests
        rateLimiter.requests = rateLimiter.requests.filter(time => 
            now - time < windowMs
        );

        if (rateLimiter.requests.length >= limit) {
            return {
                allowed: false,
                limit,
                current: rateLimiter.requests.length,
                reason: 'Rate limit exceeded'
            };
        }

        rateLimiter.requests.push(now);
        return { allowed: true };
    }

    async trackTenantRequest(tenantId, blocked = false) {
        try {
            const stats = this.tenantStats.get(tenantId) || {
                requestsThisMonth: 0,
                blockedThisMonth: 0,
                lastActivity: new Date()
            };

            // Reset monthly stats if needed
            const now = new Date();
            const lastReset = new Date(stats.lastReset || stats.lastActivity);
            
            if (now.getMonth() !== lastReset.getMonth() || 
                now.getFullYear() !== lastReset.getFullYear()) {
                stats.requestsThisMonth = 0;
                stats.blockedThisMonth = 0;
                stats.lastReset = now;
            }

            stats.requestsThisMonth++;
            if (blocked) {
                stats.blockedThisMonth++;
            }
            stats.lastActivity = now;

            this.tenantStats.set(tenantId, stats);

            // Update tenant usage
            const tenant = this.tenants.get(tenantId);
            if (tenant) {
                tenant.usage.requestsThisMonth = stats.requestsThisMonth;
                tenant.usage.totalRequests = (tenant.usage.totalRequests || 0) + 1;
                tenant.usage.lastActivity = now;
            }

        } catch (error) {
            logger.error('Failed to track tenant request:', error);
        }
    }

    getPlanLimits(plan) {
        const plans = {
            starter: {
                requestsPerMonth: 100000,
                requestsPerMinute: 100,
                maxCustomRules: 5,
                dataRetentionDays: 30,
                features: ['basicProtection', 'dashboard', 'emailSupport']
            },
            professional: {
                requestsPerMonth: 1000000,
                requestsPerMinute: 1000,
                maxCustomRules: 25,
                maxWebhooks: 10,
                dataRetentionDays: 90,
                features: ['advancedProtection', 'analytics', 'webhooks', 'prioritySupport']
            },
            enterprise: {
                requestsPerMonth: 10000000,
                requestsPerMinute: 10000,
                maxCustomRules: 100,
                maxWebhooks: 50,
                maxUsers: 1000,
                dataRetentionDays: 365,
                features: ['fullProtection', 'customRules', 'sso', 'whiteLabeling', 'dedicatedSupport']
            }
        };

        return plans[plan] || plans.starter;
    }

    generateTenantId() {
        return `tenant_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateApiKey(tenantId) {
        const random = crypto.randomBytes(16).toString('hex');
        return `gt_${tenantId}_${random}`;
    }

    getDefaultTenantConfig() {
        return {
            security: {
                blockVpnTor: true,
                strictMode: false,
                riskThreshold: 70,
                geoBlocking: {
                    enabled: false,
                    blockedCountries: []
                },
                rateLimiting: {
                    enabled: true,
                    windowMs: 900000,
                    maxRequests: 100
                }
            },
            dashboard: {
                theme: 'dark',
                notifications: true,
                autoRefresh: true
            },
            webhooks: {
                enabled: false,
                events: ['block', 'high_risk']
            }
        };
    }

    calculateNextBillingDate() {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        return date;
    }

    calculateTrialEndDate() {
        const date = new Date();
        date.setDate(date.getDate() + 14); // 14 day trial
        return date;
    }

    async createTenantResources(tenantId) {
        try {
            // Create tenant-specific database schema/tables
            // Create tenant-specific log files
            // Set up tenant-specific monitoring
            // Create tenant-specific API keys
            
            const apiKey = this.generateApiKey(tenantId);
            
            logger.info('Tenant resources created', { tenantId, apiKey });
            
            return { apiKey };

        } catch (error) {
            logger.error('Failed to create tenant resources:', error);
            throw error;
        }
    }

    async cleanupTenantResources(tenantId) {
        try {
            // Clean up tenant-specific resources
            // Archive tenant data
            // Remove from monitoring
            
            logger.info('Tenant resources cleaned up', { tenantId });

        } catch (error) {
            logger.error('Failed to cleanup tenant resources:', error);
        }
    }

    async loadTenants() {
        try {
            // Load tenants from database or file storage
            // This is a placeholder - in production would load from DB
            
            logger.info('Tenants loaded from storage');

        } catch (error) {
            logger.error('Failed to load tenants:', error);
        }
    }

    async saveTenant(tenant) {
        try {
            // Save tenant to persistent storage
            // This is a placeholder - in production would save to DB
            
            logger.debug('Tenant saved to storage', { tenantId: tenant.id });

        } catch (error) {
            logger.error('Failed to save tenant:', error);
            throw error;
        }
    }

    startTenantMonitoring() {
        // Monitor tenant usage and health
        setInterval(() => {
            this.monitorTenantHealth();
        }, 60000); // Every minute

        // Clean up expired sessions
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 300000); // Every 5 minutes
    }

    async monitorTenantHealth() {
        try {
            for (const [tenantId, tenant] of this.tenants) {
                const stats = this.tenantStats.get(tenantId);
                
                // Check for inactive tenants
                if (stats?.lastActivity) {
                    const daysSinceActivity = (Date.now() - stats.lastActivity) / (1000 * 60 * 60 * 24);
                    
                    if (daysSinceActivity > 30) {
                        logger.warn('Inactive tenant detected', { tenantId, daysSinceActivity });
                    }
                }

                // Check trial expiration
                if (tenant.billing?.isTrialActive && tenant.billing?.trialEndsAt < new Date()) {
                    logger.info('Trial expired for tenant', { tenantId });
                    // Handle trial expiration
                }
            }

        } catch (error) {
            logger.error('Tenant health monitoring failed:', error);
        }
    }

    cleanupExpiredSessions() {
        // Clean up rate limiters
        if (this.rateLimiters) {
            const now = Date.now();
            for (const [key, limiter] of this.rateLimiters) {
                if (now - limiter.windowStart > 300000) { // 5 minutes
                    this.rateLimiters.delete(key);
                }
            }
        }
    }

    // Analytics and reporting
    getTenantAnalytics(tenantId) {
        const tenant = this.tenants.get(tenantId);
        const stats = this.tenantStats.get(tenantId);
        
        if (!tenant || !stats) {
            throw new Error('Tenant not found');
        }

        return {
            tenant: {
                id: tenant.id,
                companyName: tenant.companyName,
                plan: tenant.plan,
                status: tenant.status,
                createdAt: tenant.createdAt
            },
            usage: {
                requestsThisMonth: stats.requestsThisMonth,
                blockedThisMonth: stats.blockedThisMonth,
                totalRequests: tenant.usage.totalRequests,
                lastActivity: stats.lastActivity
            },
            limits: this.getPlanLimits(tenant.plan)
        };
    }

    getAllTenantsAnalytics() {
        const analytics = [];
        
        for (const [tenantId] of this.tenants) {
            try {
                analytics.push(this.getTenantAnalytics(tenantId));
            } catch (error) {
                logger.warn('Failed to get analytics for tenant', { tenantId, error });
            }
        }

        return analytics;
    }
}

module.exports = new MultiTenantManager();
