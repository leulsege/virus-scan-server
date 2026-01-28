// virus-scan-server/src/index.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import net from 'net';
import os from 'os';
import { convertToSafeFormat } from './converters.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY; // Optional API key for authentication
const CLAMAV_HOST = process.env.CLAMAV_HOST || 'localhost';
const CLAMAV_PORT = process.env.CLAMAV_PORT || 3310;
const USE_CLAMD = process.env.USE_CLAMD === 'true'; // Use clamd daemon if true, otherwise use clamscan

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));
app.use(express.json({ limit: '100mb' })); // Allow large file uploads (base64 encoded)
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Temp directory for file scanning
const TEMP_DIR = path.join(os.tmpdir(), 'virus-scan-temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Generate HMAC signature
function generateSignature(data, timestamp, apiKey) {
  const payload = `${data}-${timestamp}`;
  const hmac = crypto.createHmac('sha256', apiKey);
  hmac.update(payload);
  return hmac.digest('hex');
}

// Verify HMAC signature
function verifySignature(data, timestamp, signature, apiKey) {
  if (!apiKey || !signature) return false;
  const expectedSignature = generateSignature(data, timestamp, apiKey);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Scan file using clamd (daemon) - faster for multiple files
async function scanWithClamd(filePath) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({
      host: CLAMAV_HOST,
      port: CLAMAV_PORT
    }, () => {
      // Send INSTREAM command
      client.write(`zINSTREAM\n`);
      
      // Read file and send in chunks
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => {
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        client.write(size);
        client.write(chunk);
      });
      
      stream.on('end', () => {
        const zero = Buffer.alloc(4);
        zero.writeUInt32BE(0, 0);
        client.write(zero);
      });
    });
    
    let response = '';
    client.on('data', (data) => {
      response += data.toString();
      if (response.includes('stream: OK')) {
        client.end();
        resolve({ safe: true, message: 'File is clean' });
      } else if (response.includes('FOUND')) {
        const threat = response.match(/stream: (.+) FOUND/)?.[1] || 'Unknown threat';
        client.end();
        resolve({ safe: false, threat, message: `Virus detected: ${threat}` });
      } else if (response.includes('ERROR')) {
        const error = response.match(/stream: (.+) ERROR/)?.[1] || 'Unknown error';
        client.end();
        reject(new Error(`ClamAV error: ${error}`));
      }
    });
    
    client.on('error', (err) => {
      reject(new Error(`ClamAV connection error: ${err.message}`));
    });
    
    client.on('end', () => {
      if (!response.includes('OK') && !response.includes('FOUND')) {
        reject(new Error('Unexpected response from ClamAV'));
      }
    });
  });
}

// Scan file using clamscan command - works without daemon
async function scanWithClamscan(filePath) {
  return new Promise((resolve, reject) => {
    const clamscan = spawn('clamscan', [
      '--no-summary',
      '--infected',
      '--remove=no',
      filePath
    ]);
    
    let output = '';
    let errorOutput = '';
    
    clamscan.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    clamscan.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    clamscan.on('close', (code) => {
      // Exit code 0 = clean, 1 = virus found
      if (code === 0) {
        resolve({ safe: true, message: 'File is clean' });
      } else if (code === 1) {
        // Extract threat name from output
        const threatMatch = output.match(/:\s*(.+?)\s+FOUND/);
        const threat = threatMatch ? threatMatch[1] : 'Unknown threat';
        resolve({ safe: false, threat, message: `Virus detected: ${threat}` });
      } else {
        reject(new Error(`ClamAV scan failed: ${errorOutput || output}`));
      }
    });
    
    clamscan.on('error', (err) => {
      reject(new Error(`Failed to run clamscan: ${err.message}. Make sure ClamAV is installed.`));
    });
  });
}

// Main scan endpoint
app.post('/scan', async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();
  
  try {
    console.log(`[${requestId}] 📥 Scan request received`);
    console.log(`[${requestId}] Headers:`, {
      'content-type': req.headers['content-type'],
      'x-api-key': API_KEY ? '***provided***' : 'not required',
      'user-agent': req.headers['user-agent'],
    });
    
    // Verify API key if configured
    const apiKeyHeader = req.headers['x-api-key'];
    if (API_KEY && apiKeyHeader !== API_KEY) {
      console.log(`[${requestId}] ❌ Unauthorized: Invalid API key`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid API key'
      });
    }
    
    const { file, filename, timestamp, signature } = req.body;
    console.log(`[${requestId}] File info:`, {
      filename: filename || 'unknown',
      fileSize: file ? `${(Buffer.from(file, 'base64').length / 1024).toFixed(2)} KB` : 'missing',
      hasSignature: !!signature,
      timestamp: timestamp ? new Date(timestamp).toISOString() : 'missing',
    });
    
    if (!file) {
      console.log(`[${requestId}] ❌ Missing file data`);
      return res.status(400).json({
        success: false,
        error: 'Missing file data (base64 encoded)'
      });
    }
    
    // Verify signature if API key is configured
    if (API_KEY && signature && timestamp) {
      const fileBuffer = Buffer.from(file, 'base64');
      if (!verifySignature(fileBuffer.toString('base64'), timestamp, signature, API_KEY)) {
        console.log(`[${requestId}] ❌ Invalid request signature`);
        return res.status(401).json({
          success: false,
          error: 'Invalid request signature'
        });
      }
      console.log(`[${requestId}] ✅ Signature verified`);
    }
    
    // Decode base64 file
    let fileBuffer;
    try {
      fileBuffer = Buffer.from(file, 'base64');
      console.log(`[${requestId}] ✅ File decoded: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
    } catch (err) {
      console.log(`[${requestId}] ❌ Invalid base64 file data:`, err.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid base64 file data'
      });
    }
    
    // Create temp file for scanning
    const tempFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${filename || 'file'}`;
    const tempFilePath = path.join(TEMP_DIR, tempFileName);
    
    try {
      // Write file to temp location
      console.log(`[${requestId}] 💾 Writing temp file: ${tempFilePath}`);
      fs.writeFileSync(tempFilePath, fileBuffer);
      
      // Scan file
      console.log(`[${requestId}] 🔍 Starting virus scan (method: ${USE_CLAMD ? 'clamd' : 'clamscan'})`);
      const scanStartTime = Date.now();
      let scanResult;
      if (USE_CLAMD) {
        scanResult = await scanWithClamd(tempFilePath);
      } else {
        scanResult = await scanWithClamscan(tempFilePath);
      }
      const scanDuration = Date.now() - scanStartTime;
      console.log(`[${requestId}] 🔍 Scan completed in ${scanDuration}ms:`, {
        safe: scanResult.safe,
        threat: scanResult.threat || 'none',
        message: scanResult.message,
      });
      
      // If file is safe, convert to safe format
      let convertedFile = null;
      let conversionInfo = null;
      
      if (scanResult.safe) {
        console.log(`[${requestId}] 🔄 Starting file conversion`);
        const conversionStartTime = Date.now();
        try {
          const conversionResult = await convertToSafeFormat(
            tempFilePath,
            filename || 'file',
            TEMP_DIR
          );
          
          convertedFile = conversionResult.buffer.toString('base64');
          conversionInfo = {
            originalFilename: filename || 'file',
            convertedFilename: conversionResult.filename,
            conversionMethod: conversionResult.conversionMethod,
            fileType: conversionResult.fileType
          };
          
          const conversionDuration = Date.now() - conversionStartTime;
          console.log(`[${requestId}] ✅ Conversion completed in ${conversionDuration}ms:`, {
            method: conversionResult.conversionMethod,
            fileType: conversionResult.fileType,
            convertedSize: `${(conversionResult.buffer.length / 1024).toFixed(2)} KB`,
          });
          
          // Clean up converted file after reading (only if it's a new file)
          if (conversionResult.needsCleanup && conversionResult.outputPath) {
            try {
              if (fs.existsSync(conversionResult.outputPath)) {
                fs.unlinkSync(conversionResult.outputPath);
              }
            } catch (unlinkErr) {
              console.warn(`[${requestId}] ⚠️ Failed to delete converted file:`, unlinkErr);
            }
          }
        } catch (conversionError) {
          console.error(`[${requestId}] ❌ File conversion error:`, conversionError);
          // Continue with response even if conversion fails
          // The file is still safe, just not converted
          conversionInfo = {
            error: conversionError.message,
            note: 'File is safe but conversion failed'
          };
        }
      } else {
        console.log(`[${requestId}] 🚫 File blocked - skipping conversion`);
      }
      
      // Clean up original temp file
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`[${requestId}] 🗑️ Temp file cleaned up`);
      } catch (unlinkErr) {
        console.warn(`[${requestId}] ⚠️ Failed to delete temp file ${tempFilePath}:`, unlinkErr);
      }
      
      // Generate response signature if API key is configured
      const responseTimestamp = Date.now();
      let responseSignature = undefined;
      
      const responseData = {
        success: true,
        result: scanResult,
        ...(convertedFile && { convertedFile }),
        ...(conversionInfo && { conversionInfo }),
        timestamp: responseTimestamp
      };
      
      if (API_KEY) {
        const responseDataString = JSON.stringify(responseData);
        responseSignature = crypto
          .createHmac('sha256', API_KEY)
          .update(responseDataString)
          .digest('hex');
      }
      
      const totalDuration = Date.now() - startTime;
      console.log(`[${requestId}] ✅ Request completed in ${totalDuration}ms`);
      
      res.json({
        ...responseData,
        ...(responseSignature && { signature: responseSignature })
      });
      
    } catch (scanError) {
      // Clean up temp file on error
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (unlinkErr) {
        console.warn(`[${requestId}] ⚠️ Failed to delete temp file on error:`, unlinkErr);
      }
      
      const totalDuration = Date.now() - startTime;
      console.error(`[${requestId}] ❌ Virus scan error (${totalDuration}ms):`, scanError);
      res.status(500).json({
        success: false,
        error: scanError.message || 'Virus scan failed'
      });
    }
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Request processing error (${totalDuration}ms):`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test ClamAV availability
    let clamavAvailable = false;
    try {
      if (USE_CLAMD) {
        // Try to connect to clamd
        const client = net.createConnection({
          host: CLAMAV_HOST,
          port: CLAMAV_PORT
        }, () => {
          clamavAvailable = true;
          client.end();
          res.json({
            status: 'healthy',
            clamav: 'available',
            method: 'clamd',
            host: CLAMAV_HOST,
            port: CLAMAV_PORT
          });
        });
        
        client.on('error', () => {
          res.status(503).json({
            status: 'unhealthy',
            clamav: 'unavailable',
            method: 'clamd',
            error: `Cannot connect to clamd at ${CLAMAV_HOST}:${CLAMAV_PORT}`
          });
        });
      } else {
        // Test clamscan command
        const test = spawn('clamscan', ['--version']);
        test.on('close', (code) => {
          if (code === 0 || code === 1) { // Both 0 and 1 can indicate clamscan exists
            res.json({
              status: 'healthy',
              clamav: 'available',
              method: 'clamscan'
            });
          } else {
            res.status(503).json({
              status: 'unhealthy',
              clamav: 'unavailable',
              method: 'clamscan',
              error: 'clamscan command not found or not working'
            });
          }
        });
        
        test.on('error', () => {
          res.status(503).json({
            status: 'unhealthy',
            clamav: 'unavailable',
            method: 'clamscan',
            error: 'clamscan command not found. Make sure ClamAV is installed.'
          });
        });
      }
    } catch (err) {
      res.status(503).json({
        status: 'unhealthy',
        clamav: 'unavailable',
        error: err.message
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Cleanup temp directory on startup
app.listen(PORT, () => {
  console.log(`🚀 Virus Scan Server running on port ${PORT}`);
  console.log(`📋 ClamAV method: ${USE_CLAMD ? 'clamd daemon' : 'clamscan command'}`);
  if (USE_CLAMD) {
    console.log(`🔌 ClamAV daemon: ${CLAMAV_HOST}:${CLAMAV_PORT}`);
  }
  if (API_KEY) {
    console.log(`🔐 API Key authentication: enabled`);
  }
  console.log(`📁 Temp directory: ${TEMP_DIR}`);
  
  // Cleanup old temp files on startup (older than 1 hour)
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 3600000) { // 1 hour
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.warn('Failed to cleanup temp files:', err);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
