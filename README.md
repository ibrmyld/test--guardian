# 🛡️ Raliux Guardian

Enterprise-grade IP protection service that blocks malicious traffic in real-time.

## Quick Start

```bash
# 1. Set your license key
export LICENSE_KEY="your_license_key_here"

# 2. Run installer
curl -sSL https://install.raliux.com/guardian | bash

# 3. Test
curl http://localhost:9000/health
```

Guardian will be running at `http://localhost:9000`

---

## Integration Methods

### 1. Nginx Reverse Proxy (Recommended)

Most efficient for high-traffic applications. Guardian acts as auth service.

```nginx
upstream guardian {
    server localhost:9000;
}

upstream backend {
    server localhost:8080;
}

server {
    listen 80;
    
    # Guardian auth check
    location = /auth {
        internal;
        proxy_pass http://guardian/verify;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URI $request_uri;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Protected application
    location / {
        auth_request /auth;
        
        # Pass to backend if Guardian allows
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Handle Guardian blocks
        error_page 403 = @blocked;
    }

    location @blocked {
        return 403 "Access denied by Guardian";
    }
}
```

**Pros:** Ultra-fast, handles millions of requests  
**Cons:** Requires Nginx configuration

### 2. Backend Middleware

Direct integration into your application code.

```javascript
// Node.js/Express example
const express = require('express');
const axios = require('axios');

const app = express();

// Guardian middleware
async function guardianCheck(req, res, next) {
    try {
        const ip = req.ip || req.headers['x-forwarded-for'];
        const userAgent = req.headers['user-agent'];
        
        const response = await axios.get(`http://localhost:9000/verify`, {
            params: { ip, user_agent: userAgent }
        });
        
        if (response.status === 200) {
            next(); // Allow request
        } else {
            res.status(403).json({ error: 'Access denied' });
        }
    } catch (error) {
        // Fail-safe: allow request if Guardian is down
        next();
    }
}

// Apply to all routes
app.use(guardianCheck);

app.get('/', (req, res) => {
    res.json({ message: 'Protected by Guardian!' });
});

app.listen(8080);
```

**Pros:** Easy integration, language agnostic  
**Cons:** Adds latency to each request

### 3. Docker Compose (Backend + Guardian)

Run Guardian alongside your application stack.

```yaml
version: '3.8'

services:
  guardian:
    image: raliux/guardian:latest
    ports:
      - "9000:9000"
    environment:
      - LICENSE_KEY=${LICENSE_KEY}
      - NODE_ENV=production
    volumes:
      - ./guardian-config.yml:/app/guardian/config.yml
      - guardian-logs:/app/logs
    restart: unless-stopped

  backend:
    build: .
    ports:
      - "8080:8080"
    environment:
      - GUARDIAN_URL=http://guardian:9000
    depends_on:
      - guardian
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - guardian
      - backend
    restart: unless-stopped

volumes:
  guardian-logs:
```

**Pros:** Containerized, easy scaling  
**Cons:** Requires Docker knowledge

---

## Configuration

Guardian uses YAML configuration with environment variable substitution:

```yaml
guardian:
  port: 9000
  license_key: "${LICENSE_KEY}"

security:
  block_vpn_tor: true
  strict_mode: false
  risk_threshold: 70

logging:
  format: jsonl
  file: /app/logs/guardian.jsonl
  rotation: true
```

### Environment Variables

- `LICENSE_KEY` (required) - Your Guardian license
- `CFG_FILE` (optional) - Config file path (default: `/app/guardian/config.yml`)
- `PORT` (optional) - Service port (default: `9000`)

---

## API Reference

### Health Check
```bash
GET /health
```
Returns service status and statistics.

### Verify Request
```bash
GET /verify?ip=1.2.3.4&user_agent=Mozilla/5.0...
```
Returns `200` (allow) or `403` (block) with threat details.

---

## Monitoring

Guardian logs all events in JSONL format with automatic rotation:

```bash
# View live logs
tail -f /opt/guardian/logs/guardian.jsonl

# Parse logs with jq
tail -f /opt/guardian/logs/guardian.jsonl | jq 'select(.event == "block")'

# Count blocks by country
cat guardian.jsonl | jq -r 'select(.event == "block") | .country' | sort | uniq -c
```

### Log Events

- `request` - Each protection check
- `block` - When traffic is blocked  
- `startup` - Service initialization
- `list_update` - Threat database updates
- `error` - System errors

---

## Maintenance

### Update Threat Lists
```bash
./scripts/update_lists.sh
```

### Hot Reload Configuration
```bash
docker exec raliux-guardian kill -HUP 1
```

### View Container Logs
```bash
docker logs raliux-guardian --tail 100 -f
```

---

## Support

- **Documentation:** https://docs.raliux.com/guardian
- **Support:** support@raliux.com
- **Status Page:** https://status.raliux.com

---

## License

Commercial license required. Contact sales@raliux.com for pricing.

© 2024 Raliux. All rights reserved.