const axios = require('axios');
const logger = require('../utils/logger');

class TorService {
    constructor() {
        this.torExitNodes = new Set();
        this.lastUpdate = null;
        this.updateInterval = 3600000; // 1 saat
    }

    async isTorExitNode(ip) {
        try {
            // Exit node listesi güncel değilse güncelle
            if (!this.lastUpdate || Date.now() - this.lastUpdate > this.updateInterval) {
                await this.updateTorExitNodes();
            }
            
            return this.torExitNodes.has(ip);
        } catch (error) {
            logger.warn('Tor exit node check failed:', error.message);
            return false;
        }
    }

    async updateTorExitNodes() {
        try {
            logger.info('Updating Tor exit node list...');
            
            // Tor Project'in resmi exit node listesi
            const response = await axios.get(
                'https://check.torproject.org/torbulkexitlist',
                { 
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Raliux-Guardian/1.0'
                    }
                }
            );

            if (response.data) {
                const exitNodes = response.data
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));

                this.torExitNodes.clear();
                exitNodes.forEach(ip => this.torExitNodes.add(ip));
                
                this.lastUpdate = Date.now();
                logger.info(`Updated Tor exit nodes: ${exitNodes.length} nodes loaded`);
            }
        } catch (error) {
            logger.error('Failed to update Tor exit nodes:', error.message);
            
            // Fallback - önceden yüklenmiş bir liste kullan
            await this.loadFallbackExitNodes();
        }
    }

    async loadFallbackExitNodes() {
        try {
            // GitHub'dan yedek liste
            const response = await axios.get(
                'https://raw.githubusercontent.com/SecOps-Institute/Tor-IP-Addresses/master/tor-exit-nodes.lst',
                { timeout: 10000 }
            );

            if (response.data) {
                const exitNodes = response.data
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));

                exitNodes.forEach(ip => this.torExitNodes.add(ip));
                this.lastUpdate = Date.now();
                
                logger.info(`Loaded fallback Tor exit nodes: ${exitNodes.length} nodes`);
            }
        } catch (error) {
            logger.warn('Could not load fallback Tor exit nodes:', error.message);
            
            // En son çare - hardcoded birkaç bilinen exit node
            this.loadHardcodedExitNodes();
        }
    }

    loadHardcodedExitNodes() {
        const knownExitNodes = [
            '199.87.154.255',
            '104.244.76.13',
            '185.220.101.1',
            '199.195.249.84',
            '185.220.100.240'
        ];
        
        knownExitNodes.forEach(ip => this.torExitNodes.add(ip));
        this.lastUpdate = Date.now();
        
        logger.info('Loaded hardcoded Tor exit nodes as fallback');
    }

    getExitNodeCount() {
        return this.torExitNodes.size;
    }

    getLastUpdateTime() {
        return this.lastUpdate;
    }
}

module.exports = new TorService();
