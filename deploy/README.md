# Owner Trading - Production Deployment Guide

This folder contains deployment artifacts and instructions for deploying the Owner Trading application on an Ubuntu server.

**Important:** Never commit `.env` files or secrets to Git. All secrets must be provided separately on the production server.

---

## Prerequisites

### System Requirements
- Ubuntu 20.04 LTS or later
- At least 2GB RAM, 10GB disk space
- Sudo access on the server

### Verify System

```bash
# Check Python version (must be 3.9 or later)
python3 --version

# Check Node.js version (must be 14.0+ or later)
node --version
npm --version

# Check that MongoDB is available
# If local: sudo systemctl status mongodb or systemctl status mongod
# If remote: verify connection string is correct
```

---

## Step 0: Pre-Deployment Preparation

### 0.1 - Prepare deployment directory

```bash
# Clone repository or pull latest code (on server)
cd /home/ubuntu
git clone <repository-url> owner-trading
cd owner-trading
```

### 0.2 - Set proper permissions

```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/owner-trading
chmod 755 /home/ubuntu/owner-trading
chmod 755 /home/ubuntu/owner-trading/backend
chmod 755 /home/ubuntu/owner-trading/frontend
```

---

## Step 1: OS Dependencies Installation

### 1.1 - Update package lists

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2 - Install required OS packages

```bash
# Python development
sudo apt install -y python3-dev python3-venv python3-pip

# Nginx web server
sudo apt install -y nginx

# Build tools (for Python packages with C extensions)
sudo apt install -y build-essential

# Curl (for health checks)
sudo apt install -y curl

# jq (optional, for JSON parsing in health checks)
sudo apt install -y jq
```

### 1.3 - Verify MongoDB availability

**If using local MongoDB:**
```bash
sudo apt install -y mongodb

# Start and enable MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Verify connection
mongosh --eval "db.adminCommand('ping')"
```

**If using remote MongoDB:**
- Verify MongoDB URL in environment variables (MONGO_URL)
- Ensure network connectivity to MongoDB server

---

## Step 2: Backend Setup

### 2.1 - Create and activate Python virtual environment

```bash
cd /home/ubuntu/owner-trading/backend

# Create virtual environment
python3 -m venv /home/ubuntu/owner-trading/.venv

# Activate it
source /home/ubuntu/owner-trading/.venv/bin/activate

# Verify activation
which python
python --version  # Should be 3.9+
```

### 2.2 - Install Python dependencies

```bash
# Ensure pip is up to date
pip install --upgrade pip setuptools wheel

# Install all backend requirements
pip install -r requirements.txt

# Verify key packages installed
pip show fastapi motor uvicorn
```

### 2.3 - Configure backend environment

```bash
# Create backend environment file with production secrets
# NEVER commit this file to Git

sudo nano /home/ubuntu/owner-trading/backend/.env

# Required variables (example values):
# MONGO_URL="mongodb://localhost:27017"
# DB_NAME="owner_trading_db"
# JWT_SECRET="<generate-secure-random-value>"
# ENCRYPTION_KEY="<generate-secure-random-value>"
# OWNER_USERNAME="admin"
# OWNER_PASSWORD="<set-strong-password>"
# OWNER_EMAIL="admin@example.com"
# FRONTEND_URL="https://your.domain.example"
# CORS_ORIGINS="https://your.domain.example"

# Secure permissions on .env file
chmod 600 /home/ubuntu/owner-trading/backend/.env

# Test backend starts successfully
cd /home/ubuntu/owner-trading/backend
/home/ubuntu/owner-trading/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000 --workers 1
# Press Ctrl+C to stop

# Health check (in another terminal)
curl http://127.0.0.1:8000/api/health
# Should return: {"ok": true, "database": true}
```

---

## Step 3: Frontend Setup

### 3.1 - Install Node.js

```bash
# Install Node.js (LTS version recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be 14.0+
npm --version
```

### 3.2 - Install frontend dependencies and build

```bash
cd /home/ubuntu/owner-trading/frontend

# Install dependencies
npm ci

# Verify .env is configured correctly
# IMPORTANT: frontend/.env must have REACT_APP_BACKEND_URL empty or unset
# This ensures the build uses /api proxy instead of hardcoding localhost:8000
cat .env

# Build production bundle
npm run build

# Verify build succeeded
ls -lh build/index.html
ls -lh build/static/js/main.*.js
```

### 3.3 - Verify production build is correct

```bash
# The production build should NOT contain "localhost:8000"
grep -r "localhost:8000" build/
# Should return: (no matches)
```

---

## Step 4: Nginx Configuration

### 4.1 - Install Nginx server block

```bash
# Copy configuration file
sudo cp /home/ubuntu/owner-trading/deploy/nginx/owner-trading.conf \
  /etc/nginx/sites-available/owner-trading

# Enable the site
sudo ln -s /etc/nginx/sites-available/owner-trading \
  /etc/nginx/sites-enabled/owner-trading

# Test Nginx configuration
sudo nginx -t
# Should output: nginx: the configuration file /etc/nginx/nginx.conf syntax is ok

# Reload Nginx
sudo systemctl reload nginx
```

### 4.2 - Start Nginx

```bash
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx
```

### 4.3 - Verify Nginx proxy

```bash
# Test reverse proxy to backend
curl http://127.0.0.1:8000/api/health
# Should return: {"ok": true, "database": true}

# Test via Nginx
curl http://localhost/api/health
# Should return: {"ok": true, "database": true}
```

---

## Step 5: Backend Systemd Service Setup

### 5.1 - Install systemd service

```bash
# IMPORTANT: Always use owner-trading-backend.service (canonical name)
# If an older owner-trading.service exists, remove it first:
sudo systemctl stop owner-trading 2>/dev/null || true
sudo rm -f /etc/systemd/system/owner-trading.service

# Install the correct service
sudo cp /home/ubuntu/owner-trading/deploy/systemd/owner-trading-backend.service \
  /etc/systemd/system/owner-trading-backend.service

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service for boot
sudo systemctl enable owner-trading-backend

# Start service
sudo systemctl start owner-trading-backend

# Check service status
sudo systemctl status owner-trading-backend
```

### 5.2 - Verify service logs

```bash
# View recent logs
journalctl -u owner-trading-backend -n 50

# Follow logs in real-time
journalctl -u owner-trading-backend -f
```

---

## Step 6: Health Checks

### 6.1 - Check backend health

```bash
# Via localhost (direct)
curl -s http://127.0.0.1:8000/api/health | jq

# Via Nginx (through reverse proxy)
curl -s http://localhost/api/health | jq

# Should return:
# {
#   "ok": true,
#   "database": true
# }
```

### 6.2 - Check frontend

```bash
# Verify index.html is served
curl -s http://localhost/ | head -20

# Should contain: <!DOCTYPE html>, <html>
```

### 6.3 - Check service is enabled for reboot

```bash
# List enabled services
sudo systemctl list-unit-files | grep owner-trading-backend
# Should show: owner-trading-backend.service  enabled

# Test service auto-restart on crash
sudo systemctl stop owner-trading-backend
sleep 3
sudo systemctl status owner-trading-backend
# Should show: running (restarted automatically)
```

---

## Step 7: SSL/TLS Configuration (Recommended)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate and update Nginx
sudo certbot --nginx -d your.domain.example

# Verify auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## Step 8: Firewall Configuration

```bash
# Enable ufw
sudo ufw enable

# Allow SSH (do this FIRST to avoid lockout)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct backend access
# (already bound to 127.0.0.1:8000, not exposed)

# View firewall status
sudo ufw status
```

---

## Post-Deployment Verification

### Full deployment checklist:

```bash
# 1. Check all services are running
sudo systemctl status nginx owner-trading-backend

# 2. Check no port 8000 exposure (backend is localhost-only)
sudo ss -tlnp | grep 8000
# Should show: 127.0.0.1:8000 (not 0.0.0.0:8000)

# 3. Check health endpoints
curl -s http://localhost/api/health | jq

# 4. Check frontend loads
curl -s http://localhost/ | grep -q "<!DOCTYPE html>" && echo "Frontend OK"

# 5. Check service survives reboot
sudo reboot
# After reboot:
sudo systemctl status owner-trading-backend
curl http://localhost/api/health
```

---

## Troubleshooting

### Backend service fails to start

```bash
# Check service logs
journalctl -u owner-trading-backend -n 100

# Common issues:
# - MongoDB not running: sudo systemctl start mongodb
# - Wrong .env variables: check /home/ubuntu/owner-trading/backend/.env
# - Port 8000 already in use: sudo lsof -i :8000
# - Python venv not activated in ExecStart
```

### Frontend shows 404 errors

```bash
# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Verify build folder exists and has content
ls -la /home/ubuntu/owner-trading/frontend/build/index.html

# Rebuild if needed
cd /home/ubuntu/owner-trading/frontend
npm run build
sudo systemctl reload nginx
```

### Backend API calls return 502 Bad Gateway

```bash
# Check Nginx can reach backend
curl http://127.0.0.1:8000/api/health

# Check Nginx configuration
sudo nginx -t
sudo systemctl reload nginx

# Check backend is running
sudo systemctl status owner-trading-backend
```

### MongoDB connection fails

```bash
# If using local MongoDB
sudo systemctl start mongodb
mongo --eval "db.adminCommand('ping')"

# If using remote MongoDB
# Verify MONGO_URL in /home/ubuntu/owner-trading/backend/.env
# Verify network connectivity to MongoDB server
nslookup your.mongodb.host
```

---

## Notes & Best Practices

- **Secrets Management**: Keep `.env` files outside Git. Use server-side configuration only.
- **Service Name**: Always use `owner-trading-backend.service` (not `owner-trading.service`) to avoid conflicts.
- **Python Versions**: Python 3.9+ required. Check with `python3 --version`.
- **Frontend Build**: Frontend `.env` must have empty `REACT_APP_BACKEND_URL` for production (uses `/api` proxy).
- **Permissions**: Backend `.env` should be readable only by service user: `chmod 600`.
- **Monitoring**: Monitor logs with `journalctl` to catch startup issues early.
- **Database**: Verify MongoDB is available (local or remote) before starting backend service.
- **Reboot Recovery**: Both Nginx and Owner Trading service should auto-start on reboot via systemd.
- **SSL Certificates**: Use Let's Encrypt + Certbot for automatic renewal.
