/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Unified Evidence Ingestion Pipeline
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 5.1, 7 & 1.3)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Connects Content Sniffer, Streaming Hasher, Local Storage Adapter, and
 * Metadata Extractor into an immutable, forensic-grade ingestion pipeline.
 */

import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  MAX_UPLOAD_BYTES,
  SupportedMimeType,
  EmptyStreamError,
  UnsupportedMediaTypeError,
} from './forensicsTypes.js';
import { sniffMagicBytes } from './contentSniffer.js';
import { extractMetadata, ExtractedMetadataResult } from './metadataExtractor.js';
import { StorageAdapter, getStagedKey, getRawKey } from '../storage/index.js';
import {
  ProvenanceRecorder,
  SOFTWARE_COMPONENTS,
} from './provenanceRecorder.js';

export interface IngestionInput {
  /** Target case UUID */
  caseId: string;
  /** Optional explicit evidence UUID (generated if not provided) */
  evidenceId?: string;
  /** Original untrusted filename from user client */
  originalFilename: string;
  /** Binary evidence payload: stream or in-memory buffer */
  source: NodeJS.ReadableStream | Buffer | Uint8Array;
  /** Optional user-claimed source description (e.g. 'Telegram screenshot') */
  userClaimedSource?: string;
  /** Maximum allowable bytes before quota abort (default: 52,428,800 / 50 MiB) */
  maxBytes?: number;
  /** Optional audit provenance recorder (Module F) */
  provenanceRecorder?: ProvenanceRecorder;
}

export interface IngestionResult {
  /** Unique evidence identifier */
  evidenceId: string;
  /** Case identifier */
  caseId: string;
  /** Original client filename */
  originalFilename: string;
  /** Sanitized safe filename for display and reports */
  sanitizedFilename: string;
  /** Verified container MIME type */
  detectedMimeType: SupportedMimeType;
  /** Preserved file size in exact bytes */
  fileSizeBytes: number;
  /** 64-character lowercase hexadecimal SHA-256 digest */
  sha256Hash: string;
  /** Algorithm constant */
  hashAlgorithm: 'SHA-256';
  /** Ephemeral staged storage key */
  stagedKey: string;
  /** Target permanent raw storage key */
  rawKey: string;
  /** Current intake lifecycle status */
  intakeStatus: 'PENDING_PROMOTION' | 'PROMOTED' | 'PROMOTION_CORRUPTED';
  /** Tier 3 System Receipt Time (UTC ISO string) */
  receivedAtUtc: string;
  /** Extracted metadata and Tier 2 timestamp */
  extractedMetadata: ExtractedMetadataResult;
  /** Optional user-claimed source description */
  userClaimedSource?: string;
}

/**
 * Sanitizes an untrusted filename to prevent path traversal, control chars, and shell injection.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_evidence';
  }

  // Strip path prefixes (e.g. C:\path\to\file.png or ../../file.png)
  const basename = path.basename(filename.replace(/\\/g, '/'));

  // Remove control characters (0x00-0x1F, 0x7F) and dangerous shell/fs characters
  const sanitized = basename
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim();

  return sanitized.length > 0 ? sanitized : 'unnamed_evidence';
}

/**
 * Executes the forensic evidence ingestion pipeline:
 * 1. Stages raw bytes to private ephemeral storage while calculating SHA-256 in O(1) memory.
 * 2. Enforces the 50 MiB quota and rejects empty streams.
 * 3. Inspects magic bytes to verify container conformity (PNG, JPEG, PDF, text/plain).
 * 4. Extracts metadata and Tier 2 timestamps without altering evidence bytes.
 * 5. Records Tier 3 System Receipt Time (UTC).
 * 6. Returns structured ingestion result with status 'PENDING_PROMOTION'.
 */
export async function ingestEvidence(
  storageAdapter: StorageAdapter,
  input: IngestionInput
): Promise<IngestionResult> {
  const caseId = input.caseId.trim();
  if (!caseId) {
    throw new Error('Ingestion requires a valid non-empty caseId.');
  }

  const evidenceId =
    input.evidenceId?.trim() ||
    `ev_${Date.now()}_${randomBytes(4).toString('hex')}`;

  const sanitizedFilename = sanitizeFilename(input.originalFilename);
  const stagedKey = getStagedKey(caseId, evidenceId);
  const rawKey = getRawKey(caseId, evidenceId);
  const maxBytes = input.maxBytes ?? MAX_UPLOAD_BYTES;
  const recorder = input.provenanceRecorder;

  // 1. Record FILE_INTAKE_RECEIVED
  if (recorder) {
    await recorder.recordEvent({
      evidenceId,
      eventType: 'FILE_INTAKE_RECEIVED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      details: JSON.stringify({
        caseId,
        originalFilename: input.originalFilename,
        sanitizedFilename,
        userClaimedSource: input.userClaimedSource || null,
      }),
    });
  }

  // 2. Stage upload stream & compute streaming SHA-256 in O(1) memory
  let stream: NodeJS.ReadableStream;
  if (Buffer.isBuffer(input.source) || input.source instanceof Uint8Array) {
    const buf = Buffer.isBuffer(input.source) ? input.source : Buffer.from(input.source);
    if (buf.length === 0) {
      if (recorder) {
        await recorder.recordEvent({
          evidenceId,
          eventType: 'STREAMING_SHA256_COMPUTED',
          eventOutcome: 'FAILED',
          softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
          details: JSON.stringify({ error: 'Cannot hash or stage 0-byte empty evidence file.' }),
        });
      }
      throw new EmptyStreamError();
    }
    stream = Readable.from([buf]);
  } else {
    stream = input.source;
  }

  let byteCount: number;
  let sha256Hex: string;
  try {
    const hashResult = await storageAdapter.writeStagedStream(
      stagedKey,
      stream,
      maxBytes
    );
    byteCount = hashResult.byteCount;
    sha256Hex = hashResult.sha256Hex;

    if (recorder) {
      await recorder.recordEvent({
        evidenceId,
        eventType: 'STREAMING_SHA256_COMPUTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
        details: JSON.stringify({
          byteCount,
          sha256Hex,
          hashAlgorithm: 'SHA-256',
          stagedKey,
        }),
      });
    }
  } catch (err: unknown) {
    if (recorder) {
      await recorder.recordEvent({
        evidenceId,
        eventType: 'STREAMING_SHA256_COMPUTED',
        eventOutcome: 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
        details: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
    throw err;
  }

  // 3. Read leading sample bytes to sniff container magic bytes
  let headerBuffer: Buffer;
  let tailBuffer: Buffer | undefined;
  try {
    if (typeof (storageAdapter as any).readRange === 'function') {
      headerBuffer = await (storageAdapter as any).readRange(stagedKey, 0, 65536);
    } else {
      const fileBuffer = await storageAdapter.readBuffer(stagedKey);
      headerBuffer = fileBuffer.subarray(0, Math.min(fileBuffer.length, 65536));
    }
  } catch (err: unknown) {
    await storageAdapter.deleteFile(stagedKey).catch(() => {});
    throw err;
  }

  // 4. Magic-byte MIME type validation
  let sniffResult;
  try {
    sniffResult = sniffMagicBytes(headerBuffer);
    if (recorder) {
      await recorder.recordEvent({
        evidenceId,
        eventType: 'MAGIC_BYTES_VERIFIED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.CONTENT_SNIFFER,
        details: JSON.stringify({
          detectedMimeType: sniffResult.detectedMimeType,
          details: sniffResult.details,
        }),
      });
    }
  } catch (err: unknown) {
    if (recorder) {
      await recorder.recordEvent({
        evidenceId,
        eventType: 'MAGIC_BYTES_VERIFIED',
        eventOutcome: 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.CONTENT_SNIFFER,
        details: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
    // Clean up uncommitted staged file and rethrow
    await storageAdapter.deleteFile(stagedKey).catch(() => {});
    throw err;
  }

  // For PDF files where file size exceeds the leading header slice,
  // read trailing bytes (up to 64 KiB) for trailer/Info dictionary inspection
  if (sniffResult.detectedMimeType === 'application/pdf' && byteCount > headerBuffer.length) {
    try {
      if (typeof (storageAdapter as any).readRange === 'function') {
        tailBuffer = await (storageAdapter as any).readRange(stagedKey, -65536, 65536);
      } else {
        const fileBuffer = await storageAdapter.readBuffer(stagedKey);
        const tailOffset = Math.max(0, fileBuffer.length - 65536);
        tailBuffer = fileBuffer.subarray(tailOffset);
      }
    } catch {
      // Non-fatal: if tail read fails, proceed with headerBuffer only
      tailBuffer = undefined;
    }
  }

  // 5. Metadata extraction & Tier 2 timestamp classification
  let extractedMetadata: ExtractedMetadataResult;
  try {
    extractedMetadata = extractMetadata(headerBuffer, sniffResult.detectedMimeType, {
      tailBuffer,
    });
    if (recorder) {
      await recorder.recordEvent({
        evidenceId,
        eventType: 'DEVICE_METADATA_EXTRACTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.METADATA_EXTRACTOR,
        details: JSON.stringify({
          mimeType: sniffResult.detectedMimeType,
          timeConfidence: extractedMetadata.embeddedTimeConfidence,
          extractedTimestampUtc: extractedMetadata.extractedFileTimeUtc || null,
        }),
      });
    }
  } catch (err: unknown) {
    if (recorder) {
      await recorder.recordEvent({
        evidenceId,
        eventType: 'DEVICE_METADATA_EXTRACTED',
        eventOutcome: 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.METADATA_EXTRACTOR,
        details: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
    await storageAdapter.deleteFile(stagedKey).catch(() => {});
    throw err;
  }

  // 6. Tier 3 System Receipt Time
  const receivedAtUtc = new Date().toISOString();

  return {
    evidenceId,
    caseId,
    originalFilename: input.originalFilename,
    sanitizedFilename,
    detectedMimeType: sniffResult.detectedMimeType,
    fileSizeBytes: byteCount,
    sha256Hash: sha256Hex,
    hashAlgorithm: 'SHA-256',
    stagedKey,
    rawKey,
    intakeStatus: 'PENDING_PROMOTION',
    receivedAtUtc,
    extractedMetadata,
    userClaimedSource: input.userClaimedSource,
  };
}

/**
 * Promotes ingested evidence from staged to raw storage after database commit.
 */
export async function promoteIngestedEvidence(
  storageAdapter: StorageAdapter,
  ingested: IngestionResult,
  provenanceRecorder?: ProvenanceRecorder
): Promise<IngestionResult> {
  let promo;
  try {
    promo = await storageAdapter.promoteStaged(
      ingested.stagedKey,
      ingested.rawKey,
      ingested.sha256Hash
    );

    const isSuccess = promo.status === 'PROMOTED' || promo.status === 'ALREADY_EXISTS';

    if (provenanceRecorder) {
      await provenanceRecorder.recordEvent({
        evidenceId: ingested.evidenceId,
        eventType: 'RAW_PROMOTION_COMMITTED',
        eventOutcome: isSuccess ? 'SUCCESS' : 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
        details: JSON.stringify({
          rawKey: ingested.rawKey,
          sha256Hash: ingested.sha256Hash,
          promotionStatus: promo.status,
        }),
      });
    }

    return {
      ...ingested,
      intakeStatus: isSuccess ? 'PROMOTED' : 'PROMOTION_CORRUPTED',
    };
  } catch (err: unknown) {
    if (provenanceRecorder) {
      await provenanceRecorder.recordEvent({
        evidenceId: ingested.evidenceId,
        eventType: 'RAW_PROMOTION_COMMITTED',
        eventOutcome: 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
        details: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
    throw err;
  }
}
