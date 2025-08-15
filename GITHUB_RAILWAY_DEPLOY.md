# 🚂 GitHub → Railway Deploy

## 1️⃣ GitHub'a Push

```bash
# Git init (eğer yoksa)
git init
git add .
git commit -m "🛡️ Raliux Guardian ready for Railway"
git branch -M main
git remote add origin https://github.com/yourusername/raliux-guardian.git
git push -u origin main
```

## 2️⃣ Railway Connect

1. Railway dashboard git
2. **New Project** → **Deploy from GitHub**
3. Bu repo'yu seç
4. **Environment Variables** ekle:

```env
NODE_ENV=production
PORT=$PORT
BLOCK_VPN_TOR=true
DASHBOARD_ENABLED=true
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_secure_password
MOBILE_API_TOKEN=mobile123
```

## 3️⃣ Deploy & Test

```bash
# Deploy olduktan sonra test et
curl https://your-guardian.railway.app/api/health

# Mobile API test
curl https://your-guardian.railway.app/mobile-api/health?token=mobile123
```

## 4️⃣ URL'ini Al

Railway sana public URL verecek:
```
https://raliux-guardian-production.up.railway.app
```

Bu URL'i kendi sitende guardian middleware'de kullan!

---

## 📱 Mobile App Endpoints

### Log İzleme
```
GET /mobile-api/logs?token=mobile123&limit=100
GET /mobile-api/stats?token=mobile123
GET /mobile-api/live?token=mobile123  (Server-Sent Events)
GET /mobile-api/health?token=mobile123
```

### Örnek Mobile API Response
```json
{
  "success": true,
  "data": {
    "totalRequests": 15420,
    "blockedRequests": 342,
    "blockRate": 2,
    "topCountries": [
      {"country": "US", "count": 8450},
      {"country": "TR", "count": 2100}
    ]
  }
}
```

Bu API'yi mobil uygulamanda kullanıp real-time logları izleyebilirsin! 📲
