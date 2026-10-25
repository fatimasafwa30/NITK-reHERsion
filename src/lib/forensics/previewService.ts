/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module H: Vault Service & Isolated Derived Preview Generator
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 2 (Lines 100, 119, 152), Phase 3 Milestone 4 (Lines 1517-1518),
 *           Section 13 Threat Model TH-05 (Line 1429)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Generates isolated, sanitized previews of preserved evidence without
 * ever modifying raw evidence bytes or exposing active/executable payloads.
 */

import {
  ForensicsError,
  SupportedMimeType,
  StorageIntegrityMismatchError,
} from './forensicsTypes.js';
import { sniffMagicBytes } from './contentSniffer.js';
import { extractMetadata } from './metadataExtractor.js';
import { hashBuffer } from './streamingHasher.js';
import {
  StorageAdapter,
  getDerivedKey,
} from '../storage/index.js';

export class PreviewSecurityError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_PREVIEW_SECURITY_VIOLATION') {
    super(message, code);
    this.name = 'PreviewSecurityError';
  }
}

export class VaultAccessError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_VAULT_ACCESS_DENIED') {
    super(message, code);
    this.name = 'VaultAccessError';
  }
}

/**
 * Result of derived preview generation.
 * Distinguishes derived preview from original raw evidence for forensic auditability.
 */
export interface DerivedPreviewResult {
  /** Explicit forensic indicator: this is a derived derivative, not original evidence */
  isDerivedPreview: true;
  /** Evidence identifier */
  evidenceId: string;
  /** Case identifier */
  caseId: string;
  /** Verified container MIME type of the preview */
  previewMimeType: SupportedMimeType;
  /** Logical storage key of the derived preview (derived/{caseId}/{evidenceId}.preview) */
  previewStorageKey: string;
  /** In-memory preview buffer */
  previewBuffer: Buffer;
  /** SHA-256 fingerprint of the derived preview buffer */
  previewSha256: string;
  /** Exact size in bytes of the preview buffer */
  previewSizeBytes: number;
  /** Original raw evidence SHA-256 digest (proves reference integrity) */
  originalSha256: string;
  /** Strict HTTP isolation response headers */
  httpHeaders: Record<string, string>;
  /** Timestamp when the preview was generated */
  derivedAtUtc: string;
  /** Safe text summary or HTML-escaped snippet */
  textSnippet?: string;
  /** Extracted image dimensions if applicable */
  dimensions?: { width: number; height: number };
}

export interface PreviewOptions {
  /** Maximum allowable characters for plain-text preview snippet (default 50,000) */
  maxTextLength?: number;
  /** Custom safe filename for Content-Disposition header */
  previewFilename?: string;
  /** Variant identifier (default 'preview') */
  variant?: string;
}

/**
 * Vault access evaluation context.
 * Represents calling security credentials and requested evidence.
 */
export interface VaultAccessContext {
  /** Calling user identifier */
  userId?: string;
  /** Target case identifier */
  caseId: string;
  /** Evidence identifier */
  evidenceId: string;
  /** User role or case permissions */
  role?: string;
}

/**
 * Generates strict HTTP isolation headers for serving evidence previews.
 * Implements Blueprint Threat Model TH-05 (XSS Prevention & Iframe Isolation).
 *
 * Headers Applied:
 * - Content-Type: Exact verified MIME type
 * - Content-Disposition: inline with sanitized filename
 * - X-Content-Type-Options: nosniff (strictly prevents browser MIME-sniffing)
 * - Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox
 * - X-Frame-Options: SAMEORIGIN
 * - Cache-Control: private, max-age=3600, no-transform
 */
export function getPreviewHttpHeaders(
  mimeType: SupportedMimeType,
  filename?: string
): Record<string, string> {
  const safeFilename = (filename || 'preview')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '');

  return {
    'Content-Type': mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : mimeType,
    'Content-Disposition': `inline; filename="${safeFilename}"`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Frame-Options': 'SAMEORIGIN',
    'Cache-Control': 'private, max-age=3600, no-transform',
  };
}

/**
 * Evaluates vault access permissions for an evidence record.
 *
 * NOTE ON MULTI-TENANT AUTHORIZATION:
 * In the current phase, this function validates parameter structure, case matching,
 * and path traversal containment.
 * Production user-to-case tenant authorization requires Person 3's NextAuth / Prisma
 * session middleware.
 */
export function verifyVaultAccess(
  context: VaultAccessContext,
  record?: { caseId: string; evidenceId: string }
): { authorized: boolean; reason?: string } {
  if (!context.caseId || typeof context.caseId !== 'string') {
    return { authorized: false, reason: 'Invalid caseId in access context.' };
  }
  if (!context.evidenceId || typeof context.evidenceId !== 'string') {
    return { authorized: false, reason: 'Invalid evidenceId in access context.' };
  }

  // Prevent path traversal in identifiers
  if (!/^[a-zA-Z0-9_-]+$/.test(context.caseId) || !/^[a-zA-Z0-9_-]+$/.test(context.evidenceId)) {
    return { authorized: false, reason: 'Path traversal token detected in vault request identifiers.' };
  }

  // Cross-case isolation check
  if (record && record.caseId !== context.caseId) {
    return { authorized: false, reason: 'Cross-case access violation: evidence does not belong to specified case.' };
  }

  return { authorized: true };
}

/**
 * Escapes HTML characters for safe browser text display without script injection.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes PNG buffer by locating IEND chunk and stripping trailing uninspected payloads.
 */
function sanitizePngBuffer(buffer: Buffer): { buffer: Buffer; width?: number; height?: number } {
  // Verify PNG signature (8 bytes)
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSig)) {
    throw new PreviewSecurityError('Corrupted PNG header signature.', 'ERR_CORRUPT_PNG');
  }

  let offset = 8;
  let width: number | undefined;
  let height: number | undefined;
  let iendEndOffset: number | undefined;

  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString('ascii');

    if (chunkType === 'IHDR' && offset + 8 + chunkLength <= buffer.length) {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }

    const chunkTotalSize = 8 + chunkLength + 4; // length (4) + type (4) + data (chunkLength) + crc (4)
    if (chunkType === 'IEND') {
      iendEndOffset = offset + chunkTotalSize;
      break;
    }

    offset += chunkTotalSize;
  }

  // If IEND is found and valid, slice up to IEND to strip any trailing payload
  const safeBuffer = iendEndOffset && iendEndOffset <= buffer.length
    ? buffer.subarray(0, iendEndOffset)
    : buffer;

  return { buffer: safeBuffer, width, height };
}

/**
 * Sanitizes JPEG buffer by validating SOI/EOI markers and stripping trailing payloads.
 */
function sanitizeJpegBuffer(buffer: Buffer): { buffer: Buffer; width?: number; height?: number } {
  // SOI: FF D8
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new PreviewSecurityError('Corrupted JPEG header signature.', 'ERR_CORRUPT_JPEG');
  }

  // Find last EOI: FF D9
  let eoiOffset = -1;
  for (let i = buffer.length - 2; i >= 2; i--) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
      eoiOffset = i + 2;
      break;
    }
  }

  // Extract dimensions from SOF0/SOF2 marker if present
  let offset = 2;
  let width: number | undefined;
  let height: number | undefined;

  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break; // SOS or EOI

    const length = buffer.readUInt16BE(offset + 2);
    // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && length >= 7) {
      height = buffer.readUInt16BE(offset + 5);
      width = buffer.readUInt16BE(offset + 7);
      break;
    }
    offset += 2 + length;
  }

  const safeBuffer = eoiOffset > 0 && eoiOffset <= buffer.length
    ? buffer.subarray(0, eoiOffset)
    : buffer;

  return { buffer: safeBuffer, width, height };
}

/**
 * Generates an isolated derived preview from a committed raw evidence file.
 *
 * Invariants:
 * 1. Raw preserved file in rawKey is opened read-only and never modified.
 * 2. Raw SHA-256 is verified before and after preview generation.
 * 3. Derived preview is stored in derived/{caseId}/{evidenceId}.preview.
 * 4. Content is strictly inspected for magic-byte conformity; executable/active content is rejected.
 * 5. Strict HTTP security isolation headers are returned.
 *
 * @param storageAdapter Storage adapter containing the preserved evidence
 * @param record Evidence metadata record (with caseId, evidenceId, storageKey, sha256, mimeType)
 * @param options Preview formatting and text length limits
 */
export async function generateDerivedPreview(
  storageAdapter: StorageAdapter,
  record: {
    caseId: string;
    evidenceId: string;
    storageKey: string;
    sha256: string;
    mimeType: SupportedMimeType;
    fileName?: string;
  },
  options?: PreviewOptions
): Promise<DerivedPreviewResult> {
  // 1. Path traversal & identifier checks
  if (!record.caseId || !record.evidenceId) {
    throw new PreviewSecurityError('Invalid record: missing caseId or evidenceId.', 'ERR_INVALID_RECORD');
  }

  const accessCheck = verifyVaultAccess({
    caseId: record.caseId,
    evidenceId: record.evidenceId,
  }, record);

  if (!accessCheck.authorized) {
    throw new VaultAccessError(accessCheck.reason || 'Vault access denied.', 'ERR_VAULT_ACCESS_DENIED');
  }

  // 2. Read raw preserved evidence bytes
  const rawBuffer = await storageAdapter.readBuffer(record.storageKey);

  // 3. Cryptographic integrity check on raw evidence
  const preCheckSha256 = hashBuffer(rawBuffer).sha256Hex;
  if (preCheckSha256 !== record.sha256.toLowerCase()) {
    throw new StorageIntegrityMismatchError(
      record.storageKey,
      record.sha256,
      preCheckSha256,
      'Raw evidence file integrity failure: preserved bytes do not match reference SHA-256.'
    );
  }

  // 4. Content validation (reject spoofed MIME types, HTML, SVGs, scripts)
  const sniffResult = sniffMagicBytes(rawBuffer);
  if (sniffResult.detectedMimeType !== record.mimeType) {
    throw new PreviewSecurityError(
      `MIME type spoofing detected: claimed '${record.mimeType}', but magic bytes detected '${sniffResult.detectedMimeType}'. Preview rejected.`,
      'ERR_MIME_SPOOFING_DETECTED'
    );
  }

  // 5. Format-specific derived preview processing
  let previewBuffer: Buffer;
  let textSnippet: string | undefined;
  let dimensions: { width: number; height: number } | undefined;

  switch (record.mimeType) {
    case 'image/png': {
      const sanitized = sanitizePngBuffer(rawBuffer);
      previewBuffer = sanitized.buffer;
      if (sanitized.width && sanitized.height) {
        dimensions = { width: sanitized.width, height: sanitized.height };
      }
      break;
    }

    case 'image/jpeg': {
      const sanitized = sanitizeJpegBuffer(rawBuffer);
      previewBuffer = sanitized.buffer;
      if (sanitized.width && sanitized.height) {
        dimensions = { width: sanitized.width, height: sanitized.height };
      }
      break;
    }

    case 'application/pdf': {
      // PDF Preview: provide safe PDF bytes with strict object-src: none and metadata summary
      previewBuffer = Buffer.from(rawBuffer);
      let pageCount: number | undefined;
      let title: string | undefined;

      try {
        const extractionOptions = rawBuffer.length > 65536
          ? { tailBuffer: rawBuffer.subarray(rawBuffer.length - 65536) }
          : undefined;
        const meta = extractMetadata(rawBuffer, 'application/pdf', extractionOptions);
        const rawMeta = (meta && typeof meta.metadata === 'object' && meta.metadata !== null)
          ? (meta.metadata as Record<string, unknown>)
          : {};
        const rawInfo = (rawMeta.info && typeof rawMeta.info === 'object' && rawMeta.info !== null)
          ? (rawMeta.info as Record<string, unknown>)
          : {};

        // Page count mapping: check pageCount, then estimatedPageCount, then info.pageCount / info.pages
        const rawCount = rawMeta.pageCount ?? rawMeta.estimatedPageCount ?? rawInfo.pageCount ?? rawInfo.pages;
        if (typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0) {
          pageCount = Math.floor(rawCount);
        } else if (typeof rawCount === 'string' && /^\d+$/.test(rawCount.trim())) {
          const parsed = parseInt(rawCount.trim(), 10);
          if (parsed > 0) pageCount = parsed;
        }

        // Title mapping: check top-level title, then info.title, then info.Title
        const rawTitle = rawMeta.title ?? rawInfo.title ?? rawInfo.Title;
        if (typeof rawTitle === 'string' && rawTitle.trim().length > 0) {
          title = rawTitle.trim();
        }
      } catch {
        pageCount = undefined;
        title = undefined;
      }

      const pageInfo = pageCount ? ` (${pageCount} page${pageCount === 1 ? '' : 's'})` : '';
      const titleInfo = title ? ` - ${title}` : '';
      textSnippet = `PDF Document${pageInfo}${titleInfo}`;
      break;
    }

    case 'text/plain': {
      const maxLen = options?.maxTextLength ?? 50_000;
      const rawText = rawBuffer.toString('utf8');

      // Reject binary null bytes in text preview
      if (rawText.includes('\0')) {
        throw new PreviewSecurityError(
          'Text evidence contains forbidden null bytes (potential binary/executable). Preview rejected.',
          'ERR_UNSAFE_TEXT_CONTENT'
        );
      }

      let truncated = rawText;
      let isTruncated = false;
      if (rawText.length > maxLen) {
        truncated = rawText.slice(0, maxLen);
        isTruncated = true;
      }

      // Safe HTML-escaped snippet for modal rendering
      textSnippet = escapeHtml(truncated) + (isTruncated ? '\n\n[... Truncated for safe preview ...]' : '');
      previewBuffer = Buffer.from(truncated, 'utf8');
      break;
    }

    default: {
      throw new PreviewSecurityError(
        `Unsupported media type for derived preview: '${record.mimeType}'.`,
        'ERR_UNSUPPORTED_PREVIEW_TYPE'
      );
    }
  }

  // 6. Compute preview SHA-256 digest
  const previewSha256 = hashBuffer(previewBuffer).sha256Hex;
  const previewSizeBytes = previewBuffer.length;

  // 7. Write derived preview separately to storage/derived/
  const variant = options?.variant || 'preview';
  const derivedKey = getDerivedKey(record.caseId, record.evidenceId, variant);

  if (typeof storageAdapter.writeDerivedBuffer === 'function') {
    await storageAdapter.writeDerivedBuffer(derivedKey, previewBuffer);
  } else {
    await storageAdapter.writeStagedBuffer(derivedKey, previewBuffer);
  }

  // 8. CRITICAL FORENSIC INTEGRITY RE-VERIFICATION
  // Mathematically confirm that raw evidence bytes were NOT modified during preview generation
  const postCheckBuffer = await storageAdapter.readBuffer(record.storageKey);
  const postCheckSha256 = hashBuffer(postCheckBuffer).sha256Hex;
  if (postCheckSha256 !== record.sha256.toLowerCase()) {
    throw new StorageIntegrityMismatchError(
      record.storageKey,
      record.sha256,
      postCheckSha256,
      'CRITICAL FORENSIC VIOLATION: Raw evidence file was modified during preview generation!'
    );
  }

  // 9. Build strict HTTP isolation headers
  const httpHeaders = getPreviewHttpHeaders(record.mimeType, options?.previewFilename || record.fileName);

  return {
    isDerivedPreview: true,
    evidenceId: record.evidenceId,
    caseId: record.caseId,
    previewMimeType: record.mimeType,
    previewStorageKey: derivedKey,
    previewBuffer,
    previewSha256,
    previewSizeBytes,
    originalSha256: record.sha256,
    httpHeaders,
    derivedAtUtc: new Date().toISOString(),
    textSnippet,
    dimensions,
  };
}
