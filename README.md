# TradeMatch Virus Scan Server

A Node.js server that provides virus scanning capabilities using ClamAV for the TradeMatch application.

## Features

- ✅ Scans files using ClamAV
- ✅ Supports both `clamd` daemon and `clamscan` command
- ✅ HMAC-SHA256 signature verification for secure communication
- ✅ API key authentication
- ✅ Handles base64 encoded files
- ✅ Automatic cleanup of temporary files

## Installation on Ubuntu Server

### Step 1: Install ClamAV

```bash
# Update package list
sudo apt update

# Install ClamAV and ClamAV daemon
sudo apt install -y clamav clamav-daemon clamav-freshclam

# Start ClamAV services
sudo systemctl start clamav-freshclam
sudo systemctl start clamav-daemon
sudo systemctl enable clamav-daemon
sudo systemctl enable clamav-freshclam

# Update virus definitions (this may take a few minutes)
sudo freshclam
```

### Step 2: Configure ClamAV (Optional)

If you want to use the `clamd` daemon for better performance:

Edit `/etc/clamav/clamd.conf`:

```bash
sudo nano /etc/clamav/clamd.conf
```

Uncomment or modify these lines:
```
LocalSocket /var/run/clamav/clamd.ctl
TCPSocket 3310
TCPAddr 127.0.0.1
```

Restart clamd:
```bash
sudo systemctl restart clamav-daemon
```

### Step 3: Install Node.js (if not already installed)

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 4: Deploy Virus Scan Server

```bash
# Navigate to your server directory
cd /opt  # or wherever you want to deploy

# Clone or upload the virus-scan-server directory
# If using git:
# git clone <your-repo> virus-scan-server
# cd virus-scan-server

# Or create the directory and copy files manually
mkdir -p virus-scan-server
cd virus-scan-server

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
nano .env  # Edit configuration
```

### Step 5: Configure Environment

Edit `.env` file:

```env
PORT=8080
USE_CLAMD=true  # Set to false if not using clamd daemon
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
API_KEY=your-very-secure-random-api-key-here
ALLOWED_ORIGINS=*
```

**Important**: Generate a strong API key:
```bash
openssl rand -hex 32
```

### Step 6: Test the Server

```bash
# Start the server
npm start

# In another terminal, test health endpoint
curl http://localhost:8080/health
```

You should see:
```json
{
  "status": "healthy",
  "clamav": "available",
  "method": "clamd"
}
```

### Step 7: Set Up as a System Service (Optional but Recommended)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/virus-scan-server.service
```

Add this content:

```ini
[Unit]
Description=TradeMatch Virus Scan Server
After=network.target clamav-daemon.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/opt/virus-scan-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Replace `/opt/virus-scan-server` with your actual path and `your-user` with your username.**

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable virus-scan-server

# Start service
sudo systemctl start virus-scan-server

# Check status
sudo systemctl status virus-scan-server

# View logs
sudo journalctl -u virus-scan-server -f
```

### Step 8: Configure Firewall

If you have a firewall enabled:

```bash
# Allow port 8080 (or your configured port)
sudo ufw allow 8080/tcp

# Or if using iptables
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
```

### Step 9: Set Up SSL/HTTPS (Production)

For production, set up HTTPS using Nginx reverse proxy:

1. Install Nginx:
```bash
sudo apt install nginx
```

2. Install Certbot for Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
```

3. Create Nginx config:

```bash
sudo nano /etc/nginx/sites-available/virus-scan-server
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

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
sudo ln -s /etc/nginx/sites-available/virus-scan-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Get SSL certificate:
```bash
sudo certbot --nginx -d your-domain.com
```

## API Usage

### Health Check

```bash
GET /health
```

### Scan File

```bash
POST /scan
Content-Type: application/json
X-API-Key: your-api-key  # Optional if API_KEY is set

{
  "file": "base64-encoded-file-content",
  "filename": "document.pdf",
  "timestamp": 1234567890,
  "signature": "hmac-signature"  # Optional if API_KEY is set
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "safe": true,
    "message": "File is clean"
  },
  "timestamp": 1234567890,
  "signature": "response-signature"  # If API_KEY is set
}
```

**If virus found:**
```json
{
  "success": true,
  "result": {
    "safe": false,
    "threat": "Trojan.SomeVirus",
    "message": "Virus detected: Trojan.SomeVirus"
  }
}
```

## Configure TradeMatch Backend

In your `tradematch-backend/.env` file, add:

```env
# Virus Scan Configuration
VIRUS_SCAN_URL=https://your-domain.com  # or http://your-server-ip:8080
VIRUS_SCAN_API_KEY=your-very-secure-random-api-key-here  # Same as server API_KEY
VIRUS_SCAN_ENABLED=true
```

## Maintenance

### Update Virus Definitions

ClamAV updates virus definitions automatically, but you can manually update:

```bash
sudo freshclam
```

### View Logs

```bash
# System service logs
sudo journalctl -u virus-scan-server -f

# ClamAV logs
sudo journalctl -u clamav-daemon -f
sudo journalctl -u clamav-freshclam -f
```

### Restart Services

```bash
# Restart virus scan server
sudo systemctl restart virus-scan-server

# Restart ClamAV daemon
sudo systemctl restart clamav-daemon
```

## Troubleshooting

### ClamAV not found

If you get "clamscan command not found":
- Make sure ClamAV is installed: `sudo apt install clamav`
- Check if it's in PATH: `which clamscan`

### Cannot connect to clamd

If `USE_CLAMD=true` but connection fails:
- Check if clamd is running: `sudo systemctl status clamav-daemon`
- Verify configuration in `/etc/clamav/clamd.conf`
- Check if port is correct: `sudo netstat -tlnp | grep 3310`

### Permission errors

If you get permission errors:
- Make sure the user running the service has access to `/tmp` or temp directory
- Check ClamAV socket permissions: `ls -la /var/run/clamav/`

### Out of memory

For large files, you might need to increase Node.js memory:
```bash
# Edit systemd service
sudo nano /etc/systemd/system/virus-scan-server.service

# Change ExecStart to:
ExecStart=/usr/bin/node --max-old-space-size=2048 src/index.js
```

## Security Notes

1. **Always use HTTPS in production** - The server handles sensitive file data
2. **Use a strong API key** - Generate with `openssl rand -hex 32`
3. **Restrict CORS origins** - Set `ALLOWED_ORIGINS` to specific domains
4. **Firewall configuration** - Only allow necessary ports
5. **Regular updates** - Keep ClamAV and virus definitions updated

## License

MIT
