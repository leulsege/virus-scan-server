# File Conversion Setup Guide

The virus-scan-server now includes automatic file conversion to safe formats after successful virus scanning. This document describes the required system dependencies and setup.

## Supported Conversions

- **DOCX → PDF**: Using LibreOffice (headless)
- **HEIC/HEIF → WEBP**: Using libvips
- **PNG/JPG/JPEG/WEBP → WEBP**: Using libvips (normalization)
- **PDF → PDF**: Sanitized/normalized using qpdf (preferred) or Ghostscript (fallback)
- **TXT → TXT**: No conversion (safe rendering only)

## Required System Dependencies

### 1. LibreOffice (for DOCX → PDF)

**Installation (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y libreoffice --no-install-recommends
```

**Installation (CentOS/RHEL):**
```bash
sudo yum install -y libreoffice
```

**Verify installation:**
```bash
libreoffice --version
```

### 2. libvips (for Image → WEBP conversion)

**Installation (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y libvips-tools
```

**Installation (CentOS/RHEL):**
```bash
sudo yum install -y vips-tools
```

**Installation (macOS):**
```bash
brew install vips
```

**Verify installation:**
```bash
vips --version
```

### 3. qpdf (for PDF sanitization - Recommended)

**Installation (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y qpdf
```

**Installation (CentOS/RHEL):**
```bash
sudo yum install -y qpdf
```

**Installation (macOS):**
```bash
brew install qpdf
```

**Verify installation:**
```bash
qpdf --version
```

### 4. Ghostscript (for PDF sanitization - Fallback)

**Note:** Ghostscript uses AGPL license. Use in isolated worker only. qpdf is preferred.

**Installation (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y ghostscript
```

**Installation (CentOS/RHEL):**
```bash
sudo yum install -y ghostscript
```

**Installation (macOS):**
```bash
brew install ghostscript
```

**Verify installation:**
```bash
gs --version
```

## Complete Installation Script (Ubuntu/Debian)

```bash
#!/bin/bash
# Install all conversion dependencies

sudo apt-get update
sudo apt-get install -y \
  libreoffice \
  --no-install-recommends \
  libvips-tools \
  qpdf \
  ghostscript

# Verify installations
echo "Verifying installations..."
libreoffice --version
vips --version
qpdf --version
gs --version

echo "All dependencies installed successfully!"
```

## How It Works

1. **Virus Scan**: File is scanned using ClamAV
2. **Conversion**: If file is safe, it's automatically converted based on file type:
   - DOCX files → PDF (removes macros and embedded objects)
   - Images → WEBP (normalizes format, removes metadata)
   - PDF files → Sanitized PDF (removes annotations, attachments, normalizes content)
   - TXT files → No conversion (returned as-is)
3. **Response**: Returns both scan result and converted file (base64 encoded)

## API Response Format

After scanning and conversion, the API returns:

```json
{
  "success": true,
  "result": {
    "safe": true,
    "message": "File is clean"
  },
  "convertedFile": "base64-encoded-file-data",
  "conversionInfo": {
    "originalFilename": "document.docx",
    "convertedFilename": "document.pdf",
    "conversionMethod": "LibreOffice",
    "fileType": "pdf"
  },
  "timestamp": 1234567890,
  "signature": "hmac-signature-if-api-key-configured"
}
```

## Error Handling

- If conversion fails but file is safe, the response includes an error in `conversionInfo`
- The original file scan result is always returned
- Conversion errors are logged but don't fail the entire request

## Performance Considerations

- **LibreOffice**: Can be slow for large documents. Consider timeout settings.
- **libvips**: Very fast and memory-efficient for images.
- **qpdf**: Lightweight and fast for PDF sanitization.
- **Ghostscript**: Slower but more comprehensive PDF processing.

## Security Notes

- All conversions happen in isolated temp directories
- Converted files are automatically cleaned up after processing
- PDF sanitization removes potentially dangerous elements (annotations, attachments, JavaScript)
- Image conversion strips metadata that could contain sensitive information

## Troubleshooting

### LibreOffice conversion fails
- Check if LibreOffice is installed: `libreoffice --version`
- Ensure headless mode works: `libreoffice --headless --convert-to pdf test.docx`
- Check disk space in temp directory

### libvips conversion fails
- Verify installation: `vips --version`
- Check if input image format is supported
- Ensure sufficient memory for large images

### PDF sanitization fails
- qpdf is preferred; falls back to Ghostscript automatically
- Check if both tools are installed
- Verify PDF is not corrupted

### Conversion timeout
- Large files may take time
- Consider implementing timeout limits in production
- Monitor system resources (CPU, memory, disk)

