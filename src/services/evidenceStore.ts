/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Service Contract: evidenceStore.ts (Person 2 Implementation)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 & src/services/README.md
 * Integrates Ingestion Pipeline, Forensics Storage, and Person 1 UI Seams.
 */

import {
  SupportedMimeType,
  ForensicsError,
} from '../lib/forensics/forensicsTypes.js';
import { hashBuffer, hashStream } from '../lib/forensics/streamingHasher.js';
import { ExtractedMetadataResult } from '../lib/forensics/metadataExtractor.js';
import {
  ingestEvidence,
  promoteIngestedEvidence,
  IngestionResult,
} from '../lib/forensics/evidencePipeline.js';
import {
  StorageAdapter,
  LocalStorageAdapter,
} from '../lib/storage/index.js';
import {
  buildUnsealedManifest,
  signManifest as signDossierManifest,
  createAndSignManifest,
  verifyManifestOffline,
  DossierManifest,
  UnsealedDossierManifest,
  UnsealedTrustSeal,
  ManifestBuildOptions,
  PublicKeyset,
  PublicKeyEntry,
  VerificationReport,
  FileInputCollection,
  ProvenanceRecorder,
  InMemoryProvenanceRecorder,
  ProcessingEvent,
  SOFTWARE_COMPONENTS,
  generateDerivedPreview,
  getPreviewHttpHeaders,
  verifyVaultAccess,
  DerivedPreviewResult,
  PreviewOptions,
  VaultAccessContext,
  PreviewSecurityError,
  VaultAccessError,
  packageDossier,
  DossierCaseInfo,
  DossierPackagingOptions,
  DossierPackagingResult,
} from '../lib/forensics/index.js';
import {
  syncEvidenceRecord,
  getEvidenceForCase,
  getEvidenceById,
  clearEvidenceForCase,
} from './evidenceService.js';
import {
  UserIncidentEvent,
  TimelineEntry,
  TimelineProcessingOptions,
  addTimelineEventForCase,
  getTimelineForCase,
  syncEvidenceToTimeline,
} from './timelineService.js';

export * from './timelineService.js';
export * from './evidenceService.js';

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
 * Standard Evidence Error class with stable code property for frontend handling.
 */
export class EvidenceError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_EVIDENCE_ERROR') {
    super(message, code);
    this.name = 'EvidenceError';
  }
}

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
}

/**
 * Input accepted by EvidenceRegister.addRecord
 */
export interface AddEvidenceInput {
  name: string;
  buffer?: Buffer | Uint8Array;
  stream?: NodeJS.ReadableStream;
  userClaimedSource?: string;
  maxBytes?: number;
}

/**
 * Computes the 64-character lowercase hexadecimal SHA-256 digest of a file buffer or stream.
 */
export async function hashFile(
  file: Buffer | Uint8Array | NodeJS.ReadableStream
): Promise<string> {
  if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
    return hashBuffer(file).sha256Hex;
  }
  const result = await hashStream(file);
  return result.sha256Hex;
}

/**
 * Case-scoped evidence register managing preserved records, integrity audits, and storage.
 */
export class EvidenceRegister {
  public readonly caseId: string;
  private readonly storageAdapter: StorageAdapter;
  private readonly provenanceRecorder: ProvenanceRecorder;
  private readonly records: Map<string, EvidenceRecord> = new Map();
  private readonly incidentEvents: Map<string, UserIncidentEvent> = new Map();

  constructor(
    caseId: string,
    storageAdapter?: StorageAdapter,
    provenanceRecorder?: ProvenanceRecorder
  ) {
    if (!caseId || typeof caseId !== 'string') {
      throw new EvidenceError('EvidenceRegister requires a valid non-empty caseId.', 'ERR_INVALID_CASE_ID');
    }
    this.caseId = caseId.trim();
    this.storageAdapter = storageAdapter || new LocalStorageAdapter('./storage');
    this.provenanceRecorder = provenanceRecorder || new InMemoryProvenanceRecorder();
  }

  /**
   * Adds an evidence record to this case through the full ingestion pipeline:
   * 1. Validates magic bytes (PNG, JPEG, PDF, text/plain).
   * 2. Enforces 50 MiB quota.
   * 3. Stages bytes and computes SHA-256 in O(1) memory.
   * 4. Extracts metadata and Tier 2 timestamps.
   * 5. Promotes staged evidence to permanent raw storage.
   * 6. Appends discrete audit events to the Module F Provenance log.
   */
  public async addRecord(
    input: AddEvidenceInput | { name: string; buffer: Buffer }
  ): Promise<EvidenceRecord> {
    const filename = input.name;
    const source = (input as AddEvidenceInput).stream || (input as { buffer: Buffer }).buffer;

    if (!source) {
      throw new EvidenceError('Cannot add evidence record: missing binary source buffer or stream.', 'ERR_NO_SOURCE');
    }

    try {
      // 1. Ingest & stage with provenance tracking
      const ingestion = await ingestEvidence(this.storageAdapter, {
        caseId: this.caseId,
        originalFilename: filename,
        source,
        userClaimedSource: (input as AddEvidenceInput).userClaimedSource,
        maxBytes: (input as AddEvidenceInput).maxBytes,
        provenanceRecorder: this.provenanceRecorder,
      });

      // 2. Promote staged evidence to raw permanent storage with provenance tracking
      const promoted = await promoteIngestedEvidence(
        this.storageAdapter,
        ingestion,
        this.provenanceRecorder
      );

      // 3. Format record to match Person 1 UI contract
      const record: EvidenceRecord = {
        evidenceId: promoted.evidenceId,
        caseId: promoted.caseId,
        fileName: promoted.sanitizedFilename,
        originalFilename: promoted.originalFilename,
        mimeType: promoted.detectedMimeType,
        sizeBytes: promoted.fileSizeBytes,
        recordedAt: promoted.receivedAtUtc,
        sha256: promoted.sha256Hash,
        verificationStatus:
          promoted.intakeStatus === 'PROMOTED'
            ? VerificationStatus.MATCH
            : VerificationStatus.ERROR,
        storageKey: promoted.rawKey,
        intakeStatus: promoted.intakeStatus,
        extractedMetadata: promoted.extractedMetadata,
        userClaimedSource: promoted.userClaimedSource,
      };

      this.records.set(record.evidenceId, record);
      syncEvidenceToTimeline(this.caseId, record);
      syncEvidenceRecord(this.caseId, record);
      return record;
    } catch (err: unknown) {
      if (err instanceof ForensicsError) {
        throw new EvidenceError(err.message, err.code);
      }
      throw new EvidenceError(
        `Failed to add evidence record: ${err instanceof Error ? err.message : String(err)}`,
        'ERR_EVIDENCE_ADD_FAILED'
      );
    }
  }

  /**
   * Retrieves an evidence record by its unique identifier.
   */
  public getRecord(evidenceId: string): EvidenceRecord | null {
    return this.records.get(evidenceId) || null;
  }

  /**
   * Retrieves all evidence records belonging to this case, ordered chronologically.
   */
  public getAllRecords(): EvidenceRecord[] {
    return Array.from(this.records.values()).sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
  }

  /**
   * Adds a user incident event to this case register and returns the updated timeline entry.
   */
  public addIncidentEvent(event: UserIncidentEvent): TimelineEntry {
    return addTimelineEventForCase(this.caseId, event);
  }

  /**
   * Builds and returns the unified chronological incident timeline for this case,
   * synthesizing incident events and preserved evidence records.
   */
  public getTimeline(options?: TimelineProcessingOptions): TimelineEntry[] {
    return getTimelineForCase(this.caseId, options);
  }

  /**
   * Retrieves a read buffer of the stored evidence payload.
   */
  public async getFileBuffer(evidenceId: string): Promise<Buffer | null> {
    const record = this.records.get(evidenceId);
    if (!record) return null;
    return this.storageAdapter.readBuffer(record.storageKey);
  }

  /**
   * Generates a safe derived preview and HTTP isolation headers for an evidence record.
   * Never modifies raw evidence bytes or serves executable content.
   */
  public async getDerivedPreview(
    evidenceId: string,
    options?: PreviewOptions
  ): Promise<DerivedPreviewResult> {
    const record = this.records.get(evidenceId);
    if (!record) {
      throw new EvidenceError(`Evidence record not found: '${evidenceId}'`, 'ERR_RECORD_NOT_FOUND');
    }
    return generateDerivedPreview(this.storageAdapter, record, options);
  }

  /**
   * Returns strict HTTP isolation response headers for serving an evidence preview safely.
   */
  public getPreviewHeaders(evidenceId: string, previewFilename?: string): Record<string, string> {
    const record = this.records.get(evidenceId);
    if (!record) {
      throw new EvidenceError(`Evidence record not found: '${evidenceId}'`, 'ERR_RECORD_NOT_FOUND');
    }
    return getPreviewHttpHeaders(record.mimeType, previewFilename || record.fileName);
  }

  /**
   * Evaluates vault access permissions for an evidence item.
   */
  public verifyVaultAccess(
    evidenceId: string,
    accessContext?: Partial<VaultAccessContext>
  ): { authorized: boolean; reason?: string } {
    const record = this.records.get(evidenceId);
    return verifyVaultAccess(
      {
        caseId: this.caseId,
        evidenceId,
        userId: accessContext?.userId,
        role: accessContext?.role,
      },
      record ? { caseId: this.caseId, evidenceId } : undefined
    );
  }

  /**
   * Generates a complete, tamper-evident Forensic Evidence Dossier (ZIP archive + PDF report)
   * for this case register, incorporating evidence ledger, signed manifest, timeline,
   * derived previews, provenance audit logs, and machine-readable index.
   */
  public async generateDossier(
    caseInfoOverride?: Partial<DossierCaseInfo>,
    options?: DossierPackagingOptions
  ): Promise<DossierPackagingResult> {
    const records = this.getAllRecords();
    const evidenceList = records.map((r) => ({
      evidenceId: r.evidenceId,
      originalFilename: r.originalFilename || r.fileName,
      mediaType: r.mimeType,
      sizeBytes: r.sizeBytes,
      sha256: r.sha256,
      packageRelativePath: `evidence/${r.evidenceId}_${(r.originalFilename || r.fileName).replace(/[/\\?%*:|"<>]/g, '_')}`,
      systemReceiptUtc: r.recordedAt,
      sourceClassification: r.userClaimedSource || 'USER_UPLOAD',
    }));

    const timelineEvents = this.getTimeline();

    const caseInfo: DossierCaseInfo = {
      caseId: this.caseId,
      title: caseInfoOverride?.title || `Case ${this.caseId}`,
      category: caseInfoOverride?.category || 'DIGITAL_ABUSE_INTAKE',
      summary: caseInfoOverride?.summary,
      exportTimestampUtc: caseInfoOverride?.exportTimestampUtc,
    };

    return packageDossier(caseInfo, evidenceList, {
      ...options,
      storageAdapter: options?.storageAdapter || this.storageAdapter,
      timelineEvents: options?.timelineEvents || (timelineEvents as any),
    });
  }

  /**
   * Verifies the cryptographic integrity of an evidence item.
   *
   * @param evidenceId Identifier of the record to verify
   * @param candidateFile Optional candidate buffer to test against preserved record
   */
  public async verify(
    evidenceId: string,
    candidateFile?: Buffer | Uint8Array
  ): Promise<{
    evidenceId: string;
    status: VerificationStatusType;
    candidateHash: string;
    referenceHash: string;
  }> {
    const record = this.records.get(evidenceId);
    if (!record) {
      throw new EvidenceError(`Evidence record not found for verification: '${evidenceId}'`, 'ERR_RECORD_NOT_FOUND');
    }

    const referenceHash = record.sha256;

    if (candidateFile) {
      const candidateHash = hashBuffer(candidateFile).sha256Hex;
      const status =
        candidateHash === referenceHash
          ? VerificationStatus.MATCH
          : VerificationStatus.MISMATCH;

      await this.provenanceRecorder.recordEvent({
        evidenceId,
        eventType: 'VERIFICATION_AUDIT_EXECUTED',
        eventOutcome: status === VerificationStatus.MATCH ? 'SUCCESS' : 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
        details: JSON.stringify({
          status,
          candidateHash,
          referenceHash,
          mode: 'CANDIDATE_BUFFER',
        }),
      });

      return {
        evidenceId,
        status,
        candidateHash,
        referenceHash,
      };
    }

    // Storage integrity check against preserved raw bytes
    try {
      const audit = await this.storageAdapter.verifyIntegrity(record.storageKey, referenceHash);
      const status = audit.matches ? VerificationStatus.MATCH : VerificationStatus.MISMATCH;

      await this.provenanceRecorder.recordEvent({
        evidenceId,
        eventType: 'VERIFICATION_AUDIT_EXECUTED',
        eventOutcome: status === VerificationStatus.MATCH ? 'SUCCESS' : 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
        details: JSON.stringify({
          status,
          candidateHash: audit.calculatedSha256,
          referenceHash,
          mode: 'STORAGE_INTEGRITY',
        }),
      });

      return {
        evidenceId,
        status,
        candidateHash: audit.calculatedSha256,
        referenceHash,
      };
    } catch {
      await this.provenanceRecorder.recordEvent({
        evidenceId,
        eventType: 'VERIFICATION_AUDIT_EXECUTED',
        eventOutcome: 'FAILED',
        softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
        details: JSON.stringify({
          status: VerificationStatus.ERROR,
          referenceHash,
          error: 'Storage read or checksum verification failed.',
        }),
      });

      return {
        evidenceId,
        status: VerificationStatus.ERROR,
        candidateHash: 'ERROR',
        referenceHash,
      };
    }
  }

  /**
   * Generates an unsealed Dossier Manifest conforming to Blueprint Section 10.2.
   * Includes all preserved evidence records sorted deterministically.
   */
  public generateManifest(
    caseInfo: { title: string; category: string; exportTimestampUtc?: string },
    options?: ManifestBuildOptions
  ): UnsealedDossierManifest & { trustSeal: UnsealedTrustSeal } {
    return buildUnsealedManifest(
      {
        caseId: this.caseId,
        title: caseInfo.title,
        category: caseInfo.category,
        exportTimestampUtc: caseInfo.exportTimestampUtc,
      },
      this.getAllRecords(),
      options
    );
  }

  /**
   * Signs an unsealed manifest using an Ed25519 private key.
   * Appends MANIFEST_SEALED event to the Module F audit log.
   */
  public async signManifest(
    unsealed: UnsealedDossierManifest,
    privateKeyPem: string,
    signingKeyId?: string
  ): Promise<DossierManifest> {
    const signed = signDossierManifest(unsealed, privateKeyPem, signingKeyId);
    for (const f of signed.files) {
      await this.provenanceRecorder.recordEvent({
        evidenceId: f.evidenceId,
        eventType: 'MANIFEST_SEALED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.MANIFEST_SIGNER,
        details: JSON.stringify({
          signingKeyId: signed.trustSeal.signingKeyId,
          manifestContentSha256: signed.trustSeal.manifestContentSha256,
          packageRelativePath: f.packageRelativePath,
        }),
      });
    }
    return signed;
  }

  /**
   * Convenience method: builds and signs a complete Dossier Manifest for this case.
   */
  public async generateAndSignManifest(
    caseInfo: { title: string; category: string; exportTimestampUtc?: string },
    privateKeyPem: string,
    options?: ManifestBuildOptions
  ): Promise<DossierManifest> {
    const unsealed = this.generateManifest(caseInfo, options);
    return this.signManifest(unsealed, privateKeyPem, options?.signingKeyId);
  }

  /**
   * Executes offline verification of a dossier manifest against this case or package files.
   * Appends VERIFICATION_AUDIT_EXECUTED events for verified files.
   */
  public async verifyDossier(
    manifest: DossierManifest | string,
    trustedKeyset?: PublicKeyset | PublicKeyEntry[],
    files?: FileInputCollection
  ): Promise<VerificationReport> {
    const report = await verifyManifestOffline(manifest, { trustedKeyset, files });
    for (const res of report.fileResults) {
      if (res.evidenceId) {
        await this.provenanceRecorder.recordEvent({
          evidenceId: res.evidenceId,
          eventType: 'VERIFICATION_AUDIT_EXECUTED',
          eventOutcome: res.status === 'MATCH' ? 'SUCCESS' : 'FAILED',
          softwareComponent: SOFTWARE_COMPONENTS.OFFLINE_VERIFIER,
          details: JSON.stringify({
            status: res.status,
            expectedSha256: res.expectedSha256,
            calculatedSha256: res.calculatedSha256 || null,
            details: res.details || null,
          }),
        });
      }
    }
    return report;
  }

  /**
   * Retrieves all recorded processing events for an evidence item.
   */
  public async getProcessingEvents(evidenceId: string): Promise<ProcessingEvent[]> {
    return this.provenanceRecorder.getEventsByEvidenceId(evidenceId);
  }

  /**
   * Retrieves all recorded processing events for this case in sequence order.
   */
  public async getAllProcessingEvents(): Promise<ProcessingEvent[]> {
    return this.provenanceRecorder.getAllEvents();
  }

  /**
   * Returns the underlying provenance recorder instance.
   */
  public getProvenanceRecorder(): ProvenanceRecorder {
    return this.provenanceRecorder;
  }
}

// Case-scoped singleton registry map
const caseRegisters = new Map<string, EvidenceRegister>();

/**
 * Returns or creates the dedicated EvidenceRegister for a given caseId.
 */
export function getEvidenceRegister(
  caseId: string,
  storageAdapter?: StorageAdapter,
  provenanceRecorder?: ProvenanceRecorder
): EvidenceRegister {
  const normalizedCaseId = caseId.trim();
  let register = caseRegisters.get(normalizedCaseId);
  if (!register) {
    register = new EvidenceRegister(normalizedCaseId, storageAdapter, provenanceRecorder);
    caseRegisters.set(normalizedCaseId, register);
  }
  return register;
}
