/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Timeline Types & Four-Tier Timestamp Taxonomy
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 1.3 & Module G)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { SupportedMimeType } from './forensicsTypes.js';

/**
 * Four-Tier Timestamp Taxonomy Hierarchy (Blueprint Section 1.3)
 */
export enum TimestampTier {
  /** Tier 1: User memory / assertion (Subjective Claim, Unverified) */
  TIER_1_USER_REPORTED = 'USER_REPORTED_INCIDENT_TIME',
  /** Tier 2: File-Embedded metadata (EXIF/PDF) (Unverified Device Metadata, subject to clock drift/spoofing) */
  TIER_2_FILE_EMBEDDED = 'FILE_EMBEDDED_METADATA_TIME',
  /** Tier 3: VeraTrace server clock at byte intake (Authoritative System Observation) */
  TIER_3_SYSTEM_RECEIPT = 'SYSTEM_RECEIPT_TIME',
  /** Tier 4: System execution / audit events (Cryptographic Audit Event) */
  TIER_4_AUDIT_PROCESSING = 'PROCESSING_AND_VERIFICATION_TIME',
}

/**
 * Timestamp precision classification
 */
export type TimePrecision = 'EXACT' | 'APPROXIMATE' | 'DATE_ONLY' | 'UNKNOWN';

/**
 * Input structure representing an incident event entered by the user
 * (Corresponds to Blueprint Prisma model IncidentEvent & Person 1 AddEventDialog)
 */
export interface UserIncidentEvent {
  /** Unique event identifier (e.g. 'tl_1' or UUID) */
  eventId?: string;
  /** Case identifier */
  caseId: string;
  /** Primary label / title of what occurred */
  label: string;
  /** Detailed narrative description (optional) */
  description?: string;
  /** Primary occurred time if known (ISO string, raw string, or Date) */
  occurredAt?: string | Date | null;
  /** Raw unparsed user entered time string (e.g. 'Yesterday at 10 PM') */
  rawUserEnteredTime?: string | null;
  /** Claimed user timezone (e.g. '+05:30' or 'Asia/Kolkata') */
  claimedTimezone?: string | null;
  /** User-stated or system-evaluated confidence */
  timeConfidence?: 'confirmed' | 'uncertain';
  /** Flag for uncertain timing */
  isTimeUncertain?: boolean;
  /** Linked evidence item ID if any */
  relatedEvidenceId?: string | null;
  /** Creation timestamp in system */
  createdAtUtc?: string;
}

/**
 * Minimal structural representation of evidence records required by timeline processing.
 * Decouples timeline logic from server-side Node.js storage modules for isomorphic browser support.
 */
export interface TimelineEvidenceInput {
  evidenceId: string;
  caseId: string;
  fileName: string;
  mimeType: SupportedMimeType;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  recordedAt: string;
  extractedMetadata?: {
    extractedFileTimeUtc?: string | null;
    extractedFileTimezone?: string | null;
  };
}

/**
 * Discrepancy observed between conflicting timestamp sources (e.g. User claim vs EXIF)
 */
export interface TimestampDiscrepancy {
  type: 'TIER_1_TIER_2_MISMATCH' | 'TIMEZONE_AMBIGUITY' | 'DEVICE_CLOCK_DRIFT';
  sourceA: {
    tier: TimestampTier;
    label: string;
    value: string;
  };
  sourceB: {
    tier: TimestampTier;
    label: string;
    value: string;
  };
  deltaMinutes?: number;
  description: string;
}

/**
 * Summary of an evidence record linked to a timeline entry
 */
export interface EvidenceRecordSummary {
  evidenceId: string;
  fileName: string;
  mimeType: SupportedMimeType;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  recordedAtUtc: string; // Tier 3
  extractedDeviceTimeUtc?: string | null; // Tier 2
  extractedTimezone?: string | null;
}

/**
 * Unified Timeline Entry adhering strictly to docs/DATA_CONTRACT.md and CaseOverview.jsx
 * while attaching rich forensic provenance and timestamp taxonomy attributes.
 */
export interface TimelineEntry {
  // --- Contract Fields (docs/DATA_CONTRACT.md & CaseOverview.jsx) ---
  /** Unique timeline event ID */
  eventId: string;
  /** Normalized occurredAt ISO string, or null if date is unknown */
  occurredAt: string | null;
  /** Confidence: 'confirmed' | 'uncertain' */
  timeConfidence: 'confirmed' | 'uncertain';
  /** Event title / label */
  label: string;
  /** Primary related evidence ID if linked */
  relatedEvidenceId: string | null;

  // --- Forensic Provenance & 4-Tier Attributes ---
  /** Case identifier */
  caseId: string;
  /** Event source classification */
  entrySource: 'USER_INCIDENT_EVENT' | 'PRESERVED_EVIDENCE' | 'HYBRID_LINKED';
  /** Primary timestamp tier used to determine chronological position */
  timestampTier: TimestampTier;
  /** Precision level of the timestamp */
  timePrecision: TimePrecision;
  /** Explicit flag indicating whether timing is tentative or uncertain */
  isTimeUncertain: boolean;
  /** Raw user-entered string before normalization */
  rawUserEnteredTime?: string | null;
  /** Claimed or extracted timezone */
  timezone?: string | null;
  /** Summary of attached evidence records */
  evidenceRecords: EvidenceRecordSummary[];
  /** Documented discrepancies between conflicting sources */
  discrepancies: TimestampDiscrepancy[];
}

/**
 * Configuration options for timeline processing
 */
export interface TimelineProcessingOptions {
  /**
   * Placement of undated / uncertain events:
   * 'END' (default in legal dossiers: undated items listed at end)
   * 'START'
   */
  undatedPlacement?: 'START' | 'END';
  /**
   * Threshold in minutes above which a difference between User Time (Tier 1)
   * and Device EXIF Time (Tier 2) is flagged as a discrepancy (default: 15 minutes).
   */
  discrepancyThresholdMinutes?: number;
  /**
   * Whether to include standalone preserved evidence records (not explicitly linked
   * to a user incident event) as distinct milestones in the timeline (default: true).
   */
  includeStandaloneEvidence?: boolean;
}
