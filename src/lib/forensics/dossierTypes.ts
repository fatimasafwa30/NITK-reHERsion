/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module I: Dossier Generation Engine & Export Packaging — Type Definitions
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 3 (Module Architecture), 6 (Dossier Schema), 10.2 (Exported Dossier Manifest),
 *           11.1/11.2 (Trust Model), 15 (Roadmap Phase 4 / Milestone 5)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { ForensicsError } from './forensicsTypes.js';
import { DossierManifest, ManifestTrustSeal, ManifestFileEntry } from './manifestTypes.js';
import { TimelineEntry } from './timelineTypes.js';
import { StorageAdapter } from '../storage/storageTypes.js';
import { ProcessingEvent } from './provenanceRecorder.js';

export class DossierPackagingError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_DOSSIER_PACKAGING') {
    super(message, code);
    this.name = 'DossierPackagingError';
  }
}

export type DossierEntryRole =
  | 'MANIFEST'
  | 'RAW_EVIDENCE'
  | 'DERIVED_PREVIEW'
  | 'AUDIT_LOG'
  | 'TIMELINE'
  | 'SUMMARY_REPORT'
  | 'DOSSIER_INDEX'
  | 'STATUTORY_CERTIFICATE';

export interface DossierCaseInfo {
  caseId: string;
  title: string;
  category: string;
  summary?: string;
  exportTimestampUtc?: string;
}

export interface DossierArchiveEntryMetadata {
  path: string;
  role: DossierEntryRole;
  sha256?: string;
  sizeBytes?: number;
  description: string;
}

export interface DossierProvenanceMetadata {
  persistenceModel: 'IN_MEMORY_SESSION' | 'DURABLE_DATABASE';
  durableStorage: boolean;
  auditEventCount: number;
  persistenceNotice: string;
}

export interface DossierIndex {
  $schema: string;
  dossierId: string;
  caseId: string;
  dossierVersion: number;
  generatedAtUtc: string;
  generator: {
    software: string;
    version: string;
    jurisdictionProfile: string;
  };
  case: {
    caseId: string;
    title: string;
    category: string;
    summary?: string;
    exportTimestampUtc: string;
  };
  trustSeal: {
    digestAlgorithm: string;
    manifestContentSha256: string;
    canonicalizationAlgorithm: string;
    signatureAlgorithm: string;
    signingKeyId: string;
    serverDigitalSignature: string;
    verificationEndpoint: string;
  };
  archiveInventory: DossierArchiveEntryMetadata[];
  provenanceMetadata: DossierProvenanceMetadata;
  verificationInstructions: string[];
  forensicAndLegalDisclaimers: string[];
}

export interface DossierPackagingOptions {
  /**
   * Unique dossier identifier (UUID v4). Defaults to auto-generated UUID.
   */
  dossierId?: string;

  /**
   * Version of the dossier schema. Defaults to 1 (per Blueprint Dossier model).
   */
  dossierVersion?: number;

  /**
   * Ed25519 private key PEM for signing the manifest. If omitted, uses default active server key.
   */
  signingPrivateKeyPem?: string;

  /**
   * Key identifier of the signing key. Defaults to 'veratrace-ed25519-2026-q4'.
   */
  signingKeyId?: string;

  /**
   * Whether to include generated derived previews in the archive. Defaults to true.
   */
  includePreviews?: boolean;

  /**
   * Whether to generate and include the PDF summary report in the archive. Defaults to true.
   */
  includePdfReport?: boolean;

  /**
   * Additional custom legal or organizational disclaimers.
   */
  customDisclaimers?: string[];

  /**
   * Custom storage adapter instance. Defaults to active singleton storage adapter.
   */
  storageAdapter?: StorageAdapter;

  /**
   * Explicit processing events to bundle in audit/processing_events.json.
   * If omitted, queries the provenance recorder.
   */
  processingEvents?: ProcessingEvent[];

  /**
   * Explicit timeline events to bundle in timeline/timeline_events.json.
   */
  timelineEvents?: TimelineEntry[];

  /**
   * Requesting user ID for access logging and Person 3 session verification seam.
   */
  requestingUserId?: string;

  /**
   * Optional Section 63 BSA 2023 Certificate Draft to bundle in legal/bsa_section_63_certificate.json.
   */
  bsaCertificateDraft?: unknown;
}

export interface DossierPackagingResult {
  /** Dossier unique identifier */
  dossierId: string;
  /** Associated Case ID */
  caseId: string;
  /** Dossier version */
  dossierVersion: number;
  /** Logical storage key where ZIP archive is saved (e.g. dossiers/{caseId}/{dossierId}.zip) */
  zipArchiveStorageKey: string;
  /** Logical storage key where PDF report is saved (if generated) */
  pdfReportStorageKey?: string;
  /** Cryptographic SHA-256 hex digest of the final ZIP archive */
  zipSha256Hex: string;
  /** Total byte size of the generated ZIP archive */
  zipSizeBytes: number;
  /** Number of raw evidence files packaged */
  includedEvidenceCount: number;
  /** Number of derived previews packaged */
  includedPreviewCount: number;
  /** Number of chronological timeline events included */
  includedTimelineEventCount: number;
  /** Number of provenance audit events included */
  includedAuditEventCount: number;
  /** The signed manifest object included in the archive */
  manifest: DossierManifest;
  /** The exact signed manifest JSON string packaged at veratrace_manifest.v1.json */
  manifestJsonString: string;
  /** Complete machine-readable index structure */
  index: DossierIndex;
  /** Timestamp in UTC ISO 8601 when packaging finished */
  generatedAtUtc: string;
}

export interface PdfReportData {
  caseInfo: DossierCaseInfo;
  manifest: DossierManifest;
  evidence: Array<{
    evidenceId: string;
    originalFilename: string;
    mediaType: string;
    fileSizeBytes: number;
    sha256: string;
    packageRelativePath: string;
    systemReceiptUtc?: string;
    sourceClassification?: string;
  }>;
  timelineEvents?: TimelineEntry[];
  provenanceMetadata?: DossierProvenanceMetadata;
}
