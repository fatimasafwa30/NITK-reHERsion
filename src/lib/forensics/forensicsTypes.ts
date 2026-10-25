/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Forensics Types, Constants, and Error Hierarchy
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 5.1 & 5.3)
 * Person 2 Responsibility: Evidence Collection & Forensics
 */

/**
 * Maximum permitted upload size in bytes: exactly 50 MiB (52,428,800 bytes).
 * Blueprint Section 5.1: File Size Limit = 50 MB (52,428,800 bytes).
 */
export const MAX_UPLOAD_BYTES = 52_428_800; // 50 * 1024 * 1024

/**
 * Minimum header bytes required to reliably determine file signatures.
 * PDF needs 5 bytes (%PDF-), PNG needs 8 bytes, JPEG needs 3 bytes.
 */
export const MIN_HEADER_BYTES = 4;

/**
 * Supported MIME types officially accepted for evidence intake.
 * Sourced from Blueprint v1.1.1, Section 5.1.
 */
export const SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Result of the streaming SHA-256 calculation.
 */
export interface HashStreamResult {
  /** 64-character lowercase hexadecimal SHA-256 digest */
  sha256Hex: string;
  /** Exact count of bytes processed through the stream */
  byteCount: number;
}

/**
 * Result of content sniffing on leading bytes of evidence files.
 */
export interface SniffResult {
  /** Detected MIME type if supported */
  detectedMimeType: SupportedMimeType;
  /** Always true when sniff returns successfully */
  isSupported: true;
  /** Human-readable explanation of container signature match */
  details: string;
}

/**
 * Base error class for VeraTrace forensics operations.
 */
export class ForensicsError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ForensicsError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when evidence stream exceeds MAX_UPLOAD_BYTES (52,428,800 bytes).
 * Error Code: ERR_UPLOAD_QUOTA_EXCEEDED
 */
export class QuotaExceededError extends ForensicsError {
  public readonly maxBytes: number;
  public readonly bytesProcessed: number;

  constructor(bytesProcessed: number, maxBytes: number = MAX_UPLOAD_BYTES) {
    super(
      `Evidence upload quota exceeded: received ${bytesProcessed} bytes (limit is ${maxBytes} bytes / 50 MiB). Stream terminated.`,
      'ERR_UPLOAD_QUOTA_EXCEEDED'
    );
    this.name = 'QuotaExceededError';
    this.maxBytes = maxBytes;
    this.bytesProcessed = bytesProcessed;
  }
}

/**
 * Thrown when evidence stream contains zero bytes (empty file rejection).
 * Error Code: ERR_EMPTY_STREAM_REJECTED
 */
export class EmptyStreamError extends ForensicsError {
  constructor(message: string = 'Evidence stream rejected: file contains zero bytes (empty stream).') {
    super(message, 'ERR_EMPTY_STREAM_REJECTED');
    this.name = 'EmptyStreamError';
  }
}

/**
 * Thrown when file header magic bytes do not match supported MIME types or match disallowed/executable signatures.
 * Error Code: ERR_UNSUPPORTED_MEDIA_TYPE
 */
export class UnsupportedMediaTypeError extends ForensicsError {
  public readonly detectedType?: string;

  constructor(message: string, detectedType?: string) {
    super(message, 'ERR_UNSUPPORTED_MEDIA_TYPE');
    this.name = 'UnsupportedMediaTypeError';
    this.detectedType = detectedType;
  }
}

/**
 * Thrown when file header is corrupt, too short to inspect, or contains invalid binary sequences.
 * Error Code: ERR_MALFORMED_FILE
 */
export class MalformedFileError extends ForensicsError {
  constructor(message: string) {
    super(message, 'ERR_MALFORMED_FILE');
    this.name = 'MalformedFileError';
  }
}

/**
 * Thrown when canonicalization of a JSON data structure fails (RFC 8785).
 * Error Code: ERR_CANONICALIZATION_FAILED
 */
export class CanonicalizationError extends ForensicsError {
  constructor(message: string) {
    super(message, 'ERR_CANONICALIZATION_FAILED');
    this.name = 'CanonicalizationError';
  }
}

// ============================================================================
// STORAGE ERROR HIERARCHY (STEP P2-2)
// ============================================================================

/**
 * Base error class for storage operations.
 */
export class StorageError extends ForensicsError {
  public readonly storageKey?: string;

  constructor(message: string, code: string = 'ERR_STORAGE_ERROR', storageKey?: string) {
    super(message, code);
    this.name = 'StorageError';
    this.storageKey = storageKey;
  }
}

/**
 * Thrown when an expected file does not exist in storage.
 * Error Code: ERR_STORAGE_FILE_NOT_FOUND
 */
export class StorageFileNotFoundError extends StorageError {
  constructor(storageKey: string, message?: string) {
    super(
      message ?? `Storage file not found for logical key: '${storageKey}'.`,
      'ERR_STORAGE_FILE_NOT_FOUND',
      storageKey
    );
    this.name = 'StorageFileNotFoundError';
  }
}

/**
 * Thrown when a storage key contains path traversal tokens or attempts to escape the storage root.
 * Error Code: ERR_PATH_TRAVERSAL_DETECTED
 */
export class PathTraversalError extends StorageError {
  constructor(message: string = 'Path traversal attempt detected in storage key.') {
    super(message, 'ERR_PATH_TRAVERSAL_DETECTED');
    this.name = 'PathTraversalError';
  }
}

/**
 * Thrown when calculated SHA-256 does not match expected SHA-256 during promotion or integrity verification.
 * Error Code: ERR_FORENSIC_INTEGRITY_MISMATCH
 */
export class StorageIntegrityMismatchError extends StorageError {
  public readonly expectedSha256: string;
  public readonly calculatedSha256: string;

  constructor(
    storageKey: string,
    expectedSha256: string,
    calculatedSha256: string,
    message?: string
  ) {
    super(
      message ??
        `Forensic integrity mismatch for '${storageKey}': expected '${expectedSha256}', calculated '${calculatedSha256}'.`,
      'ERR_FORENSIC_INTEGRITY_MISMATCH',
      storageKey
    );
    this.name = 'StorageIntegrityMismatchError';
    this.expectedSha256 = expectedSha256;
    this.calculatedSha256 = calculatedSha256;
  }
}

/**
 * Thrown when an underlying filesystem or I/O error occurs (e.g. disk full, EACCES, EPERM).
 * Error Code: ERR_STORAGE_IO_FAILURE
 */
export class StorageIOError extends StorageError {
  public readonly causeError?: unknown;

  constructor(message: string, cause?: unknown, storageKey?: string) {
    super(message, 'ERR_STORAGE_IO_FAILURE', storageKey);
    this.name = 'StorageIOError';
    this.causeError = cause;
  }
}

/**
 * Thrown when staged-to-raw promotion fails.
 * Error Code: ERR_PROMOTION_FAILED
 */
export class PromotionError extends StorageError {
  constructor(message: string, storageKey?: string) {
    super(message, 'ERR_PROMOTION_FAILED', storageKey);
    this.name = 'PromotionError';
  }
}
