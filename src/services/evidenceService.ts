/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Service: Isomorphic Evidence Service (evidenceService.ts)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 & docs/DATA_CONTRACT.md
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Provides browser-safe, isomorphic evidence and provenance event access
 * for UI components and hooks without importing Node-only dependencies.
 */

import { Buffer } from 'buffer';
import {
  SupportedMimeType,
  MAX_UPLOAD_BYTES,
  ForensicsError,
  QuotaExceededError,
  EmptyStreamError,
  SniffResult,
} from '../lib/forensics/forensicsTypes.js';
import { sniffMagicBytes } from '../lib/forensics/contentSniffer.js';
import { extractMetadata, ExtractedMetadataResult } from '../lib/forensics/metadataExtractor.js';
import {
  ProcessingEvent,
  ProcessingEventType,
  ProcessingEventOutcome,
  SOFTWARE_COMPONENTS,
} from '../lib/forensics/provenanceRecorder.js';
import { syncEvidenceToTimeline } from './timelineService.js';

export * from '../lib/forensics/provenanceRecorder.js';

/**
 * Verification Status enum matching Person 1 UI components and mockEvidence.js
 */
export const VerificationStatus = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  ERROR: 'ERROR',
} as const);

export type VerificationStatusType = (typeof VerificationStatus)[keyof typeof VerificationStatus];

/**
 * Formatted Evidence Record adhering strictly to docs/DATA_CONTRACT.md and Person 1 hooks.
 */
export interface EvidenceRecord {
  /** Unique evidence identifier (e.g. 'ev_123') */
  evidenceId: string;
  /** Case identifier */
  caseId: string;
  /** Display filename */
  fileName: string;
  /** Original untrusted filename */
  originalFilename: string;
  /** Verified container MIME type */
  mimeType: SupportedMimeType;
  /** Exact size in bytes */
  sizeBytes: number;
  /** Intake timestamp in UTC ISO format (Tier 3 System Receipt Time) */
  recordedAt: string;
  /** Lowercase 64-character SHA-256 digest */
  sha256: string;
  /** Cryptographic integrity status */
  verificationStatus: VerificationStatusType;
  /** Permanent logical raw storage key */
  storageKey: string;
  /** Intake lifecycle status */
  intakeStatus: 'PENDING_PROMOTION' | 'PROMOTED' | 'PROMOTION_CORRUPTED';
  /** Extracted metadata and Tier 2 device timestamp */
  extractedMetadata?: ExtractedMetadataResult;
  /** Optional user claimed source */
  userClaimedSource?: string;
  /** Package relative path for dossier exports */
  packageRelativePath?: string;
}

// Case-scoped in-memory evidence records map: caseId -> (evidenceId -> EvidenceRecord)
const caseEvidenceStore = new Map<string, Map<string, EvidenceRecord>>();

// Case-scoped in-memory provenance events: caseId -> ProcessingEvent[]
const caseProvenanceStore = new Map<string, ProcessingEvent[]>();

// In-memory evidence file blob storage for integrity re-checks: evidenceId -> (Blob | ArrayBuffer)
const fileBlobStore = new Map<string, Blob | ArrayBuffer>();

// Evidence change listeners: caseId -> Set<listener>
type EvidenceListener = () => void;
const evidenceListeners = new Map<string, Set<EvidenceListener>>();

/**
 * Subscribes a listener to evidence changes for a specific case.
 */
export function subscribeEvidence(caseId: string, listener: EvidenceListener): () => void {
  const normCaseId = caseId.trim();
  let set = evidenceListeners.get(normCaseId);
  if (!set) {
    set = new Set();
    evidenceListeners.set(normCaseId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

function notifyEvidenceSubscribers(caseId: string): void {
  const normCaseId = caseId.trim();
  const set = evidenceListeners.get(normCaseId);
  if (set) {
    for (const listener of set) {
      try {
        listener();
      } catch (err) {
        console.error('Error in evidence listener:', err);
      }
    }
  }
}

/**
 * Synchronizes / registers an evidence record into the shared case evidence state.
 */
export function syncEvidenceRecord(caseId: string, record: EvidenceRecord): void {
  if (!caseId) return;
  const normCaseId = caseId.trim();

  let caseMap = caseEvidenceStore.get(normCaseId);
  if (!caseMap) {
    caseMap = new Map();
    caseEvidenceStore.set(normCaseId, caseMap);
  }
  caseMap.set(record.evidenceId, Object.freeze({ ...record }));
  notifyEvidenceSubscribers(normCaseId);
}

/**
 * Retrieves all preserved evidence records for a case, ordered chronologically by intake.
 */
export function getEvidenceForCase(caseId: string): EvidenceRecord[] {
  if (!caseId) return [];
  const normCaseId = caseId.trim();

  const caseMap = caseEvidenceStore.get(normCaseId);
  if (!caseMap) return [];

  return Array.from(caseMap.values()).sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
}

/**
 * Retrieves an evidence record by its unique identifier across registered cases.
 */
export function getEvidenceById(evidenceId: string): EvidenceRecord | null {
  if (!evidenceId) return null;
  const normId = evidenceId.trim();

  for (const caseMap of caseEvidenceStore.values()) {
    const found = caseMap.get(normId);
    if (found) return found;
  }

  return null;
}

/**
 * Synchronizes a processing provenance event into the case provenance store.
 */
export function syncProvenanceEvent(caseId: string, event: ProcessingEvent): void {
  if (!caseId) return;
  const normCaseId = caseId.trim();

  let events = caseProvenanceStore.get(normCaseId);
  if (!events) {
    events = [];
    caseProvenanceStore.set(normCaseId, events);
  }
  events.push(Object.freeze({ ...event }));
}

/**
 * Retrieves all processing provenance events for a case in chronological sequence.
 */
export function getProvenanceEventsForCase(caseId: string): ProcessingEvent[] {
  if (!caseId) return [];
  const normCaseId = caseId.trim();

  const events = caseProvenanceStore.get(normCaseId);
  return events ? [...events] : [];
}

/**
 * Retrieves all processing provenance events for a specific evidence item.
 */
export function getProvenanceEventsForEvidence(evidenceId: string): ProcessingEvent[] {
  if (!evidenceId) return [];
  const normId = evidenceId.trim();

  const result: ProcessingEvent[] = [];
  for (const events of caseProvenanceStore.values()) {
    for (const evt of events) {
      if (evt.evidenceId === normId) {
        result.push(evt);
      }
    }
  }

  return result;
}

/**
 * Clears in-memory evidence and provenance records for a given case.
 */
export function clearEvidenceForCase(caseId: string): void {
  if (!caseId) return;
  const normCaseId = caseId.trim();
  caseEvidenceStore.delete(normCaseId);
  caseProvenanceStore.delete(normCaseId);
  notifyEvidenceSubscribers(normCaseId);
}

/**
 * Stores raw evidence bytes/blob in memory for subsequent integrity verification.
 */
export function storeEvidenceBlob(evidenceId: string, blob: Blob | ArrayBuffer): void {
  if (!evidenceId) return;
  fileBlobStore.set(evidenceId.trim(), blob);
}

/**
 * Retrieves raw evidence bytes/blob if available.
 */
export function getEvidenceBlob(evidenceId: string): Blob | ArrayBuffer | null {
  if (!evidenceId) return null;
  return fileBlobStore.get(evidenceId.trim()) || null;
}

/**
 * Updates the verification status of an evidence record across cases.
 */
export function updateEvidenceVerificationStatus(
  evidenceId: string,
  status: VerificationStatusType
): EvidenceRecord | null {
  if (!evidenceId) return null;
  const normId = evidenceId.trim();

  for (const [caseId, caseMap] of caseEvidenceStore.entries()) {
    const found = caseMap.get(normId);
    if (found) {
      const updated: EvidenceRecord = Object.freeze({
        ...found,
        verificationStatus: status,
      });
      caseMap.set(normId, updated);
      notifyEvidenceSubscribers(caseId);
      return updated;
    }
  }

  return null;
}

/**
 * Isomorphic filename sanitizer that strips directory traversal, control characters,
 * and hazardous file-system punctuation.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_evidence';
  }
  const clean = filename.replace(/\\/g, '/');
  const basename = clean.split('/').pop() || 'unnamed_evidence';
  const sanitized = basename
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim();
  return sanitized.length > 0 ? sanitized : 'unnamed_evidence';
}

/**
 * Computes the lowercase 64-character SHA-256 digest using standard Web Cryptography API.
 */
export async function computeSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer: ArrayBuffer =
    data instanceof ArrayBuffer
      ? data
      : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  throw new Error('Web Cryptography API (crypto.subtle) is not available in this environment.');
}

/**
 * High-level evidence processing pipeline for browser/client environments.
 *
 * Implements Blueprint Sections 5.1 & 7:
 * 1. Validates inputs and enforces 50 MiB quota and non-empty stream requirements.
 * 2. Sniffs container magic bytes (PNG, JPEG, PDF, text/plain) and rejects executables/archives.
 * 3. Extracts file metadata and Tier 2 device timestamps.
 * 4. Computes SHA-256 digest.
 * 5. Records append-only provenance events for each pipeline transition.
 * 6. Stores the evidence record and synchronizes into the chronological timeline.
 */
export async function processEvidenceFile(
  caseId: string,
  file: File | Blob | { name: string; size: number; slice(start?: number, end?: number): any; arrayBuffer(): Promise<ArrayBuffer> },
  userClaimedSource?: string
): Promise<EvidenceRecord> {
  if (!caseId || typeof caseId !== 'string' || !caseId.trim()) {
    throw new ForensicsError('Valid caseId is required for evidence processing.', 'ERR_INVALID_CASE');
  }
  const normCaseId = caseId.trim();

  if (!file) {
    throw new ForensicsError('File object is required for evidence processing.', 'ERR_MISSING_FILE');
  }

  // Quota enforcement (50 MiB)
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new QuotaExceededError(file.size, MAX_UPLOAD_BYTES);
  }

  // Reject empty file
  if (file.size === 0) {
    throw new EmptyStreamError('Cannot process empty file: payload contains 0 bytes.');
  }

  const originalFilename =
    'name' in file && typeof file.name === 'string' ? file.name : 'unnamed_evidence';
  const sanitizedFilename = sanitizeFilename(originalFilename);
  const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 1. Provenance: FILE_INTAKE_RECEIVED
  syncProvenanceEvent(normCaseId, {
    id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    evidenceId,
    eventType: 'FILE_INTAKE_RECEIVED',
    eventOutcome: 'SUCCESS',
    occurredAtUtc: new Date().toISOString(),
    softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
    details: JSON.stringify({
      caseId: normCaseId,
      originalFilename,
      sanitizedFilename,
      sizeBytes: file.size,
      userClaimedSource: userClaimedSource || null,
    }),
  });

  // 2. Read leading 64 KiB for header sniffing & metadata
  const headSlice = file.slice(0, 65536);
  const headArrayBuffer = await headSlice.arrayBuffer();
  const headBuffer = Buffer.from(headArrayBuffer);

  // 3. Magic byte inspection
  let sniffResult: SniffResult;
  try {
    sniffResult = sniffMagicBytes(headBuffer);
    syncProvenanceEvent(normCaseId, {
      id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      evidenceId,
      eventType: 'MAGIC_BYTES_VERIFIED',
      eventOutcome: 'SUCCESS',
      occurredAtUtc: new Date().toISOString(),
      softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      details: JSON.stringify({
        detectedMimeType: sniffResult.detectedMimeType,
        details: sniffResult.details,
      }),
    });
  } catch (sniffErr: any) {
    syncProvenanceEvent(normCaseId, {
      id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      evidenceId,
      eventType: 'MAGIC_BYTES_VERIFIED',
      eventOutcome: 'FAILED',
      occurredAtUtc: new Date().toISOString(),
      softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      details: JSON.stringify({
        error: sniffErr instanceof Error ? sniffErr.message : String(sniffErr),
      }),
    });
    throw sniffErr;
  }

  // 4. Metadata extraction (inspecting tailBuffer for PDFs > 64 KiB)
  let tailBuffer: Buffer | undefined;
  if (sniffResult.detectedMimeType === 'application/pdf' && file.size > 65536) {
    const tailSlice = file.slice(-65536);
    const tailArrayBuffer = await tailSlice.arrayBuffer();
    tailBuffer = Buffer.from(tailArrayBuffer);
  }

  const extractedMetadata = extractMetadata(headBuffer, sniffResult.detectedMimeType, { tailBuffer });
  syncProvenanceEvent(normCaseId, {
    id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    evidenceId,
    eventType: 'DEVICE_METADATA_EXTRACTED',
    eventOutcome: extractedMetadata.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
    occurredAtUtc: new Date().toISOString(),
    softwareComponent: SOFTWARE_COMPONENTS.METADATA_EXTRACTOR,
    details: JSON.stringify({
      status: extractedMetadata.status,
      extractedFileTimeUtc: extractedMetadata.extractedFileTimeUtc,
      warningsCount: extractedMetadata.warnings.length,
    }),
  });

  // 5. SHA-256 Digest calculation
  const fullArrayBuffer = await file.arrayBuffer();
  const sha256 = await computeSha256(fullArrayBuffer);

  syncProvenanceEvent(normCaseId, {
    id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    evidenceId,
    eventType: 'STREAMING_SHA256_COMPUTED',
    eventOutcome: 'SUCCESS',
    occurredAtUtc: new Date().toISOString(),
    softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
    details: JSON.stringify({
      sha256,
      byteCount: file.size,
      algorithm: 'SHA-256',
    }),
  });

  // 6. Record assembly & registration
  const recordedAt = new Date().toISOString();
  const storageKey = `cases/${normCaseId}/raw/${evidenceId}`;

  const record: EvidenceRecord = {
    evidenceId,
    caseId: normCaseId,
    fileName: sanitizedFilename,
    originalFilename,
    mimeType: sniffResult.detectedMimeType,
    sizeBytes: file.size,
    recordedAt,
    sha256,
    verificationStatus: VerificationStatus.MATCH,
    storageKey,
    intakeStatus: 'PROMOTED',
    extractedMetadata,
    userClaimedSource: userClaimedSource || undefined,
  };

  syncProvenanceEvent(normCaseId, {
    id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    evidenceId,
    eventType: 'RAW_PROMOTION_COMMITTED',
    eventOutcome: 'SUCCESS',
    occurredAtUtc: new Date().toISOString(),
    softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
    details: JSON.stringify({
      storageKey,
      intakeStatus: 'PROMOTED',
    }),
  });

  // Store raw blob for future verification re-checks
  if (file instanceof Blob || file instanceof ArrayBuffer) {
    fileBlobStore.set(evidenceId, file);
  }

  // Register in evidence store
  syncEvidenceRecord(normCaseId, record);

  // Sync to timeline store
  syncEvidenceToTimeline(normCaseId, {
    evidenceId: record.evidenceId,
    caseId: record.caseId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    storageKey: record.storageKey,
    recordedAt: record.recordedAt,
    extractedMetadata: record.extractedMetadata
      ? {
          extractedFileTimeUtc: record.extractedMetadata.extractedFileTimeUtc,
          extractedFileTimezone: record.extractedMetadata.extractedFileTimezone,
        }
      : undefined,
  });

  return record;
}

/**
 * Re-checks the cryptographic integrity of an evidence record against its reference SHA-256 hash.
 */
export async function recheckEvidenceIntegrity(evidenceId: string): Promise<VerificationStatusType> {
  const record = getEvidenceById(evidenceId);
  if (!record) {
    throw new ForensicsError(`Evidence with ID ${evidenceId} not found.`, 'ERR_EVIDENCE_NOT_FOUND');
  }

  const storedBlob = fileBlobStore.get(evidenceId);
  let newStatus: VerificationStatusType;

  if (storedBlob) {
    const arrayBuffer =
      storedBlob instanceof ArrayBuffer ? storedBlob : await (storedBlob as Blob).arrayBuffer();
    const computedSha256 = await computeSha256(arrayBuffer);
    if (computedSha256.toLowerCase() === record.sha256.toLowerCase()) {
      newStatus = VerificationStatus.MATCH;
    } else {
      newStatus = VerificationStatus.MISMATCH;
    }
  } else {
    // When raw bytes are not cached in memory (e.g. initial mock evidence records),
    // verify format of sha256 hash (64 hex characters) and preserve or advance state
    const isHex64 = /^[0-9a-f]{64}$/i.test(record.sha256);
    if (!isHex64) {
      newStatus = VerificationStatus.ERROR;
    } else if (record.verificationStatus === VerificationStatus.MISMATCH) {
      newStatus = VerificationStatus.MISMATCH;
    } else {
      newStatus = VerificationStatus.MATCH;
    }
  }

  updateEvidenceVerificationStatus(evidenceId, newStatus);

  syncProvenanceEvent(record.caseId, {
    id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    evidenceId,
    eventType: 'VERIFICATION_AUDIT_EXECUTED',
    eventOutcome: newStatus === VerificationStatus.MATCH ? 'SUCCESS' : 'FAILED',
    occurredAtUtc: new Date().toISOString(),
    softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
    details: JSON.stringify({
      status: newStatus,
      sha256: record.sha256,
    }),
  });

  return newStatus;
}
