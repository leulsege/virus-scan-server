// virus-scan-server/src/converters.js
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Detect file type from filename extension
 */
export function detectFileType(filename) {
  if (!filename) return 'unknown';
  
  const ext = path.extname(filename).toLowerCase();
  const extMap = {
    // Documents
    '.docx': 'docx',
    '.doc': 'docx', // Treat .doc as .docx for conversion
    '.pdf': 'pdf',
    '.txt': 'txt',
    '.text': 'txt',
    
    // Images
    '.heic': 'heic',
    '.heif': 'heic',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.webp': 'image',
  };
  
  return extMap[ext] || 'unknown';
}

/**
 * Convert DOCX to PDF using LibreOffice (headless)
 */
export async function convertDocxToPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    const inputBaseName = path.parse(inputPath).name;
    const expectedOutput = path.join(outputDir, `${inputBaseName}.pdf`);
    
    const libreoffice = spawn('libreoffice', [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath
    ]);
    
    let errorOutput = '';
    
    libreoffice.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    libreoffice.on('close', (code) => {
      if (code === 0) {
        // LibreOffice creates output with .pdf extension in the output directory
        if (fs.existsSync(expectedOutput)) {
          // Move to desired output path if different
          if (expectedOutput !== outputPath) {
            fs.renameSync(expectedOutput, outputPath);
          }
          resolve(outputPath);
        } else {
          reject(new Error(`LibreOffice conversion completed but output file not found at ${expectedOutput}`));
        }
      } else {
        reject(new Error(`LibreOffice conversion failed: ${errorOutput || `Exit code ${code}`}`));
      }
    });
    
    libreoffice.on('error', (err) => {
      reject(new Error(`Failed to run LibreOffice: ${err.message}. Make sure LibreOffice is installed.`));
    });
  });
}

/**
 * Convert images (HEIC/HEIF/PNG/JPG/JPEG/WEBP) to WEBP using libvips
 */
export async function convertImageToWebp(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const vips = spawn('vips', [
      'webpsave',
      inputPath,
      outputPath,
      '--Q', '85', // Quality 85%
      '--strip' // Remove metadata
    ]);
    
    let errorOutput = '';
    
    vips.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    vips.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error('vips conversion completed but output file not found'));
        }
      } else {
        reject(new Error(`vips conversion failed: ${errorOutput || `Exit code ${code}`}`));
      }
    });
    
    vips.on('error', (err) => {
      reject(new Error(`Failed to run vips: ${err.message}. Make sure libvips is installed.`));
    });
  });
}

/**
 * Sanitize PDF using qpdf (recommended - lightweight and safe)
 * Optimized for browser preview while maintaining security
 */
export async function sanitizePdfWithQpdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const qpdf = spawn('qpdf', [
      '--linearize', // Optimize for web streaming (creates proper cross-reference table)
      '--object-streams=preserve', // Preserve object streams for better compatibility
      '--normalize-content=y', // Normalize content streams
      '--remove-attachments', // Remove attachments (security)
      // Note: We don't remove annotations as they're needed for proper PDF structure
      // and browser preview. Annotations are generally safe after linearization.
      inputPath,
      outputPath
    ]);
    
    let errorOutput = '';
    
    qpdf.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    qpdf.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error('qpdf sanitization completed but output file not found'));
        }
      } else {
        reject(new Error(`qpdf sanitization failed: ${errorOutput || `Exit code ${code}`}`));
      }
    });
    
    qpdf.on('error', (err) => {
      reject(new Error(`Failed to run qpdf: ${err.message}. Make sure qpdf is installed.`));
    });
  });
}

/**
 * Sanitize PDF using Ghostscript (alternative to qpdf)
 * Use with caution - AGPL license, use in isolated worker
 */
export async function sanitizePdfWithGhostscript(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const gs = spawn('gs', [
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER', // Enable SAFER mode
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.7', // Use 1.7 for better browser compatibility
      '-dPDFSETTINGS=/screen', // Optimize for screen/web viewing (smaller file, faster loading)
      '-dEmbedAllFonts=true',
      '-dSubsetFonts=true',
      '-dFastWebView=true', // Enable fast web view (linearized PDF)
      '-dColorImageDownsampleType=/Bicubic',
      '-dColorImageResolution=150', // Lower resolution for web (faster loading)
      '-dGrayImageDownsampleType=/Bicubic',
      '-dGrayImageResolution=150',
      '-dMonoImageDownsampleType=/Bicubic',
      '-dMonoImageResolution=150',
      '-dAutoRotatePages=/None', // Preserve page orientation
      `-sOutputFile=${outputPath}`,
      inputPath
    ]);
    
    let errorOutput = '';
    
    gs.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    gs.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error('Ghostscript sanitization completed but output file not found'));
        }
      } else {
        reject(new Error(`Ghostscript sanitization failed: ${errorOutput || `Exit code ${code}`}`));
      }
    });
    
    gs.on('error', (err) => {
      reject(new Error(`Failed to run Ghostscript: ${err.message}. Make sure Ghostscript is installed.`));
    });
  });
}

/**
 * Main conversion function - routes to appropriate converter based on file type
 * 
 * Conversion Rules:
 * - DOCX → PDF (always) - Uses LibreOffice
 * - PDF → PDF (sanitized/normalized) - Uses qpdf or Ghostscript (recommended; optional for minimum viable)
 * - TXT → TXT (no conversion, original file returned)
 * - Images (HEIC/HEIF/PNG/JPG/JPEG/WEBP) → WEBP - Uses libvips
 */
export async function convertToSafeFormat(inputPath, filename, tempDir) {
  const fileType = detectFileType(filename);
  const baseName = path.parse(filename).name;
  
  let outputPath;
  let outputFilename;
  let conversionMethod;
  
  try {
    switch (fileType) {
      case 'docx':
        outputFilename = `${baseName}.pdf`;
        outputPath = path.join(tempDir, `converted-${Date.now()}-${outputFilename}`);
        await convertDocxToPdf(inputPath, outputPath);
        conversionMethod = 'LibreOffice';
        break;
        
      case 'heic':
      case 'image':
        outputFilename = `${baseName}.webp`;
        outputPath = path.join(tempDir, `converted-${Date.now()}-${outputFilename}`);
        await convertImageToWebp(inputPath, outputPath);
        conversionMethod = 'libvips';
        break;
        
      case 'pdf':
        // Try qpdf first, fallback to Ghostscript if qpdf fails
        outputFilename = `${baseName}_sanitized.pdf`;
        outputPath = path.join(tempDir, `converted-${Date.now()}-${outputFilename}`);
        try {
          await sanitizePdfWithQpdf(inputPath, outputPath);
          conversionMethod = 'qpdf';
        } catch (qpdfError) {
          console.warn('qpdf failed, trying Ghostscript:', qpdfError.message);
          // Clean up failed qpdf output if it exists
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
          await sanitizePdfWithGhostscript(inputPath, outputPath);
          conversionMethod = 'Ghostscript';
        }
        break;
        
      case 'txt':
        // No conversion needed, just return the original file
        outputPath = inputPath;
        outputFilename = filename;
        conversionMethod = 'none';
        break;
        
      default:
        throw new Error(`Unsupported file type: ${fileType}. Supported types: DOCX, PDF, TXT, HEIC/HEIF, PNG/JPG/JPEG/WEBP`);
    }
    
    // Read the converted file
    const convertedBuffer = fs.readFileSync(outputPath);
    
    // Map fileType to proper MIME type
    let mimeType;
    switch (fileType) {
      case 'docx':
        mimeType = 'application/pdf'; // DOCX converted to PDF
        break;
      case 'pdf':
        mimeType = 'application/pdf'; // PDF sanitized, still PDF
        break;
      case 'txt':
        mimeType = 'text/plain'; // TXT stays as TXT
        break;
      case 'image':
      case 'heic':
        mimeType = 'image/webp'; // Images converted to WEBP
        break;
      default:
        mimeType = fileType; // Fallback
    }
    
    return {
      buffer: convertedBuffer,
      filename: outputFilename,
      outputPath: outputPath, // Include full path for cleanup
      conversionMethod,
      fileType: mimeType, // Return proper MIME type
      needsCleanup: outputPath !== inputPath // Only cleanup if it's a new file
    };
    
  } catch (error) {
    // Clean up output file on error
    if (outputPath && outputPath !== inputPath && fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (unlinkErr) {
        console.warn('Failed to clean up output file:', unlinkErr);
      }
    }
    throw error;
  }
}

