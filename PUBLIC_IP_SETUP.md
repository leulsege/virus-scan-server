# Virus Scan Server - Public IP Setup Guide

## Overview

This guide covers setting up the virus scan server on a **public server** with IP: `196.188.250.141`

## Quick Configuration

### Step 1: Deploy Virus Scan Server on Public Server

SSH into your server:

```bash
ssh user@196.188.250.141
```

### Step 2: Install and Configure

```bash
# Install ClamAV
sudo apt update
sudo apt install -y clamav clamav-daemon clamav-freshclam nodejs npm

# Update virus definitions
sudo freshclam

# Deploy virus-scan-server
cd /opt
sudo mkdir -p virus-scan-server
cd virus-scan-server

# Copy virus-scan-server files here (via git, scp, etc.)
# Or clone from your repository

# Install dependencies
npm install

# Configure
cp .env.example .env
nano .env
```

### Step 3: Configure `.env` on Server

Edit `/opt/virus-scan-server/.env`:

```env
# Server Configuration
PORT=8080

# ClamAV Configuration
USE_CLAMD=false  # Use clamscan (simpler) or true for clamd (faster)

# Security - IMPORTANT for public IP
# Generate strong API key: openssl rand -hex 32
API_KEY=your-very-secure-random-api-key-here

# CORS - Restrict to your backend domains
# For Vercel: https://your-app.vercel.app
# For local dev: http://localhost:3000
ALLOWED_ORIGINS=https://your-backend.vercel.app,http://localhost:3000
```

**Generate API Key:**

```bash
openssl rand -hex 32
# Copy the output and paste into API_KEY above
```

### Step 4: Configure Firewall

**Important**: Only allow necessary ports on your public server.

```bash
# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp

# Allow HTTP for virus scan server
sudo ufw allow 8080/tcp

# Or use HTTPS (recommended) - port 443
# sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 5: Start Virus Scan Server

**Option A: Manual Start (for testing)**

```bash
cd /opt/virus-scan-server
npm start
```

**Option B: System Service (Recommended for production)**

Create service file:

```bash
sudo nano /etc/systemd/system/virus-scan-server.service
```

Paste:

```ini
[Unit]
Description=TradeMatch Virus Scan Server
After=network.target clamav-daemon.service

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/opt/virus-scan-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Replace `YOUR_USERNAME` with your actual username.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable virus-scan-server
sudo systemctl start virus-scan-server
sudo systemctl status virus-scan-server
```

### Step 6: Test Server

From the server itself:

```bash
curl http://localhost:8080/health
```

From your local machine:

```bash
curl http://196.188.250.141:8080/health
```

You should see:

```json
{
  "status": "healthy",
  "clamav": "available",
  "method": "clamscan"
}
```

### Step 7: Configure Backend (Vercel)

In **Vercel Dashboard** → Your Project → Settings → Environment Variables:

Add:

```env
VIRUS_SCAN_URL=http://196.188.250.141:8080
VIRUS_SCAN_API_KEY=your-very-secure-random-api-key-here
# Must match the API_KEY in virus-scan-server/.env

VIRUS_SCAN_ENABLED=true
```

**Important**: Use the **same API key** that you set in `virus-scan-server/.env`

## Security Recommendations for Public IP

### 1. Use HTTPS (Highly Recommended)

For production, set up HTTPS with Nginx reverse proxy:

**Install Nginx:**

```bash
sudo apt install nginx
```

**Install Certbot (Let's Encrypt):**

```bash
sudo apt install certbot python3-certbot-nginx
```

**Get SSL Certificate:**

```bash
# Option 1: If you have a domain pointing to this IP
sudo certbot --nginx -d scan.yourdomain.com

# Option 2: Use IP with self-signed cert (less secure, but encrypted)
# Generate self-signed cert:
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt
```

**Configure Nginx:**

```bash
sudo nano /etc/nginx/sites-available/virus-scan
```

Add:

```nginx
server {
    listen 80;
    server_name 196.188.250.141;  # Or your domain

    # Redirect HTTP to HTTPS (if using SSL)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/virus-scan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Update firewall:**

```bash
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
# Remove direct port 8080 from public access
sudo ufw delete allow 8080/tcp
```

**Update backend `.env`:**

```env
VIRUS_SCAN_URL=https://196.188.250.141
# Or if using domain: VIRUS_SCAN_URL=https://scan.yourdomain.com
```

### 2. Restrict API Access

**Use Strong API Key:**

```bash
openssl rand -hex 32
```

**Restrict CORS Origins** in `virus-scan-server/.env`:

```env
ALLOWED_ORIGINS=https://your-backend.vercel.app
# Don't use * in production
```

### 3. Fail2Ban (Optional but Recommended)

Protect against brute force attacks:

```bash
sudo apt install fail2ban

# Configure fail2ban for virus scan server
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[virus-scan]
enabled = true
port = 8080
filter = virus-scan
logpath = /var/log/virus-scan-server.log
maxretry = 5
bantime = 3600
```

### 4. Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update virus definitions (automated via freshclam)
sudo freshclam

# Update virus scan server
cd /opt/virus-scan-server
git pull  # or manually update
npm install
sudo systemctl restart virus-scan-server
```

## Configuration Summary

### Virus Scan Server (`/opt/virus-scan-server/.env`):

```env
PORT=8080
USE_CLAMD=false
API_KEY=your-very-secure-api-key-here
ALLOWED_ORIGINS=https://your-backend.vercel.app
```

### Backend/Vercel Environment Variables:

```env
VIRUS_SCAN_URL=http://196.188.250.141:8080
# Or with HTTPS: VIRUS_SCAN_URL=https://196.188.250.141

VIRUS_SCAN_API_KEY=your-very-secure-api-key-here
# Must match API_KEY above

VIRUS_SCAN_ENABLED=true
```

## Testing

### 1. Test Health Endpoint

```bash
# From any machine
curl http://196.188.250.141:8080/health
```

### 2. Test File Scan

```bash
# Create test file
echo "test content" > /tmp/test.txt
BASE64_FILE=$(base64 /tmp/test.txt)

# Send scan request
curl -X POST http://196.188.250.141:8080/scan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d "{
    \"file\": \"$BASE64_FILE\",
    \"filename\": \"test.txt\"
  }"
```

### 3. Test from Backend

Upload a document through your application and check:

- Backend logs (Vercel dashboard)
- Virus scan server logs: `sudo journalctl -u virus-scan-server -f`

## Troubleshooting

### Cannot connect from Vercel

**Check:**

1. Firewall allows port 8080: `sudo ufw status`
2. Server is running: `sudo systemctl status virus-scan-server`
3. Port is listening: `sudo netstat -tlnp | grep 8080`
4. Test from your machine: `curl http://196.188.250.141:8080/health`

### Connection timeout

**Check:**

1. Firewall isn't blocking: `sudo ufw allow 8080/tcp`
2. Cloud provider firewall (AWS Security Groups, DigitalOcean Firewall, etc.)
3. Server has enough resources (CPU, memory)

### "Invalid API key"

**Check:**

1. `API_KEY` in `virus-scan-server/.env` matches `VIRUS_SCAN_API_KEY` in Vercel
2. No typos or extra spaces
3. Regenerate key if unsure

### ClamAV not found

**Check:**

1. ClamAV installed: `clamscan --version`
2. Virus definitions updated: `sudo freshclam`
3. Check logs: `sudo journalctl -u virus-scan-server -f`

## Maintenance Commands

```bash
# View virus scan server logs
sudo journalctl -u virus-scan-server -f

# Restart virus scan server
sudo systemctl restart virus-scan-server

# Update virus definitions
sudo freshclam

# Check server status
sudo systemctl status virus-scan-server
sudo systemctl status clamav-daemon
```

## Important Notes

⚠️ **Security**: For production, use HTTPS (Nginx + Let's Encrypt) instead of HTTP

⚠️ **Firewall**: Only expose necessary ports (22 for SSH, 443 for HTTPS)

⚠️ **API Key**: Use strong, randomly generated API keys (`openssl rand -hex 32`)

⚠️ **Updates**: Regularly update virus definitions (`sudo freshclam` runs automatically)

## Quick Reference

**Server IP**: `196.188.250.141`  
**Port**: `8080` (or `443` with HTTPS)  
**Health Check**: `http://196.188.250.141:8080/health`  
**Backend Config**: `VIRUS_SCAN_URL=http://196.188.250.141:8080`









