const geoip = require('geoip-lite');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const torService = require('./tor-service');
const logger = require('../utils/logger');

class IPAnalyzer {
    constructor() {
        this.vpnRanges = new Set();
        this.suspiciousASNs = new Set([
            'AS13335', // Cloudflare
            'AS15169', // Google
            'AS16509', // Amazon
            'AS20473', // Choopa/Vultr
            'AS14061', // DigitalOcean
            'AS395747' // Yandex Cloud
        ]);
    }

    async initialize() {
        try {
            await this.loadVPNRanges();
            logger.info('IP Analyzer initialized with VPN/Proxy ranges');
        } catch (error) {
            logger.warn('Could not load VPN ranges:', error.message);
        }
    }

    async analyzeIP(ip, userAgent = '') {
        try {
            const analysis = {
                ip,
                isBlocked: false,
                reason: null,
                riskScore: 0,
                details: {},
                checks: {
                    geoip: false,
                    tor: false,
                    vpn: false,
                    userAgent: false,
                    reputation: false
                }
            };

            // 1. GeoIP Analizi
            await this.analyzeGeoIP(ip, analysis);
            
            // 2. Tor Exit Node Kontrolü
            await this.checkTorExitNode(ip, analysis);
            
            // 3. VPN/Proxy Kontrolü
            await this.checkVPNProxy(ip, analysis);
            
            // 4. User Agent Analizi
            this.analyzeUserAgent(userAgent, analysis);
            
            // 5. IP Reputation Kontrolü
            if (process.env.ABUSEIPDB_KEY) {
                await this.checkIPReputation(ip, analysis);
            }

            // Risk skoru hesapla
            this.calculateRiskScore(analysis);
            
            // Blok kararı ver
            this.makeBlockDecision(analysis);

            return analysis;

        } catch (error) {
            logger.error('IP analysis error:', error);
            return {
                ip,
                isBlocked: true,
                reason: 'ANALYSIS_ERROR',
                riskScore: 100,
                details: { error: 'Analysis failed' }
            };
        }
    }

    async analyzeGeoIP(ip, analysis) {
        try {
            const geo = geoip.lookup(ip);
            if (geo) {
                analysis.details.country = geo.country;
                analysis.details.region = geo.region;
                analysis.details.city = geo.city;
                analysis.details.timezone = geo.timezone;
                analysis.checks.geoip = true;

                // Riskli ülkeler
                const riskyCountries = ['CN', 'RU', 'KP', 'IR'];
                if (riskyCountries.includes(geo.country)) {
                    analysis.riskScore += 30;
                    analysis.details.riskyCountry = true;
                }
            }
        } catch (error) {
            logger.warn('GeoIP lookup failed:', error.message);
        }
    }

    async checkTorExitNode(ip, analysis) {
        try {
            const isTor = await torService.isTorExitNode(ip);
            analysis.details.isTor = isTor;
            analysis.checks.tor = true;

            if (isTor && process.env.BLOCK_VPN_TOR === 'true') {
                analysis.riskScore += 80;
                analysis.details.torBlocked = true;
            }
        } catch (error) {
            logger.warn('Tor check failed:', error.message);
        }
    }

    async checkVPNProxy(ip, analysis) {
        try {
            // IP-API.com kullanarak VPN/Proxy kontrolü
            if (process.env.IPAPI_KEY) {
                const response = await axios.get(`http://ip-api.com/json/${ip}?fields=proxy,hosting`, {
                    timeout: 3000
                });

                if (response.data) {
                    analysis.details.isProxy = response.data.proxy;
                    analysis.details.isHosting = response.data.hosting;
                    analysis.checks.vpn = true;

                    if ((response.data.proxy || response.data.hosting) && 
                        process.env.BLOCK_VPN_TOR === 'true') {
                        analysis.riskScore += 60;
                        analysis.details.vpnBlocked = true;
                    }
                }
            }
        } catch (error) {
            logger.warn('VPN check failed:', error.message);
        }
    }

    analyzeUserAgent(userAgent, analysis) {
        try {
            const parser = new UAParser(userAgent);
            const result = parser.getResult();
            
            analysis.details.browser = result.browser;
            analysis.details.os = result.os;
            analysis.details.device = result.device;
            analysis.checks.userAgent = true;

            // Şüpheli User Agent kontrolleri
            if (!userAgent || userAgent.length < 10) {
                analysis.riskScore += 20;
                analysis.details.suspiciousUA = 'Empty or too short';
            }

            // Bot tespit
            const botPatterns = [
                /bot/i, /crawler/i, /spider/i, /scraper/i, 
                /curl/i, /wget/i, /python/i, /java/i
            ];
            
            if (botPatterns.some(pattern => pattern.test(userAgent))) {
                analysis.riskScore += 15;
                analysis.details.possibleBot = true;
            }

        } catch (error) {
            logger.warn('User Agent analysis failed:', error.message);
        }
    }

    async checkIPReputation(ip, analysis) {
        try {
            const response = await axios.get(
                `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`,
                {
                    headers: {
                        'Key': process.env.ABUSEIPDB_KEY,
                        'Accept': 'application/json'
                    },
                    timeout: 5000
                }
            );

            if (response.data && response.data.data) {
                const { abuseConfidencePercentage, isWhitelisted, countryCode } = response.data.data;
                
                analysis.details.abuseConfidence = abuseConfidencePercentage;
                analysis.details.isWhitelisted = isWhitelisted;
                analysis.checks.reputation = true;

                if (abuseConfidencePercentage > 25) {
                    analysis.riskScore += Math.min(abuseConfidencePercentage, 50);
                    analysis.details.badReputation = true;
                }
            }
        } catch (error) {
            logger.warn('IP reputation check failed:', error.message);
        }
    }

    calculateRiskScore(analysis) {
        // Risk skoru 0-100 arası
        analysis.riskScore = Math.min(analysis.riskScore, 100);
        
        if (analysis.riskScore >= 70) {
            analysis.details.riskLevel = 'HIGH';
        } else if (analysis.riskScore >= 40) {
            analysis.details.riskLevel = 'MEDIUM';
        } else {
            analysis.details.riskLevel = 'LOW';
        }
    }

    makeBlockDecision(analysis) {
        const strictMode = process.env.STRICT_MODE === 'true';
        const threshold = strictMode ? 40 : 70;

        if (analysis.riskScore >= threshold) {
            analysis.isBlocked = true;
            
            if (analysis.details.isTor) {
                analysis.reason = 'TOR_EXIT_NODE';
            } else if (analysis.details.vpnBlocked) {
                analysis.reason = 'VPN_PROXY_DETECTED';
            } else if (analysis.details.badReputation) {
                analysis.reason = 'BAD_IP_REPUTATION';
            } else {
                analysis.reason = 'HIGH_RISK_SCORE';
            }
        }
    }

    async loadVPNRanges() {
        // VPN/Proxy IP aralıklarını yükle (ücretsiz kaynaklardan)
        try {
            const response = await axios.get(
                'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/ipv4.txt',
                { timeout: 10000 }
            );
            
            if (response.data) {
                const ranges = response.data.split('\n').filter(line => line.trim());
                ranges.forEach(range => this.vpnRanges.add(range.trim()));
                logger.info(`Loaded ${ranges.length} VPN IP ranges`);
            }
        } catch (error) {
            logger.warn('Could not load VPN ranges from external source');
        }
    }
}

module.exports = new IPAnalyzer();
