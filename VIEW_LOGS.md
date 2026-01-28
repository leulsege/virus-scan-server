# How to View Virus Scan Server Logs

This guide shows you how to check logs from your virus scan server to monitor API requests and see what's happening.

## Method 1: If Running as Systemd Service (Recommended)

If you set up the virus scan server as a systemd service:

### View Live Logs (Follow Mode)
```bash
# Follow logs in real-time (press Ctrl+C to exit)
sudo journalctl -u virus-scan-server -f
```

### View Recent Logs
```bash
# Last 100 lines
sudo journalctl -u virus-scan-server -n 100

# Last 50 lines with timestamps
sudo journalctl -u virus-scan-server -n 50 --no-pager

# Logs from last hour
sudo journalctl -u virus-scan-server --since "1 hour ago"

# Logs from today
sudo journalctl -u virus-scan-server --since today
```

### View Logs with Date Range
```bash
# Logs from specific date
sudo journalctl -u virus-scan-server --since "2024-01-15" --until "2024-01-16"

# Logs from last 24 hours
sudo journalctl -u virus-scan-server --since "24 hours ago"
```

### Filter Logs
```bash
# Only show errors
sudo journalctl -u virus-scan-server -p err

# Search for specific text
sudo journalctl -u virus-scan-server | grep "Scan request"

# Search for specific request ID
sudo journalctl -u virus-scan-server | grep "[request-id]"
```

### Export Logs to File
```bash
# Export to file
sudo journalctl -u virus-scan-server --since "1 hour ago" > virus-scan-logs.txt

# Export with timestamps
sudo journalctl -u virus-scan-server --since "1 hour ago" --no-pager > virus-scan-logs.txt
```

## Method 2: If Running Directly with Node.js

If you're running the server directly (e.g., `npm start` or `node src/index.js`):

### View Console Output
The logs will appear directly in your terminal/console where you started the server.

### Redirect Logs to File
```bash
# Start server and save logs to file
npm start > virus-scan-server.log 2>&1

# Or with node directly
node src/index.js > virus-scan-server.log 2>&1

# View logs in real-time
tail -f virus-scan-server.log
```

### Use PM2 (Process Manager)
If using PM2:
```bash
# View logs
pm2 logs virus-scan-server

# View last 100 lines
pm2 logs virus-scan-server --lines 100

# Export logs
pm2 logs virus-scan-server --out > virus-scan-logs.txt
```

## Method 3: Check ClamAV Logs

The virus scan server uses ClamAV, so you may also want to check ClamAV logs:

```bash
# ClamAV daemon logs
sudo journalctl -u clamav-daemon -f

# ClamAV freshclam (virus definition updates)
sudo journalctl -u clamav-freshclam -f

# All ClamAV logs
sudo journalctl -u clamav-daemon -u clamav-freshclam -f
```

## Understanding the Log Format

With the enhanced logging, you'll see entries like:

```
[1234567890-abc123] 📥 Scan request received
[1234567890-abc123] Headers: { content-type: 'application/json', ... }
[1234567890-abc123] File info: { filename: 'logo.png', fileSize: '245.67 KB', ... }
[1234567890-abc123] ✅ File decoded: 245.67 KB
[1234567890-abc123] 💾 Writing temp file: /tmp/virus-scan-temp/...
[1234567890-abc123] 🔍 Starting virus scan (method: clamd)
[1234567890-abc123] 🔍 Scan completed in 234ms: { safe: true, threat: 'none', ... }
[1234567890-abc123] 🔄 Starting file conversion
[1234567890-abc123] ✅ Conversion completed in 567ms: { method: 'libvips', ... }
[1234567890-abc123] 🗑️ Temp file cleaned up
[1234567890-abc123] ✅ Request completed in 1234ms
```

### Log Symbols Meaning:
- 📥 = Request received
- ✅ = Success/Completed
- ❌ = Error/Failed
- 🔍 = Scanning
- 🔄 = Converting
- 💾 = File operation
- 🗑️ = Cleanup
- ⚠️ = Warning
- 🚫 = Blocked

## Useful Commands Summary

```bash
# Most common - follow logs in real-time
sudo journalctl -u virus-scan-server -f

# Check if service is running
sudo systemctl status virus-scan-server

# Restart service
sudo systemctl restart virus-scan-server

# View last 50 lines
sudo journalctl -u virus-scan-server -n 50

# Search for errors
sudo journalctl -u virus-scan-server -p err

# View logs from last hour
sudo journalctl -u virus-scan-server --since "1 hour ago"
```

## Troubleshooting

### No logs appearing?
1. Check if service is running: `sudo systemctl status virus-scan-server`
2. Check service is enabled: `sudo systemctl is-enabled virus-scan-server`
3. Check service logs: `sudo journalctl -u virus-scan-server`

### Logs are too verbose?
The logging is designed to be informative. If you need less verbose logs, you can modify the `console.log` statements in `src/index.js`.

### Need to clear old logs?
```bash
# Clear logs older than 7 days (be careful!)
sudo journalctl --vacuum-time=7d

# Or clear all logs (very careful!)
sudo journalctl --vacuum-time=0s
```

