/**
 * Express.js Backend Entegrasyon Örneği
 * Raliux Web Guardian ile kolay entegrasyon
 */

const express = require('express');
const GuardianMiddleware = require('./guardian-middleware');

const app = express();

// Guardian middleware'i başlat
const guardian = new GuardianMiddleware({
    guardianUrl: process.env.GUARDIAN_URL || 'https://your-guardian-service.railway.app',
    timeout: 5000,
    cache: true,
    cacheTTL: 300000 // 5 dakika
});

// JSON parsing
app.use(express.json());

// Guardian middleware'i tüm route'lara uygula
app.use(guardian.middleware());

// API route'ları
app.get('/api/users', (req, res) => {
    // req.guardian objesi Guardian analiz sonuçlarını içerir
    console.log('Guardian Analysis:', req.guardian);
    
    res.json({
        message: 'Users endpoint',
        guardian: req.guardian,
        users: ['user1', 'user2']
    });
});

app.post('/api/login', (req, res) => {
    // Login endpoint - Guardian korumalı
    res.json({
        message: 'Login successful',
        riskScore: req.guardian.riskScore
    });
});

// Sadece belirli route'ları koruma
app.get('/api/public', (req, res) => {
    res.json({ message: 'Public endpoint - Guardian korumasız' });
});

// Admin endpoints - sadece düşük risk skorlu IP'ler
app.use('/api/admin', (req, res, next) => {
    if (req.guardian && req.guardian.riskScore > 30) {
        return res.status(403).json({
            error: 'Admin access requires low risk score',
            riskScore: req.guardian.riskScore
        });
    }
    next();
});

app.get('/api/admin/stats', (req, res) => {
    res.json({
        message: 'Admin stats',
        guardianStats: guardian.getStats()
    });
});

// Guardian stats endpoint
app.get('/api/guardian/stats', (req, res) => {
    res.json(guardian.getStats());
});

// Guardian cache temizleme
app.post('/api/guardian/clear-cache', (req, res) => {
    guardian.clearCache();
    res.json({ message: 'Guardian cache cleared' });
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`🛡️ Guardian protection: ${guardian.guardianUrl}`);
});
