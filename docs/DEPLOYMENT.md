# Deployment Guide

Production deployment instructions for various platforms.

## Table of Contents
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Deployment Steps](#deployment-steps)
- [Platform-Specific Guides](#platform-specific-guides)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)
- [Rollback](#rollback)

## Pre-Deployment Checklist

Before deploying to production:

- [ ] Update version in `package.json`
- [ ] Run all tests: `npm run test`
- [ ] Check for TypeScript errors: `npm run build`
- [ ] Set secure `JWT_SECRET` in `.env`
- [ ] Configure `DATABASE_URL` for production database
- [ ] Set `NODE_ENV=production`
- [ ] Update `VITE_API_URL` to production backend URL
- [ ] Review environment variables in `.env`
- [ ] Run security audit: `npm audit`
- [ ] Backup production database
- [ ] Notify team members

## Deployment Steps

### 1. Build Applications

```bash
# Install dependencies
npm install

# Build backend
cd backend
npm run build
# Output: backend/dist/

# Build frontend
cd frontend
npm run build
# Output: frontend/dist/
```

### 2. Start Backend

```bash
cd backend

# Set environment
export NODE_ENV=production
export PORT=4000
export DATABASE_URL="postgres://user:pass@prod-host:5432/wmsu_hr"
export JWT_SECRET="your-secure-random-secret"

# Start server
npm start

# Should log:
# ✓ Database connection successful
# ✓ Server running on port 4000
```

### 3. Deploy Frontend

**Option A: Serve with Express (simple)**
```bash
# Already in backend, add static middleware:
app.use(express.static("../frontend/dist"));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});
```

**Option B: Separate web server (nginx)**
```nginx
server {
  listen 80;
  server_name yourdomain.com;

  root /var/www/wmsu-hrmo-tracker/frontend/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api {
    proxy_pass http://localhost:4000;
  }
}
```

### 4. Verify Deployment

```bash
# Check backend is running
curl http://localhost:4000/api/auth/login

# Check frontend loads
curl http://yourdomain.com

# Check database connection
curl http://localhost:4000/api/health
```

## Platform-Specific Guides

### Heroku

```bash
# 1. Create app
heroku create wmsu-hrmo-tracker

# 2. Add PostgreSQL
heroku addons:create heroku-postgresql:standard-0

# 3. Set environment variables
heroku config:set JWT_SECRET="your-secret"
heroku config:set NODE_ENV="production"

# 4. Add Procfile to root:
web: cd backend && npm run build && npm start

# 5. Deploy
git push heroku main

# 6. Check logs
heroku logs --tail
```

### Railway.app (Recommended for simplicity)

```bash
# 1. Connect GitHub repo
# - Go to railway.app
# - Create project
# - Select GitHub repo

# 2. Add PostgreSQL plugin

# 3. Set environment variables in Dashboard:
NODE_ENV=production
JWT_SECRET=your-secret
DATABASE_URL=(auto-populated)

# 4. Deploy automatically on git push
```

### AWS (EC2 + RDS)

```bash
# 1. Launch EC2 instance
# - t3.medium or larger
# - Ubuntu 22.04
# - Security group: ports 80, 443, 4000

# 2. SSH into instance
ssh -i key.pem ubuntu@your-instance-ip

# 3. Install dependencies
sudo apt update
sudo apt install -y nodejs npm postgresql-client
node --version  # Verify

# 4. Clone repository
git clone <repo-url>
cd wmsu-hrmo-tracker

# 5. Install and build
npm install
npm run build

# 6. Create backend/.env
JWT_SECRET="your-secret"
DATABASE_URL="postgresql://user:pass@rds-endpoint:5432/wmsu_hr"

# 7. Use PM2 for process management
npm install -g pm2
pm2 start "npm start" --name "wmsu-hr-backend"
pm2 startup
pm2 save

# 8. Configure nginx reverse proxy
sudo apt install -y nginx

# 9. Create nginx config (see below)

# 10. Enable HTTPS with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly -d yourdomain.com
```

**Nginx Config for AWS:**
```nginx
upstream backend {
  server localhost:4000;
}

server {
  listen 80;
  server_name yourdomain.com;

  root /home/ubuntu/wmsu-hrmo-tracker/frontend/dist;
  index index.html;

  location /api {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### DigitalOcean (App Platform)

```bash
# 1. Connect GitHub repo via DigitalOcean dashboard
# 2. Automatic build and deploy on push
# 3. Add environment variables in dashboard
# 4. Configure database connection
```

### Docker Deployment

**Dockerfile (root):**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy both backend and frontend
COPY . .

# Build
RUN npm install
RUN cd backend && npm run build
RUN cd frontend && npm run build

# Expose port
EXPOSE 4000

# Start backend
CMD ["npm", "start"]
```

**Deploy:**
```bash
docker build -t wmsu-hrmo-tracker .
docker run -p 4000:4000 -e DATABASE_URL="..." wmsu-hrmo-tracker
```

## Post-Deployment

### Database Migration

If schema changed:
```bash
# Backup existing data
pg_dump wmsu_hr_connect > backup.sql

# Run migration (should be automatic on server start)
npm run db:migrate  # If migration command exists

# Or manually update schema in db.ts and restart
```

### Verify Features

Test in production:
- [ ] Login with admin account
- [ ] Create a job vacancy
- [ ] Archive a job (if closing date passed)
- [ ] Update archive duration setting
- [ ] Restore an archived job
- [ ] Check audit logs
- [ ] Test email notifications (if configured)

### Set Up Monitoring

```bash
# PM2 monitoring
pm2 web                    # Dashboard on :9615
pm2 monit                  # Terminal monitoring

# Application monitoring
npm install pm2-plus       # APM service
pm2 install pm2-auto-pull  # Auto deployment
```

### Set Up Backup

**PostgreSQL Automated Backup:**
```bash
# Daily backup script
cat > /home/ubuntu/backup-db.sh << 'EOF'
#!/bin/bash
pg_dump $DATABASE_URL > /backups/wmsu-hr-$(date +%Y%m%d).sql
# Upload to S3 or other storage
EOF

chmod +x /home/ubuntu/backup-db.sh

# Add to crontab (3 AM daily)
0 3 * * * /home/ubuntu/backup-db.sh
```

## Monitoring

### Health Checks

```bash
# Basic health endpoint (add to backend if needed)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});
```

### Logs

```bash
# Backend logs
pm2 logs wmsu-hr-backend

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u nginx -f
```

### Performance Monitoring

```bash
# CPU and memory
top
htop

# Disk space
df -h

# Database performance
psql -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

## Rollback

### Quick Rollback

```bash
# If using git
git revert HEAD
npm run build
pm2 restart all

# Or redeploy previous version
git checkout <previous-commit>
npm run build
pm2 restart all
```

### Restore from Backup

```bash
# Restore database
psql wmsu_hr_connect < backup.sql

# Restart application
pm2 restart wmsu-hr-backend
```

---

**Status**: ✅ Ready for production deployment

**Remember**: Test in staging before production!
