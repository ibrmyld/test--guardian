require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const logger = require('./utils/logger');
const guardianMiddleware = require('./middleware/guardian');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');
const mobileApiRoutes = require('./routes/mobile-api');
const { initializeServices } = require('./services');

class WebGuardian {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.setupMiddleware();
        this.setupRoutes();
        this.initializeServices();
    }

    setupMiddleware() {
        this.app.use(helmet());
        
        // CORS disabled in production for security
        if (process.env.NODE_ENV !== 'production') {
            this.app.use(cors());
        }
        
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    setupRoutes() {
        // Production mode - only essential endpoints
        if (process.env.NODE_ENV === 'production') {
            // Health check (always enabled)
            this.app.get('/health', (req, res) => {
                res.json({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0'
                });
            });

            // Verify endpoint (main Guardian function)
            this.app.use('/verify', guardianMiddleware);

            // License check - block all if invalid
            if (!this.isLicenseValid()) {
                this.app.all('*', (req, res) => {
                    res.status(403).json({
                        error: 'Invalid or missing license',
                        code: 'LICENSE_REQUIRED'
                    });
                });
                return;
            }

            // Block all other endpoints in production
            this.app.all('*', (req, res) => {
                res.status(404).json({
                    error: 'Endpoint not available in production mode',
                    code: 'PROD_MODE_RESTRICTED'
                });
            });

        } else {
            // Development mode - all endpoints available
            this.app.use('/api', guardianMiddleware);
            
            if (process.env.DASHBOARD_ENABLED === 'true') {
                this.app.use('/dashboard', dashboardRoutes);
            }
            
            this.app.use('/api', apiRoutes);
            this.app.use('/mobile-api', mobileApiRoutes);
            this.app.all('*', guardianMiddleware);
        }
    }

    async initializeServices() {
        try {
            await initializeServices();
            logger.info('All services initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize services:', error);
            process.exit(1);
        }
    }

    isLicenseValid() {
        const licenseKey = process.env.LICENSE_KEY;
        if (!licenseKey) {
            logger.error('LICENSE_KEY environment variable is required');
            return false;
        }
        
        // Basic license validation (in real app, validate signature)
        if (licenseKey.length < 32) {
            logger.error('Invalid license key format');
            return false;
        }
        
        return true;
    }

    start() {
        // License check on startup
        if (process.env.NODE_ENV === 'production' && !this.isLicenseValid()) {
            logger.error('❌ Invalid license. Guardian will not start.');
            process.exit(1);
        }

        this.app.listen(this.port, () => {
            logger.info(`🛡️  Raliux Web Guardian running on port ${this.port}`);
            logger.info(`🔒 Mode: ${process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'}`);
            logger.info(`🌐 Health: http://localhost:${this.port}/health`);
            logger.info(`🔍 Verify: http://localhost:${this.port}/verify`);
            
            if (process.env.NODE_ENV !== 'production') {
                logger.info(`📊 Dashboard: http://localhost:${this.port}/dashboard`);
            }
        });
    }
}

const guardian = new WebGuardian();
guardian.start();
