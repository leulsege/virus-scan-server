# Virus Scan Testing Guide

## Using EICAR Test File (Safe & Standard)

The **EICAR test file** is a harmless, standard file used to test antivirus systems. It's **not actual malware** - it's a text file with a signature that all antivirus software is programmed to detect for testing purposes.

### Creating EICAR Test File

The EICAR test string is:
```
X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*
```

### Step 1: Create Test File on Server

SSH into your virus scan server:
```bash
ssh user@196.188.250.141

# Create EICAR test file as PDF
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar-test.pdf

# Or create as text file first, then convert
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt
```

### Step 2: Test with ClamAV Directly

```bash
# Test that ClamAV detects it
clamscan /tmp/eicar-test.pdf

# Expected output:
# /tmp/eicar-test.pdf: EICAR-Test-File FOUND
# Exit code will be 1 (virus found)
```

### Step 3: Test via Virus Scan Server API

**From your local machine or backend:**

```bash
# Base64 encode the EICAR file
BASE64_EICAR=$(echo -n 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' | base64)

# Test scan via API
curl -X POST http://196.188.250.141:8080/scan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d "{
    \"file\": \"$BASE64_EICAR\",
    \"filename\": \"testfile.pdf\"
  }"
```

**Expected Response (BLOCKED):**
```json
{
  "success": true,
  "result": {
    "safe": false,
    "threat": "EICAR-Test-File",
    "message": "Virus detected: EICAR-Test-File"
  },
  "timestamp": 1234567890
}
```

### Step 4: Test Safe File

Create a safe test file:
```bash
echo "This is a safe test document" > /tmp/safe-test.pdf

BASE64_SAFE=$(base64 /tmp/safe-test.pdf)

curl -X POST http://196.188.250.141:8080/scan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d "{
    \"file\": \"$BASE64_SAFE\",
    \"filename\": \"safe-test.pdf\"
  }"
```

**Expected Response (SAFE):**
```json
{
  "success": true,
  "result": {
    "safe": true,
    "message": "File is clean"
  },
  "timestamp": 1234567890
}
```

## Python Test Script

Create a test script on your server:

```bash
nano /opt/virus-scan-server/test-scan.py
```

Paste:
```python
#!/usr/bin/env python3
import requests
import base64
import json

# EICAR test string (safe, standard antivirus test file)
EICAR_STRING = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

# Server configuration
SERVER_URL = "http://localhost:8080"  # Or http://196.188.250.141:8080
API_KEY = "your-api-key-here"

def test_scan(file_content, filename, expected_safe=True):
    """Test file scan"""
    file_base64 = base64.b64encode(file_content.encode() if isinstance(file_content, str) else file_content).decode()
    
    payload = {
        "file": file_base64,
        "filename": filename
    }
    
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
    }
    
    print(f"\n📄 Testing: {filename}")
    print(f"   Expected: {'SAFE' if expected_safe else 'BLOCKED'}")
    
    try:
        response = requests.post(f"{SERVER_URL}/scan", json=payload, headers=headers, timeout=30)
        data = response.json()
        
        if data.get("success"):
            result = data.get("result", {})
            safe = result.get("safe", False)
            threat = result.get("threat", "None")
            
            if safe == expected_safe:
                print(f"   ✅ PASS - Status: {'SAFE' if safe else 'BLOCKED'} - Threat: {threat}")
            else:
                print(f"   ❌ FAIL - Expected {'SAFE' if expected_safe else 'BLOCKED'}, got {'SAFE' if safe else 'BLOCKED'}")
        else:
            print(f"   ❌ FAIL - Scan failed: {data.get('error')}")
    except Exception as e:
        print(f"   ❌ ERROR - {str(e)}")

# Test 1: EICAR test file (should be BLOCKED)
print("=" * 60)
print("VIRUS SCAN TEST SUITE")
print("=" * 60)
test_scan(EICAR_STRING, "eicar-test.pdf", expected_safe=False)

# Test 2: Safe file (should be SAFE)
safe_content = "This is a safe test document for virus scanning."
test_scan(safe_content, "safe-test.pdf", expected_safe=True)

# Test 3: Safe PDF-like content
safe_pdf_content = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
test_scan(safe_pdf_content, "safe-document.pdf", expected_safe=True)

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
```

Make it executable and run:
```bash
chmod +x /opt/virus-scan-server/test-scan.py
python3 /opt/virus-scan-server/test-scan.py
```

## Node.js Test Script

```bash
nano /opt/virus-scan-server/test-scan.js
```

Paste:
```javascript
import crypto from 'crypto';

const EICAR_STRING = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const SERVER_URL = 'http://localhost:8080'; // Or http://196.188.250.141:8080
const API_KEY = 'your-api-key-here';

async function testScan(fileContent, filename, expectedSafe = true) {
  const fileBase64 = Buffer.from(fileContent).toString('base64');
  
  const payload = {
    file: fileBase64,
    filename: filename
  };
  
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  };
  
  console.log(`\n📄 Testing: ${filename}`);
  console.log(`   Expected: ${expectedSafe ? 'SAFE' : 'BLOCKED'}`);
  
  try {
    const response = await fetch(`${SERVER_URL}/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    
    const data = await response.json();
    
    if (data.success) {
      const result = data.result;
      const safe = result.safe === true;
      const threat = result.threat || 'None';
      
      if (safe === expectedSafe) {
        console.log(`   ✅ PASS - Status: ${safe ? 'SAFE' : 'BLOCKED'} - Threat: ${threat}`);
      } else {
        console.log(`   ❌ FAIL - Expected ${expectedSafe ? 'SAFE' : 'BLOCKED'}, got ${safe ? 'SAFE' : 'BLOCKED'}`);
      }
    } else {
      console.log(`   ❌ FAIL - Scan failed: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ❌ ERROR - ${error.message}`);
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('VIRUS SCAN TEST SUITE');
  console.log('='.repeat(60));
  
  // Test 1: EICAR (should be BLOCKED)
  await testScan(EICAR_STRING, 'eicar-test.pdf', false);
  
  // Test 2: Safe content (should be SAFE)
  await testScan('This is a safe test document.', 'safe-test.pdf', true);
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

runTests();
```

Run:
```bash
node test-scan.js
```

## Testing from Backend Integration

Test through your actual backend by uploading files:

1. **Upload EICAR test file** via your company document upload form
2. **Check response** - should have `status: "BLOCKED"` 
3. **Check logs**:
   - Backend logs (Vercel)
   - Virus scan server: `sudo journalctl -u virus-scan-server -f`

## Expected Results

| Test File | Expected Status | Expected Threat |
|-----------|----------------|-----------------|
| EICAR string | `BLOCKED` | `EICAR-Test-File` |
| Normal PDF | `SAFE` | None |
| Normal text | `SAFE` | None |

## Important Notes

⚠️ **EICAR is SAFE** - It's not actual malware. It's a standard test file used by the antivirus industry.

⚠️ **Never create real malware** - Use EICAR for testing purposes only.

⚠️ **Test both scenarios** - Always test both safe and infected files to verify the system works correctly.

## Troubleshooting

### EICAR not detected

1. **Check ClamAV virus definitions:**
   ```bash
   sudo freshclam
   ```

2. **Test ClamAV directly:**
   ```bash
   echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/test.txt
   clamscan /tmp/test.txt
   ```

3. **Check virus scan server logs:**
   ```bash
   sudo journalctl -u virus-scan-server -f
   ```

### All files marked as SAFE

- ClamAV might not be running
- Virus definitions might be outdated
- Check server logs for errors

### All files marked as BLOCKED

- Check server configuration
- Verify ClamAV is working correctly
- Check logs for false positives










