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
import {
  saveVaultBlob,
  getVaultBlob,
  hasVaultBlob,
  deleteVaultBlob,
} from './vaultStorage.js';

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

const EVIDENCE_STORAGE_KEY = 'veratrace_evidence_records_v1';
const PROVENANCE_STORAGE_KEY = 'veratrace_provenance_records_v1';

function loadPersistedEvidence(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(EVIDENCE_STORAGE_KEY);
    if (raw) {
      const records: EvidenceRecord[] = JSON.parse(raw);
      for (const rec of records) {
        if (!caseEvidenceStore.has(rec.caseId)) {
          caseEvidenceStore.set(rec.caseId, new Map());
        }
        caseEvidenceStore.get(rec.caseId)!.set(rec.evidenceId, Object.freeze(rec));
      }
    }
    const rawProv = window.localStorage.getItem(PROVENANCE_STORAGE_KEY);
    if (rawProv) {
      const events: Array<{ caseId: string; event: ProcessingEvent }> = JSON.parse(rawProv);
      for (const item of events) {
        if (!caseProvenanceStore.has(item.caseId)) {
          caseProvenanceStore.set(item.caseId, []);
        }
        caseProvenanceStore.get(item.caseId)!.push(Object.freeze(item.event));
      }
    }
  } catch {
    // Ignore corrupt storage
  }
}

function persistEvidence(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const allRecords: EvidenceRecord[] = [];
    for (const map of caseEvidenceStore.values()) {
      for (const rec of map.values()) {
        allRecords.push(rec);
      }
    }
    window.localStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(allRecords));

    const allProv: Array<{ caseId: string; event: ProcessingEvent }> = [];
    for (const [caseId, events] of caseProvenanceStore.entries()) {
      for (const ev of events) {
        allProv.push({ caseId, event: ev });
      }
    }
    window.localStorage.setItem(PROVENANCE_STORAGE_KEY, JSON.stringify(allProv));
  } catch {
    // Ignore storage errors
  }
}

loadPersistedEvidence();

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
  const wildcard = evidenceListeners.get('*');
  if (wildcard) {
    for (const listener of wildcard) {
      try {
        listener();
      } catch (err) {
        console.error('Error in wildcard evidence listener:', err);
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
  persistEvidence();
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
  const caseMap = caseEvidenceStore.get(normCaseId);
  if (caseMap) {
    for (const evId of caseMap.keys()) {
      fileBlobStore.delete(evId);
      deleteVaultBlob(evId).catch(() => {});
    }
  }
  caseEvidenceStore.delete(normCaseId);
  caseProvenanceStore.delete(normCaseId);
  persistEvidence();
  notifyEvidenceSubscribers(normCaseId);
}

/**
 * Deletes a single evidence record and its associated vault blob.
 */
export function deleteEvidenceRecord(caseId: string, evidenceId: string): void {
  if (!caseId || !evidenceId) return;
  const normCaseId = caseId.trim();
  const normEvId = evidenceId.trim();
  const caseMap = caseEvidenceStore.get(normCaseId);
  if (caseMap && caseMap.has(normEvId)) {
    caseMap.delete(normEvId);
    fileBlobStore.delete(normEvId);
    deleteVaultBlob(normEvId).catch(() => {});
    persistEvidence();
    notifyEvidenceSubscribers(normCaseId);
  }
}

/**
 * Stores raw evidence bytes/blob in memory and persists to IndexedDB vault.
 */
export function storeEvidenceBlob(evidenceId: string, blob: Blob | ArrayBuffer): void {
  if (!evidenceId) return;
  const normId = evidenceId.trim();
  fileBlobStore.set(normId, blob);
  saveVaultBlob(normId, blob).catch((err) => {
    console.warn('Failed to persist blob to vault:', err);
  });
}

/**
 * Retrieves raw evidence bytes/blob synchronously from in-memory cache if available.
 */
export function getEvidenceBlob(evidenceId: string): Blob | ArrayBuffer | null {
  if (!evidenceId) return null;
  return fileBlobStore.get(evidenceId.trim()) || null;
}

/**
 * Retrieves raw evidence bytes/blob asynchronously from memory cache or IndexedDB vault.
 */
export async function getEvidenceBlobAsync(evidenceId: string): Promise<Blob | ArrayBuffer | null> {
  if (!evidenceId) return null;
  const normId = evidenceId.trim();
  const cached = fileBlobStore.get(normId);
  if (cached) return cached;

  const vaultBlob = await getVaultBlob(normId);
  if (vaultBlob) {
    fileBlobStore.set(normId, vaultBlob);
    return vaultBlob;
  }
  return null;
}

/**
 * Checks whether the binary payload for an evidence item exists in memory or IndexedDB vault.
 */
export async function checkEvidenceFileAvailable(evidenceId: string): Promise<boolean> {
  if (!evidenceId) return false;
  const normId = evidenceId.trim();
  if (fileBlobStore.has(normId)) return true;
  return hasVaultBlob(normId);
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
      persistEvidence();
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

  // Store raw bytes for subsequent integrity verification and dossier export
  const rawPayload = file instanceof Blob || file instanceof ArrayBuffer ? file : fullArrayBuffer;
  fileBlobStore.set(evidenceId, rawPayload);
  try {
    await saveVaultBlob(evidenceId, rawPayload);
  } catch (vaultErr) {
    console.warn('Failed to persist evidence file to IndexedDB vault:', vaultErr);
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
 * If raw bytes are stored in memory or vault, recalculates the SHA-256 and compares it.
 * If raw bytes cannot be recovered, marks VerificationStatus.ERROR and records failure provenance.
 */
export async function recheckEvidenceIntegrity(evidenceId: string): Promise<VerificationStatusType> {
  const record = getEvidenceById(evidenceId);
  if (!record) {
    throw new ForensicsError(`Evidence with ID ${evidenceId} not found.`, 'ERR_EVIDENCE_NOT_FOUND');
  }

  // Check memory store, then fallback to IndexedDB vault
  let storedBlob = fileBlobStore.get(evidenceId);
  if (!storedBlob) {
    const fromVault = await getVaultBlob(evidenceId);
    if (fromVault) {
      storedBlob = fromVault;
      fileBlobStore.set(evidenceId, fromVault);
    }
  }

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
    // If the record is initial mock seed data where raw binary was not staged:
    if (evidenceId.startsWith('ev_mock_')) {
      const isHex64 = /^[0-9a-f]{64}$/i.test(record.sha256);
      if (!isHex64) {
        newStatus = VerificationStatus.ERROR;
      } else if (record.verificationStatus === VerificationStatus.MISMATCH) {
        newStatus = VerificationStatus.MISMATCH;
      } else {
        newStatus = VerificationStatus.MATCH;
      }
    } else {
      // Real evidence whose raw binary cannot be recovered from memory or local vault:
      // Never silently substitute metadata placeholders or claim MATCH!
      newStatus = VerificationStatus.ERROR;
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
      payloadRecovered: storedBlob !== undefined && storedBlob !== null,
    }),
  });

  return newStatus;
}
