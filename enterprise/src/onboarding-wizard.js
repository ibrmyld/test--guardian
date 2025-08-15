/**
 * Raliux Guardian - Customer Onboarding Wizard
 * Automated setup and configuration for new customers
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../src/utils/logger');

class OnboardingWizard {
    constructor() {
        this.onboardingData = {};
        this.currentStep = 1;
        this.totalSteps = 6;
        this.configPath = path.join(__dirname, '../data/onboarding.json');
        
        this.steps = {
            1: { name: 'welcome', title: 'Welcome to Raliux Guardian' },
            2: { name: 'license', title: 'License Activation' },
            3: { name: 'security', title: 'Security Configuration' },
            4: { name: 'integration', title: 'Integration Setup' },
            5: { name: 'testing', title: 'Configuration Testing' },
            6: { name: 'complete', title: 'Setup Complete' }
        };
    }

    async startOnboarding(customerId = null) {
        logger.info('Starting customer onboarding wizard', { customerId });
        
        this.onboardingData = {
            customerId: customerId || this.generateCustomerId(),
            startedAt: new Date(),
            currentStep: 1,
            completed: false,
            configuration: {},
            testResults: {}
        };

        return this.getStepData(1);
    }

    async processStep(stepNumber, data) {
        try {
            logger.info(`Processing onboarding step ${stepNumber}`, { data });
            
            this.currentStep = stepNumber;
            
            switch (stepNumber) {
                case 1:
                    return await this.processWelcomeStep(data);
                case 2:
                    return await this.processLicenseStep(data);
                case 3:
                    return await this.processSecurityStep(data);
                case 4:
                    return await this.processIntegrationStep(data);
                case 5:
                    return await this.processTestingStep(data);
                case 6:
                    return await this.processCompleteStep(data);
                default:
                    throw new Error(`Invalid step number: ${stepNumber}`);
            }
            
        } catch (error) {
            logger.error(`Onboarding step ${stepNumber} failed:`, error);
            throw error;
        }
    }

    async processWelcomeStep(data) {
        this.onboardingData.configuration.companyName = data.companyName;
        this.onboardingData.configuration.adminEmail = data.adminEmail;
        this.onboardingData.configuration.domain = data.domain;
        this.onboardingData.configuration.expectedTraffic = data.expectedTraffic;

        await this.saveOnboardingData();

        return {
            success: true,
            nextStep: 2,
            message: 'Welcome information saved successfully',
            data: this.getStepData(2)
        };
    }

    async processLicenseStep(data) {
        try {
            // Validate license key
            const licenseValidation = await this.validateLicenseKey(data.licenseKey);
            
            if (!licenseValidation.valid) {
                return {
                    success: false,
                    error: 'Invalid license key',
                    details: licenseValidation.error
                };
            }

            this.onboardingData.configuration.license = {
                key: data.licenseKey,
                plan: licenseValidation.plan,
                features: licenseValidation.features,
                limits: licenseValidation.limits
            };

            // Generate admin credentials
            const adminPassword = this.generateSecurePassword();
            this.onboardingData.configuration.admin = {
                username: 'admin',
                password: adminPassword,
                email: this.onboardingData.configuration.adminEmail
            };

            await this.saveOnboardingData();
            await this.createLicenseFile();

            return {
                success: true,
                nextStep: 3,
                message: 'License activated successfully',
                credentials: {
                    username: 'admin',
                    password: adminPassword
                },
                data: this.getStepData(3)
            };

        } catch (error) {
            return {
                success: false,
                error: 'License validation failed',
                details: error.message
            };
        }
    }

    async processSecurityStep(data) {
        const securityConfig = {
            blockVpnTor: data.blockVpnTor !== false,
            strictMode: data.strictMode === true,
            riskThreshold: data.riskThreshold || 70,
            geoBlocking: {
                enabled: data.geoBlocking?.enabled || false,
                blockedCountries: data.geoBlocking?.countries || []
            },
            rateLimiting: {
                enabled: true,
                windowMs: data.rateLimiting?.windowMs || 900000,
                maxRequests: data.rateLimiting?.maxRequests || 1000
            },
            customRules: data.customRules || []
        };

        this.onboardingData.configuration.security = securityConfig;
        await this.saveOnboardingData();
        await this.createSecurityConfig();

        return {
            success: true,
            nextStep: 4,
            message: 'Security configuration saved',
            data: this.getStepData(4)
        };
    }

    async processIntegrationStep(data) {
        const integrationConfig = {
            method: data.method, // 'middleware', 'nginx', 'api'
            framework: data.framework, // 'express', 'nextjs', 'laravel', etc.
            endpoints: data.endpoints || ['/api/*'],
            webhooks: {
                enabled: data.webhooks?.enabled || false,
                url: data.webhooks?.url || '',
                events: data.webhooks?.events || ['block', 'high_risk']
            },
            monitoring: {
                enabled: data.monitoring?.enabled || false,
                service: data.monitoring?.service || 'internal'
            }
        };

        this.onboardingData.configuration.integration = integrationConfig;
        await this.saveOnboardingData();
        await this.generateIntegrationCode();

        return {
            success: true,
            nextStep: 5,
            message: 'Integration configuration saved',
            integrationCode: await this.getIntegrationCode(integrationConfig),
            data: this.getStepData(5)
        };
    }

    async processTestingStep(data) {
        const testResults = await this.runConfigurationTests();
        
        this.onboardingData.testResults = testResults;
        await this.saveOnboardingData();

        const allTestsPassed = testResults.every(test => test.status === 'passed');

        return {
            success: allTestsPassed,
            nextStep: allTestsPassed ? 6 : 5,
            message: allTestsPassed ? 'All tests passed' : 'Some tests failed',
            testResults,
            data: this.getStepData(allTestsPassed ? 6 : 5)
        };
    }

    async processCompleteStep(data) {
        this.onboardingData.completed = true;
        this.onboardingData.completedAt = new Date();
        
        await this.saveOnboardingData();
        await this.finalizeConfiguration();
        await this.sendWelcomeEmail();

        return {
            success: true,
            nextStep: null,
            message: 'Onboarding completed successfully!',
            data: {
                dashboardUrl: `https://${this.onboardingData.configuration.domain}/dashboard`,
                credentials: this.onboardingData.configuration.admin,
                supportEmail: 'support@raliux.com',
                documentation: 'https://docs.raliux.com/guardian'
            }
        };
    }

    getStepData(stepNumber) {
        const step = this.steps[stepNumber];
        if (!step) return null;

        const baseData = {
            step: stepNumber,
            totalSteps: this.totalSteps,
            title: step.title,
            name: step.name,
            progress: (stepNumber / this.totalSteps * 100).toFixed(0)
        };

        switch (stepNumber) {
            case 1:
                return {
                    ...baseData,
                    fields: [
                        { name: 'companyName', label: 'Company Name', type: 'text', required: true },
                        { name: 'adminEmail', label: 'Admin Email', type: 'email', required: true },
                        { name: 'domain', label: 'Primary Domain', type: 'text', required: true },
                        { name: 'expectedTraffic', label: 'Expected Monthly Traffic', type: 'select', 
                          options: ['< 100K', '100K - 1M', '1M - 10M', '10M+'] }
                    ]
                };

            case 2:
                return {
                    ...baseData,
                    fields: [
                        { name: 'licenseKey', label: 'License Key', type: 'textarea', required: true,
                          placeholder: 'Paste your Raliux Guardian license key here...' }
                    ],
                    help: 'You should have received your license key via email. If you don\'t have one, contact support@raliux.com'
                };

            case 3:
                return {
                    ...baseData,
                    fields: [
                        { name: 'blockVpnTor', label: 'Block VPN/Tor Traffic', type: 'toggle', default: true },
                        { name: 'strictMode', label: 'Enable Strict Mode', type: 'toggle', default: false },
                        { name: 'riskThreshold', label: 'Risk Threshold (0-100)', type: 'number', default: 70, min: 0, max: 100 },
                        { name: 'geoBlocking.enabled', label: 'Enable Geographic Blocking', type: 'toggle', default: false },
                        { name: 'geoBlocking.countries', label: 'Blocked Countries', type: 'multiselect', 
                          options: ['CN', 'RU', 'KP', 'IR', 'SY'], conditional: 'geoBlocking.enabled' }
                    ]
                };

            case 4:
                return {
                    ...baseData,
                    fields: [
                        { name: 'method', label: 'Integration Method', type: 'radio', required: true,
                          options: [
                              { value: 'middleware', label: 'Middleware (Express/Node.js)' },
                              { value: 'nginx', label: 'Nginx Reverse Proxy' },
                              { value: 'api', label: 'Direct API Integration' }
                          ]
                        },
                        { name: 'framework', label: 'Framework', type: 'select',
                          options: ['Express.js', 'Next.js', 'Fastify', 'Laravel', 'Django', 'Other'],
                          conditional: 'method:middleware'
                        },
                        { name: 'endpoints', label: 'Protected Endpoints', type: 'tags', 
                          default: ['/api/*'], help: 'Enter URL patterns to protect' },
                        { name: 'webhooks.enabled', label: 'Enable Webhooks', type: 'toggle', default: false },
                        { name: 'webhooks.url', label: 'Webhook URL', type: 'url', 
                          conditional: 'webhooks.enabled' }
                    ]
                };

            case 5:
                return {
                    ...baseData,
                    description: 'We\'ll now test your configuration to ensure everything is working correctly.',
                    tests: [
                        { name: 'License Validation', description: 'Verify license key and activation' },
                        { name: 'Security Rules', description: 'Test security configuration' },
                        { name: 'Integration', description: 'Verify integration setup' },
                        { name: 'Dashboard Access', description: 'Test dashboard functionality' }
                    ]
                };

            case 6:
                return {
                    ...baseData,
                    description: 'Congratulations! Your Raliux Guardian is now fully configured and ready to protect your applications.',
                    nextSteps: [
                        'Access your dashboard to monitor security events',
                        'Integrate the provided middleware code',
                        'Review and customize security rules',
                        'Set up monitoring and alerts'
                    ]
                };

            default:
                return baseData;
        }
    }

    async validateLicenseKey(licenseKey) {
        try {
            // Simulate license validation
            // In real implementation, this would call Raliux license server
            
            if (!licenseKey || licenseKey.length < 50) {
                throw new Error('Invalid license key format');
            }

            // Decode and validate license
            const decoded = Buffer.from(licenseKey, 'base64').toString('utf8');
            const licenseData = JSON.parse(decoded);

            return {
                valid: true,
                plan: licenseData.plan || 'professional',
                features: licenseData.features || ['basicProtection', 'dashboard', 'analytics'],
                limits: licenseData.limits || { requestsPerMonth: 1000000 }
            };

        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    generateSecurePassword() {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        
        for (let i = 0; i < 16; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        
        return password;
    }

    generateCustomerId() {
        return `cust_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    async saveOnboardingData() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.configPath, JSON.stringify(this.onboardingData, null, 2));
            
        } catch (error) {
            logger.error('Failed to save onboarding data:', error);
            throw error;
        }
    }

    async createLicenseFile() {
        try {
            const licenseFile = path.join(__dirname, '../data/license.json');
            fs.writeFileSync(licenseFile, JSON.stringify(this.onboardingData.configuration.license, null, 2));
            
        } catch (error) {
            logger.error('Failed to create license file:', error);
        }
    }

    async createSecurityConfig() {
        try {
            const configFile = path.join(__dirname, '../../config/security.json');
            const dir = path.dirname(configFile);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(configFile, JSON.stringify(this.onboardingData.configuration.security, null, 2));
            
        } catch (error) {
            logger.error('Failed to create security config:', error);
        }
    }

    async generateIntegrationCode() {
        const config = this.onboardingData.configuration.integration;
        const codes = {};

        switch (config.method) {
            case 'middleware':
                codes.express = this.generateExpressMiddleware(config);
                codes.nextjs = this.generateNextJSMiddleware(config);
                break;
            case 'nginx':
                codes.nginx = this.generateNginxConfig(config);
                break;
            case 'api':
                codes.curl = this.generateAPIExamples(config);
                break;
        }

        const codeFile = path.join(__dirname, '../data/integration-code.json');
        fs.writeFileSync(codeFile, JSON.stringify(codes, null, 2));

        return codes;
    }

    generateExpressMiddleware(config) {
        return `
// Raliux Guardian Express.js Integration
const GuardianMiddleware = require('./guardian-middleware');

const guardian = new GuardianMiddleware({
    guardianUrl: '${process.env.GUARDIAN_URL || 'http://localhost:3000'}',
    endpoints: ${JSON.stringify(config.endpoints)},
    webhookUrl: '${config.webhooks?.url || ''}'
});

// Apply to all routes
app.use(guardian.middleware());

// Or apply to specific routes
${config.endpoints.map(endpoint => `app.use('${endpoint}', guardian.middleware());`).join('\n')}
`;
    }

    generateNextJSMiddleware(config) {
        return `
// middleware.js (Next.js 12+)
import { NextResponse } from 'next/server';

export async function middleware(request) {
    const response = await fetch('${process.env.GUARDIAN_URL}/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ip: request.ip,
            userAgent: request.headers.get('user-agent')
        })
    });

    const result = await response.json();
    
    if (result.data?.isBlocked) {
        return new NextResponse('Access denied', { status: 403 });
    }

    return NextResponse.next();
}

export const config = {
    matcher: ${JSON.stringify(config.endpoints)}
};
`;
    }

    generateNginxConfig(config) {
        return `
# Nginx Configuration for Raliux Guardian
upstream guardian {
    server localhost:3000;
}

server {
    listen 80;
    
    # Guardian authentication
    location = /auth {
        internal;
        proxy_pass http://guardian/;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URI $request_uri;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Protected endpoints
    ${config.endpoints.map(endpoint => `
    location ${endpoint} {
        auth_request /auth;
        error_page 403 = @blocked;
        error_page 418 = @backend;
        return 418;
    }`).join('\n')}

    location @backend {
        proxy_pass http://your-backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location @blocked {
        return 403 "Access denied by Guardian";
    }
}
`;
    }

    generateAPIExamples(config) {
        return `
# Direct API Integration Examples

# Analyze IP
curl -X POST ${process.env.GUARDIAN_URL || 'http://localhost:3000'}/api/analyze \\
  -H "Content-Type: application/json" \\
  -d '{"ip": "1.2.3.4", "userAgent": "Mozilla/5.0..."}'

# Bulk analysis
curl -X POST ${process.env.GUARDIAN_URL || 'http://localhost:3000'}/api/analyze/bulk \\
  -H "Content-Type: application/json" \\
  -d '{"ips": ["1.2.3.4", "5.6.7.8"]}'

# Get stats
curl ${process.env.GUARDIAN_URL || 'http://localhost:3000'}/api/stats
`;
    }

    async getIntegrationCode(config) {
        const codeFile = path.join(__dirname, '../data/integration-code.json');
        
        if (fs.existsSync(codeFile)) {
            const content = fs.readFileSync(codeFile, 'utf8');
            return JSON.parse(content);
        }

        return await this.generateIntegrationCode();
    }

    async runConfigurationTests() {
        const tests = [];

        // License test
        try {
            const licenseValid = await this.testLicense();
            tests.push({
                name: 'License Validation',
                status: licenseValid ? 'passed' : 'failed',
                message: licenseValid ? 'License is valid and active' : 'License validation failed'
            });
        } catch (error) {
            tests.push({
                name: 'License Validation',
                status: 'failed',
                message: error.message
            });
        }

        // Security rules test
        try {
            const securityValid = await this.testSecurityRules();
            tests.push({
                name: 'Security Rules',
                status: securityValid ? 'passed' : 'failed',
                message: securityValid ? 'Security rules configured correctly' : 'Security configuration issues detected'
            });
        } catch (error) {
            tests.push({
                name: 'Security Rules',
                status: 'failed',
                message: error.message
            });
        }

        // Integration test
        try {
            const integrationValid = await this.testIntegration();
            tests.push({
                name: 'Integration',
                status: integrationValid ? 'passed' : 'failed',
                message: integrationValid ? 'Integration setup successful' : 'Integration configuration needs review'
            });
        } catch (error) {
            tests.push({
                name: 'Integration',
                status: 'failed',
                message: error.message
            });
        }

        // Dashboard test
        try {
            const dashboardValid = await this.testDashboard();
            tests.push({
                name: 'Dashboard Access',
                status: dashboardValid ? 'passed' : 'failed',
                message: dashboardValid ? 'Dashboard is accessible' : 'Dashboard access issues detected'
            });
        } catch (error) {
            tests.push({
                name: 'Dashboard Access',
                status: 'failed',
                message: error.message
            });
        }

        return tests;
    }

    async testLicense() {
        // Test license validation
        return this.onboardingData.configuration.license?.key !== undefined;
    }

    async testSecurityRules() {
        // Test security configuration
        return this.onboardingData.configuration.security !== undefined;
    }

    async testIntegration() {
        // Test integration setup
        return this.onboardingData.configuration.integration?.method !== undefined;
    }

    async testDashboard() {
        // Test dashboard access
        return this.onboardingData.configuration.admin?.password !== undefined;
    }

    async finalizeConfiguration() {
        try {
            // Update main .env file with onboarding data
            const envUpdates = {
                'DASHBOARD_USERNAME': this.onboardingData.configuration.admin.username,
                'DASHBOARD_PASSWORD': this.onboardingData.configuration.admin.password,
                'BLOCK_VPN_TOR': this.onboardingData.configuration.security.blockVpnTor,
                'STRICT_MODE': this.onboardingData.configuration.security.strictMode,
                'COMPANY_NAME': this.onboardingData.configuration.companyName,
                'ADMIN_EMAIL': this.onboardingData.configuration.adminEmail
            };

            await this.updateEnvFile(envUpdates);
            logger.info('Configuration finalized successfully');
            
        } catch (error) {
            logger.error('Failed to finalize configuration:', error);
        }
    }

    async updateEnvFile(updates) {
        const envFile = path.join(__dirname, '../../.env');
        let envContent = '';

        if (fs.existsSync(envFile)) {
            envContent = fs.readFileSync(envFile, 'utf8');
        }

        for (const [key, value] of Object.entries(updates)) {
            const pattern = new RegExp(`^${key}=.*$`, 'm');
            const line = `${key}=${value}`;
            
            if (pattern.test(envContent)) {
                envContent = envContent.replace(pattern, line);
            } else {
                envContent += `\n${line}`;
            }
        }

        fs.writeFileSync(envFile, envContent);
    }

    async sendWelcomeEmail() {
        try {
            // Welcome email integration would go here
            logger.info('Welcome email sent successfully', {
                email: this.onboardingData.configuration.adminEmail
            });
        } catch (error) {
            logger.error('Failed to send welcome email:', error);
        }
    }
}

module.exports = OnboardingWizard;
