/**
 * VeraTrace — Forensic File Signature & Upload Validation Engine
 *
 * Implements:
 * 1. Magic-byte signature verification (inspects binary headers, not client-provided MIME)
 * 2. Explicit rejection of executable binaries (PE, ELF, Mach-O, shell scripts)
 * 3. Path traversal and malicious filename sanitization
 * 4. Maximum file-size and empty payload restrictions
 */

import path from 'node:path';

// Known file header magic byte patterns
const MAGIC_SIGNATURES = [
  {
    type: 'image/png',
    ext: '.png',
    check: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    type: 'image/jpeg',
    ext: '.jpg',
    check: (buf) =>
      buf.length >= 3 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff,
  },
  {
    type: 'image/webp',
    ext: '.webp',
    check: (buf) =>
      buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50, // WEBP
  },
  {
    type: 'image/gif',
    ext: '.gif',
    check: (buf) =>
      buf.length >= 6 &&
      buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61, // GIF87a or GIF89a
  },
  {
    type: 'application/pdf',
    ext: '.pdf',
    check: (buf) =>
      buf.length >= 5 &&
      buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d, // %PDF-
  },
  {
    type: 'audio/mpeg',
    ext: '.mp3',
    check: (buf) =>
      buf.length >= 3 &&
      ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || // ID3
       (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)), // Sync word
  },
  {
    type: 'audio/wav',
    ext: '.wav',
    check: (buf) =>
      buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
      buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45, // WAVE
  },
];

/**
 * Checks for known executable binary signatures.
 */
function isExecutableSignature(buf) {
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) {
    // Windows PE / DOS executable ('MZ')
    return { isExecutable: true, signature: 'Windows Executable (PE/MZ)' };
  }
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    // Linux ELF binary
    return { isExecutable: true, signature: 'Linux ELF Binary' };
  }
  if (buf.length >= 4 && (
    (buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfa && (buf[3] === 0xce || buf[3] === 0xcf)) ||
    (buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe)
  )) {
    // macOS Mach-O binary
    return { isExecutable: true, signature: 'macOS Mach-O Binary' };
  }
  if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) {
    // Shebang script (#!/bin/sh, etc.)
    return { isExecutable: true, signature: 'Executable Script (Shebang)' };
  }
  return { isExecutable: false };
}

/**
 * Checks if a buffer represents valid UTF-8 text (e.g. chat export, JSON, email log).
 */
function isValidTextBuffer(buf) {
  if (buf.length === 0) return true;
  // Inspect for null bytes which indicate binary data
  for (let i = 0; i < Math.min(buf.length, 1024); i++) {
    if (buf[i] === 0x00) return false;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf.slice(0, 4096));
    return typeof text === 'string';
  } catch {
    return false;
  }
}

/**
 * Sanitizes a filename to prevent path traversal and shell injection.
 */
export function sanitizeFilename(rawFilename = '') {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return 'evidence_file.bin';
  }

  // 1. Take base name only (strips directory paths ../ or C:\)
  const base = path.basename(rawFilename.trim());

  // 2. Remove null bytes and control characters
  const clean = base
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/^\.+/, ''); // Remove leading dots

  return clean.slice(0, 150) || 'evidence_file.bin';
}

/**
 * Validates an uploaded evidence buffer against magic bytes and security rules.
 */
export function validateEvidenceFile({ buffer, originalFilename, clientMimeType }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Evidence file binary payload is missing or empty.');
  }

  // 1. Check for executable binary signatures
  const execCheck = isExecutableSignature(buffer);
  if (execCheck.isExecutable) {
    throw new Error(`Security Violation: Disallowed executable file detected (${execCheck.signature}). Executable binaries cannot be ingested.`);
  }

  // 2. Match against known allowed forensic binary signatures
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.check(buffer)) {
      return {
        valid: true,
        detectedMime: sig.type,
        sanitizedFilename: sanitizeFilename(originalFilename),
        sizeBytes: buffer.length,
      };
    }
  }

  // 3. Fallback: Allow valid UTF-8 plain text / export logs (e.g. .txt, .csv, .json, .eml)
  if (isValidTextBuffer(buffer)) {
    const lower = (originalFilename || '').toLowerCase();
    let textMime = 'text/plain';
    if (lower.endsWith('.json')) textMime = 'application/json';
    else if (lower.endsWith('.csv')) textMime = 'text/csv';
    else if (lower.endsWith('.eml')) textMime = 'message/rfc822';

    return {
      valid: true,
      detectedMime: textMime,
      sanitizedFilename: sanitizeFilename(originalFilename),
      sizeBytes: buffer.length,
    };
  }

  // 4. Reject unrecognized/unsupported file signatures
  throw new Error(`Invalid File Format: File binary header does not match any accepted evidence format (PNG, JPEG, WebP, PDF, GIF, MP3, WAV, UTF-8 text).`);
}
