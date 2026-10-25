/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Content Sniffer (Magic Byte Inspection & MIME Detection)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 5.1)
 * Person 2 Responsibility: Evidence Collection & Forensics
 *
 * FORENSIC BOUNDARY NOTICE & DISCLAIMER:
 * Magic-byte sniffing inspects container header signatures to provide an initial
 * intake verification filter against improper file submissions and basic extension spoofing.
 * Container header matching DOES NOT guarantee the complete absence of polyglot
 * payloads (e.g., JPEG-ZIP polyglots), steganography, embedded macros, or malformed
 * deep internal structures.
 * Under Section 5.1 of the VeraTrace Blueprint, evidence bytes are preserved strictly
 * immutable and hashed bit-for-bit without server-side execution.
 */

import { Buffer } from 'buffer';
import {
  MIN_HEADER_BYTES,
  SniffResult,
  SupportedMimeType,
  EmptyStreamError,
  MalformedFileError,
  UnsupportedMediaTypeError,
} from './forensicsTypes.js';

/**
 * Standard 8-byte PNG header: \x89PNG\r\n\x1a\n
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Standard 3-byte JPEG Start-Of-Image marker + marker prefix: 0xFF, 0xD8, 0xFF
 */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/**
 * Standard 5-byte PDF header: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
 */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * Known executable and archive signatures that must be explicitly rejected
 * even if disguised as text or other files.
 */
interface DisallowedSignature {
  name: string;
  signature: number[];
  offset?: number;
}

const DISALLOWED_SIGNATURES: DisallowedSignature[] = [
  // Windows Portable Executable (PE / MZ / DOS)
  { name: 'Windows executable / PE binary (MZ header)', signature: [0x4d, 0x5a] },
  // Linux / Unix ELF Executable
  { name: 'Linux ELF executable binary', signature: [0x7f, 0x45, 0x4c, 0x46] },
  // Unix Shell Shebang script (disallowed executable script disguised as text)
  { name: 'Executable shell script (shebang #!)', signature: [0x23, 0x21] },
  // WebAssembly binary module
  { name: 'WebAssembly binary (\\0asm)', signature: [0x00, 0x61, 0x73, 0x6d] },
  // Java Bytecode / Mach-O Fat Binary (CAFEBABE)
  { name: 'Java bytecode / Mach-O binary (CAFEBABE)', signature: [0xca, 0xfe, 0xba, 0xbe] },
  // ZIP / Office OpenXML / JAR archive (PK\x03\x04)
  { name: 'ZIP archive container (PK\\x03\\x04)', signature: [0x50, 0x4b, 0x03, 0x04] },
  // RAR archive
  { name: 'RAR archive container', signature: [0x52, 0x61, 0x72, 0x21] },
  // 7-Zip archive
  { name: '7-Zip archive container', signature: [0x37, 0x7a, 0xbc, 0xaf] },
  // GZIP compressed archive
  { name: 'GZIP compressed archive', signature: [0x1f, 0x8b] },
];

/**
 * Helper to check if a buffer matches a specific byte pattern at an offset.
 */
function matchesBytes(buffer: Uint8Array, pattern: number[], offset: number = 0): boolean {
  if (buffer.length < offset + pattern.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    if (buffer[offset + i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Sniffs the magic bytes of a file header to determine its MIME type and verify
 * that it matches VeraTrace supported evidence types (image/png, image/jpeg,
 * application/pdf, text/plain).
 *
 * @param headerBuffer Buffer containing at least the leading bytes of the file (ideally 512-4096 bytes).
 * @returns SniffResult containing the verified MIME type.
 * @throws EmptyStreamError if buffer is empty.
 * @throws MalformedFileError if buffer is too short to inspect or has truncated headers.
 * @throws UnsupportedMediaTypeError if file matches disallowed executable signatures or unsupported formats.
 */
export function sniffMagicBytes(headerBuffer: Buffer | Uint8Array): SniffResult {
  const buf = Buffer.isBuffer(headerBuffer) ? headerBuffer : Buffer.from(headerBuffer);

  // 1. Check for empty buffer
  if (buf.length === 0) {
    throw new EmptyStreamError('Cannot inspect empty buffer: file contains zero bytes.');
  }

  // 2. Minimum length check
  if (buf.length < MIN_HEADER_BYTES) {
    throw new MalformedFileError(
      `Buffer too small for magic byte detection: received ${buf.length} bytes, minimum required is ${MIN_HEADER_BYTES} bytes.`
    );
  }

  // 3. Check for PNG signature (8 bytes)
  if (buf.length >= PNG_SIGNATURE.length && matchesBytes(buf, PNG_SIGNATURE)) {
    return {
      detectedMimeType: 'image/png',
      isSupported: true,
      details: 'Verified PNG image container signature (89 50 4E 47 0D 0A 1A 0A).',
    };
  }

  // Truncated PNG check: starts with 89 50 4E 47 but shorter than 8 bytes
  if (buf.length < PNG_SIGNATURE.length && matchesBytes(buf, [0x89, 0x50, 0x4e, 0x47])) {
    throw new MalformedFileError('Truncated PNG header: file starts with PNG signature but is shorter than 8 bytes.');
  }

  // 4. Check for JPEG signature (3 bytes: FF D8 FF)
  if (matchesBytes(buf, JPEG_SIGNATURE)) {
    return {
      detectedMimeType: 'image/jpeg',
      isSupported: true,
      details: 'Verified JPEG image container signature (FF D8 FF).',
    };
  }

  // 5. Check for PDF signature (5 bytes: %PDF-)
  if (buf.length >= PDF_SIGNATURE.length && matchesBytes(buf, PDF_SIGNATURE)) {
    return {
      detectedMimeType: 'application/pdf',
      isSupported: true,
      details: 'Verified PDF document header (%PDF-).',
    };
  }

  // Truncated PDF check
  if (buf.length < PDF_SIGNATURE.length && matchesBytes(buf, [0x25, 0x50, 0x44, 0x46])) {
    throw new MalformedFileError('Truncated PDF header: file starts with %PDF but lacks version separator.');
  }

  // 6. Explicit rejection of known executable and archive signatures
  for (const item of DISALLOWED_SIGNATURES) {
    if (matchesBytes(buf, item.signature, item.offset ?? 0)) {
      throw new UnsupportedMediaTypeError(
        `Disallowed file signature detected: ${item.name}. Executables and compressed archives are prohibited.`,
        item.name
      );
    }
  }

  // 7. Check for strictly validated plain text (UTF-8 / ASCII)
  // Plain text must not contain binary null bytes (0x00)
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x00) {
      throw new UnsupportedMediaTypeError(
        'Binary data detected: file header contains null bytes (0x00) and does not match any supported container format.'
      );
    }
  }

  // Validate UTF-8 decoding
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let decodedText: string;
  try {
    decodedText = decoder.decode(buf);
  } catch {
    throw new UnsupportedMediaTypeError(
      'Invalid text encoding: content is not valid UTF-8 and does not match supported image or document signatures.'
    );
  }

  // Check for excessive non-printable ASCII control characters in text sample
  // Permitted control characters: \t (0x09), \n (0x0A), \r (0x0D)
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      throw new UnsupportedMediaTypeError(
        `Non-printable binary control character (0x${byte.toString(16).padStart(2, '0')}) detected in text content.`
      );
    }
    if (byte === 0x7f) {
      throw new UnsupportedMediaTypeError('DEL control character (0x7F) detected in text content.');
    }
  }

  return {
    detectedMimeType: 'text/plain',
    isSupported: true,
    details: 'Verified valid UTF-8/ASCII plain text without binary nulls or executable signatures.',
  };
}
