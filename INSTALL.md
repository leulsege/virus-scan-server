# Quick Installation Guide - Ubuntu Server

## Prerequisites

- Ubuntu 20.04+ or 22.04 LTS
- Root or sudo access
- Internet connection

## Step-by-Step Installation

### 1. Install ClamAV (5 minutes)

```bash
# Update system
sudo apt update

# Install ClamAV
sudo apt install -y clamav clamav-daemon clamav-freshclam

# Update virus definitions (first time - takes 5-10 minutes)
sudo freshclam

# Start and enable services
sudo systemctl start clamav-daemon
sudo systemctl start clamav-freshclam
sudo systemctl enable clamav-daemon
sudo systemctl enable clamav-freshclam
```

**Verify ClamAV installation:**
```bash
clamscan --version
sudo systemctl status clamav-daemon
```

### 2. Install Node.js (if not installed)

```bash
# Check if Node.js is installed
node --version

# If not installed, install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should show v20.x.x
npm --version
```

### 3. Deploy Virus Scan Server

```bash
# Navigate to deployment directory
cd /opt
sudo mkdir -p virus-scan-server
cd virus-scan-server

# Copy all files from virus-scan-server directory to here
# Or clone from git, or upload via scp/sftp

# Install dependencies
npm install

# Create .env file
cp .env.example .env
nano .env
```

**Edit `.env` file:**
```env
PORT=8080
USE_CLAMD=false  # Set to true if using clamd daemon
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
API_KEY=change-this-to-a-random-string  # Generate with: openssl rand -hex 32
ALLOWED_ORIGINS=*
```

**Generate secure API key:**
```bash
openssl rand -hex 32
# Copy the output and paste into .env as API_KEY value
```

### 4. Test the Server

```bash
# Start server manually
npm start

# In another terminal, test health
curl http://localhost:8080/health
```

You should see JSON response indicating ClamAV is available.

**Test file scan:**
```bash
# Create a test file
echo "This is a test file" > /tmp/test.txt

# Base64 encode it
BASE64_FILE=$(base64 /tmp/test.txt)

# Send scan request (replace YOUR_API_KEY with your actual key)
curl -X POST http://localhost:8080/scan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d "{
    \"file\": \"$BASE64_FILE\",
    \"filename\": \"test.txt\"
  }"
```

### 5. Set Up as System Service (Recommended)

```bash
# Create service file
sudo nano /etc/systemd/system/virus-scan-server.service
```

**Paste this content (adjust paths as needed):**
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

**Replace:**
- `YOUR_USERNAME` with your Ubuntu username
- `/opt/virus-scan-server` with your actual path

**Enable and start:**
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable virus-scan-server

# Start service
sudo systemctl start virus-scan-server

# Check status
sudo systemctl status virus-scan-server

# View logs
sudo journalctl -u virus-scan-server -f
```

### 6. Configure Firewall

```bash
# If UFW is enabled
sudo ufw allow 8080/tcp

# Check firewall status
sudo ufw status
```

### 7. Configure Backend

In your `tradematch-backend/.env` file, add:

```env
VIRUS_SCAN_URL=http://YOUR_SERVER_IP:8080
# Or if using domain: VIRUS_SCAN_URL=https://scan.yourdomain.com

VIRUS_SCAN_API_KEY=same-api-key-as-server-api-key
VIRUS_SCAN_ENABLED=true
```

**Test connection from backend:**
The backend will automatically test the connection when you upload a document.

## Optional: Set Up HTTPS with Nginx

### 1. Install Nginx

```bash
sudo apt install nginx
```

### 2. Get SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx

# Replace with your domain
sudo certbot --nginx -d scan.yourdomain.com
```

### 3. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/virus-scan
```

**Add configuration:**
```nginx
server {
    listen 80;
    server_name scan.yourdomain.com;

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

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/virus-scan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Update Backend .env

```env
VIRUS_SCAN_URL=https://scan.yourdomain.com
```

## Maintenance Commands

```bash
# Update virus definitions (do this weekly)
sudo freshclam

# Restart virus scan server
sudo systemctl restart virus-scan-server

# Restart ClamAV daemon
sudo systemctl restart clamav-daemon

# View server logs
sudo journalctl -u virus-scan-server -f

# View ClamAV logs
sudo journalctl -u clamav-daemon -f
```

## Troubleshooting

### ClamAV not found
```bash
# Reinstall ClamAV
sudo apt install --reinstall clamav
which clamscan
```

### Permission denied
```bash
# Check file permissions
ls -la /opt/virus-scan-server

# Fix ownership
sudo chown -R YOUR_USERNAME:YOUR_USERNAME /opt/virus-scan-server
```

### Port already in use
```bash
# Check what's using port 8080
sudo lsof -i :8080

# Change PORT in .env file to another port (e.g., 8081)
```

### Can't connect to backend
```bash
# Test server from another machine
curl http://YOUR_SERVER_IP:8080/health

# Check firewall
sudo ufw status
sudo ufw allow 8080/tcp
```

## Security Checklist

- [ ] Changed default API_KEY in .env
- [ ] Firewall configured (only allow necessary ports)
- [ ] HTTPS enabled for production (via Nginx/SSL)
- [ ] System service user has minimal permissions
- [ ] Regular virus definition updates scheduled (weekly)
- [ ] Logs are monitored

## Quick Reference

**Service Management:**
```bash
sudo systemctl start virus-scan-server
sudo systemctl stop virus-scan-server
sudo systemctl restart virus-scan-server
sudo systemctl status virus-scan-server
```

**ClamAV Management:**
```bash
sudo systemctl start clamav-daemon
sudo systemctl stop clamav-daemon
sudo freshclam  # Update virus definitions
```

**Test Endpoints:**
```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/scan -H "Content-Type: application/json" -d '{"file":"base64...","filename":"test.txt"}'
```
