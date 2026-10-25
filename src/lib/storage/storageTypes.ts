/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Storage Adapter Contracts & Logical Key Utilities
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 2, 5.1 & 7)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

export interface StorageObjectMetadata {
  /** Relative logical storage key (e.g. raw/caseId/evidenceId.raw) */
  storageKey: string;
  /** File size in bytes */
  sizeBytes: number;
  /** POSIX last modified timestamp in milliseconds */
  lastModifiedMs: number;
  /** SHA-256 digest if computed or requested */
  sha256Hex?: string;
}

export interface PromotionResult {
  /** Outcome status of the promotion operation */
  status: 'PROMOTED' | 'ALREADY_EXISTS';
  /** Permanent raw storage key */
  rawKey: string;
  /** Staged storage key that was promoted or cleaned up */
  stagedKey: string;
  /** Confirmed SHA-256 fingerprint */
  sha256Hex: string;
  /** Size of the preserved evidence in bytes */
  sizeBytes: number;
  /** Descriptive forensic status message */
  details: string;
}

export interface IntegrityVerificationResult {
  /** Logical storage key verified */
  storageKey: string;
  /** Whether the calculated digest exactly matches expected digest */
  matches: boolean;
  /** Expected SHA-256 lowercase 64-hex string */
  expectedSha256: string;
  /** Calculated SHA-256 lowercase 64-hex string */
  calculatedSha256: string;
  /** Byte count of the file verified */
  sizeBytes: number;
}

export interface StagedFileInfo {
  /** Logical staged key (e.g. staged/{caseId}/{evidenceId}.tmp) */
  stagedKey: string;
  /** Parsed case identifier if structured key */
  caseId?: string;
  /** Parsed evidence identifier if structured key */
  evidenceId?: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modification timestamp in milliseconds */
  lastModifiedMs: number;
  /** Age of the staged file in milliseconds */
  ageMs: number;
}

export interface CleanupSummary {
  /** Total staged files inspected */
  inspectedCount: number;
  /** Count of abandoned staged files safely unlinked */
  deletedCount: number;
  /** Count of staged files retained (e.g. young or matching pending DB records) */
  retainedCount: number;
  /** Any errors encountered during deletion attempts */
  errors: Array<{ stagedKey: string; error: string }>;
}

/**
 * Standard Storage Adapter interface supporting both Local Filesystem (dev)
 * and Private Object Storage (prod S3/MinIO) implementations.
 */
export interface StorageAdapter {
  /**
   * Streams incoming bytes into a private staged location while simultaneously
   * computing the SHA-256 fingerprint in a single O(1) memory pass.
   *
   * @param stagedKey Ephemeral staged logical key (e.g. staged/{caseId}/{evidenceId}.tmp)
   * @param sourceStream Readable stream of uncompressed incoming bytes
   * @param maxBytes Maximum allowable upload size (default: 52,428,800 bytes)
   * @returns Byte count and calculated SHA-256 digest
   */
  writeStagedStream(
    stagedKey: string,
    sourceStream: NodeJS.ReadableStream,
    maxBytes?: number
  ): Promise<{ byteCount: number; sha256Hex: string }>;

  /**
   * Writes an in-memory buffer directly to a staged key (useful for test fixtures & manifests).
   */
  writeStagedBuffer(stagedKey: string, buffer: Buffer | Uint8Array): Promise<void>;

  /**
   * Writes a derived preview or thumbnail buffer to a private derived storage key.
   */
  writeDerivedBuffer(derivedKey: string, buffer: Buffer | Uint8Array): Promise<void>;

  /**
   * Writes a generated dossier ZIP archive or PDF report buffer to private dossier storage.
   * Format: dossiers/{caseId}/{dossierId}.{zip|pdf}
   */
  writeDossierBuffer(dossierKey: string, buffer: Buffer | Uint8Array): Promise<void>;

  /**
   * Promotes staged evidence to its permanent raw location.
   *
   * Invariants:
   * - Must verify SHA-256 against expectedSha256 before accepting promotion.
   * - Must be idempotent: if rawKey already exists with matching hash, cleanly unlinks stagedKey.
   * - On hash mismatch, MUST NOT delete stagedKey (preserves evidence for investigation).
   */
  promoteStaged(
    stagedKey: string,
    rawKey: string,
    expectedSha256: string
  ): Promise<PromotionResult>;

  /**
   * Opens a readable stream for a preserved storage key (raw or staged).
   */
  readStream(storageKey: string): Promise<NodeJS.ReadableStream>;

  /**
   * Reads the entire contents of a preserved storage object into memory.
   */
  readBuffer(storageKey: string): Promise<Buffer>;

  /**
   * Reads a byte range from a stored file without loading the entire object into memory.
   *
   * @param storageKey Logical storage key
   * @param offset Byte offset to start reading from (negative offset reads from end of file)
   * @param length Maximum number of bytes to read
   */
  readRange?(storageKey: string, offset: number, length: number): Promise<Buffer>;

  /**
   * Checks whether a storage key exists.
   */
  exists(storageKey: string): Promise<boolean>;

  /**
   * Retrieves metadata (size, mtime, optional hash) without loading entire payload.
   */
  getMetadata(storageKey: string): Promise<StorageObjectMetadata>;

  /**
   * Cryptographically verifies the integrity of a stored file against an expected digest.
   */
  verifyIntegrity(
    storageKey: string,
    expectedSha256: string
  ): Promise<IntegrityVerificationResult>;

  /**
   * Safely deletes a file by its logical key (e.g. rollback after failed DB commit).
   */
  deleteFile(storageKey: string): Promise<boolean>;

  /**
   * Lists all currently lingering staged files for reconciliation.
   */
  listStagedFiles(): Promise<StagedFileInfo[]>;

  /**
   * Safely cleans up abandoned staged files older than maxAgeMs.
   *
   * @param maxAgeMs Minimum age threshold in milliseconds (e.g. 2 hours)
   * @param shouldDeletePredicate Optional async callback to query DB before unlinking
   */
  cleanupStagedOlderThan(
    maxAgeMs: number,
    shouldDeletePredicate?: (file: StagedFileInfo) => Promise<boolean> | boolean
  ): Promise<CleanupSummary>;
}

// ============================================================================
// DETERMINISTIC KEY UTILITIES
// ============================================================================

/**
 * Generates the deterministic logical staged key for an evidence upload.
 * Format: staged/{caseId}/{evidenceId}.tmp
 */
export function getStagedKey(caseId: string, evidenceId: string): string {
  sanitizeIdentifier(caseId, 'caseId');
  sanitizeIdentifier(evidenceId, 'evidenceId');
  return `staged/${caseId}/${evidenceId}.tmp`;
}

/**
 * Generates the permanent logical raw storage key for committed evidence.
 * Format: raw/{caseId}/{evidenceId}.raw
 */
export function getRawKey(caseId: string, evidenceId: string): string {
  sanitizeIdentifier(caseId, 'caseId');
  sanitizeIdentifier(evidenceId, 'evidenceId');
  return `raw/${caseId}/${evidenceId}.raw`;
}

/**
 * Generates the logical storage key for derived safe previews and thumbnails.
 * Format: derived/{caseId}/{evidenceId}.{variant}
 * Sourced from Blueprint Section 3 (Line 255: storage/derived/)
 */
export function getDerivedKey(caseId: string, evidenceId: string, variant: string = 'preview'): string {
  sanitizeIdentifier(caseId, 'caseId');
  sanitizeIdentifier(evidenceId, 'evidenceId');
  sanitizeIdentifier(variant, 'variant');
  return `derived/${caseId}/${evidenceId}.${variant}`;
}

/**
 * Generates the logical storage key for server-generated dossier ZIP archives and PDF reports.
 * Format: dossiers/{caseId}/{dossierId}.{format}
 * Sourced from Blueprint Section 3 (Line 256: storage/dossiers/) & Section 6 (Dossier schema)
 */
export function getDossierKey(caseId: string, dossierId: string, format: 'zip' | 'pdf' = 'zip'): string {
  sanitizeIdentifier(caseId, 'caseId');
  sanitizeIdentifier(dossierId, 'dossierId');
  sanitizeIdentifier(format, 'format');
  return `dossiers/${caseId}/${dossierId}.${format}`;
}

/**
 * Parses a structured storage key into its constituent components.
 */
export function parseStorageKey(
  key: string
): { prefix: 'staged' | 'raw'; caseId: string; evidenceId: string; extension: string } | null {
  if (!key || typeof key !== 'string') return null;
  const normalized = key.replace(/\\/g, '/');
  const match = normalized.match(/^(staged|raw)\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\.(tmp|raw)$/);
  if (!match) return null;
  return {
    prefix: match[1] as 'staged' | 'raw',
    caseId: match[2],
    evidenceId: match[3],
    extension: match[4],
  };
}

/**
 * Internal validator to ensure UUIDs / identifiers do not contain path traversal characters.
 */
function sanitizeIdentifier(id: string, paramName: string): void {
  if (!id || typeof id !== 'string') {
    throw new Error(`Invalid ${paramName}: must be a non-empty string.`);
  }
  // Allow alphanumeric, dashes, underscores (UUID compliant)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ${paramName}: contains disallowed characters.`);
  }
}
