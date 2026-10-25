/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module K: Curated Legal Sources & BSA 2023 Section 63 Certificate Types
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 1.2 (Invariant Legal Distinctions), 8.1-8.3 (Section 63 BSA Workflow),
 *           12 (Curated Legal Source Provenance), 14.2 (#8 Deterministic BSA Check),
 *           16.1 (BSA Section 63 Attestation Model)
 *
 * Statutory Authority:
 * The Bharatiya Sakshya Adhiniyam, 2023 (Act No. 47 of 2023), Section 63 & The Schedule.
 * Enacted 25th December 2023; Enforced with effect from 1st July 2024 (MHA Notification S.O. 848(E)).
 */

export const BSA_CERTIFICATE_DRAFT_SCHEMA_V1 = 'https://veratrace.org/schemas/v1/bsa-certificate-draft.json';

/**
 * Official curated statutory source citation metadata.
 */
export interface CuratedLegalSourceRef {
  sourceIdentifier: 'BSA_2023_ACT_47';
  officialTitle: string;
  issuingAuthority: string;
  enactmentDate: string;
  effectiveDate: string;
  relevantProvisions: string;
  officialPublicationUrl: string;
}

export const OFFICIAL_BSA_2023_SOURCE: CuratedLegalSourceRef = Object.freeze({
  sourceIdentifier: 'BSA_2023_ACT_47',
  officialTitle: 'The Bharatiya Sakshya Adhiniyam, 2023 (Act No. 47 of 2023)',
  issuingAuthority: 'Ministry of Law and Justice, Legislative Department, Govt. of India',
  enactmentDate: '2023-12-25',
  effectiveDate: '2024-07-01',
  relevantProvisions: 'Section 63 (Admissibility of electronic records) & The Schedule (Part A & Part B)',
  officialPublicationUrl: 'https://www.indiacode.nic.in/handle/123456789/21727',
});

/**
 * Overall evaluation status of the Section 63 draft.
 * NOTE: Software NEVER evaluates or claims judicial admissibility.
 */
export type CertificateEvaluationStatus =
  | 'DRAFT_READY_FOR_HUMAN_SIGNATURE'
  | 'DEFICIENT_DRAFT';

/**
 * Device Particulars under BSA Section 63(4)(b) & Schedule Part A.
 */
export interface DeviceParticulars {
  deviceType: 'SMARTPHONE' | 'LAPTOP' | 'TABLET' | 'DESKTOP' | 'SERVER' | 'OTHER';
  deviceMake: string;
  deviceModel: string;
  serialOrImeiNumber?: string;
  operatingSystem?: string;
  storageCapacity?: string;
}

/**
 * Information regarding the person in lawful charge of the device (Schedule Part A).
 */
export interface PartACertifierInfo {
  certifierName: string;
  parentage?: string;
  residentialAddress?: string;
  officialDesignation?: string;
  relationshipToCase: 'COMPLAINANT' | 'VICTIM' | 'LAWFUL_CUSTODIAN' | 'DEVICE_OPERATOR' | 'OTHER';
}

/**
 * Mandatory factual affirmations under BSA 2023 Section 63(2)(a)-(d) and Schedule Part A.
 */
export interface PartAStatutoryAffirmations {
  /**
   * Affirms that the computer was produced by the computer during the period over which
   * the computer was used regularly to store or process information (Sec 63(2)(a)).
   */
  regularOperationAffirmation: boolean;

  /**
   * Affirms that during the said period, information of the kind contained in the electronic
   * record was regularly fed into the computer in the ordinary course of activities (Sec 63(2)(b)).
   */
  ordinaryCourseAffirmation: boolean;

  /**
   * Affirms that throughout the material part of the said period, the computer was operating properly
   * or that any temporary defect did not affect the accuracy of the electronic record (Sec 63(2)(c)).
   */
  operatingConditionAffirmation: boolean;

  /**
   * Affirms that the electronic record accurately reproduces or is derived from information
   * fed into the computer in the ordinary course of activities (Sec 63(2)(d)).
   */
  reproductionAccuracyAffirmation: boolean;

  /**
   * Affirms that the certifier exercised lawful management, custody, or control over the device.
   */
  lawfulCustodyAffirmation: boolean;
}

/**
 * Schedule Part A: Draft Certificate to be filled and signed by the Party.
 */
export interface PartASection63PartyDraft {
  authorityModel: 'HUMAN_PARTY_AFFIRMATION';
  certifier: PartACertifierInfo;
  device: DeviceParticulars;
  affirmations: PartAStatutoryAffirmations;
  attestationStatus: 'DRAFT_UNATTESTED_PENDING_HUMAN_SIGNATURE';
  humanSignatureRequiredNotice: string;
  signedAtUtc: null;
  signatureLocation: null;
}

/**
 * Technical parameters auto-populated for forensic expert examination (Schedule Part B).
 */
export interface PartBTechnicalParameters {
  evidenceCount: number;
  cryptographicHashAlgorithm: 'SHA-256';
  evidenceHashesSummary: Array<{
    evidenceId: string;
    originalFilename: string;
    sha256Hex: string;
    sha512Hex?: string;
    fileSizeBytes: number;
    systemReceiptUtc: string;
  }>;
  manifestEd25519TrustSealPresent: boolean;
  manifestSigningKeyId?: string;
  canonicalManifestContentSha256?: string;
  auditTrailDurabilityNotice: string;
}

/**
 * Schedule Part B: Certificate by Forensic Expert under Section 63(4).
 * VeraTrace NEVER automatically executes Part B.
 */
export interface PartBSection63ExpertDraft {
  authorityModel: 'QUALIFIED_EXPERT_REVIEW';
  attestationStatus: 'REQUIRES_QUALIFIED_EXPERT_OR_POLICE_EXAMINER_REVIEW (UNATTESTED)';
  unresolvedJudicialInterpretationNotice: string;
  technicalParameters: PartBTechnicalParameters;
  expertSignatoryPlaceholders: {
    expertName: null;
    designation: null;
    accreditationOrCadre: null;
    examinationToolsAndProcedures: null;
    findingsAndConclusions: null;
    signedAtUtc: null;
    sealOrStamp: null;
  };
}

/**
 * Individual evidence item metadata formatted for Section 63 identification.
 */
export interface EvidenceCertificateItem {
  evidenceId: string;
  originalFilename: string;
  mediaType: string;
  fileSizeBytes: number;
  sha256Hex: string;
  sha512Hex?: string;
  systemReceiptUtc: string;
  sourceClassification: string;
  captureMethod?: string;
  userClaimedSource?: string;
  claimedEventTime?: string;
  claimedTimezone?: string;
  processingEventsCount?: number;
}

/**
 * Evaluation summary of the certificate draft requirements.
 */
export interface CertificateDraftEvaluation {
  overallStatus: CertificateEvaluationStatus;
  partAStatus: 'DRAFT_READY_FOR_HUMAN_SIGNATURE' | 'DEFICIENT';
  partBStatus: 'REQUIRES_QUALIFIED_EXPERT_REVIEW';
  missingFields: string[];
  deficiencyReasons: string[];
  isPartAComplete: boolean;
  requiresHumanReview: true;
  requiresExpertReview: true;
}

/**
 * Complete, structured BSA 2023 Section 63 Certificate Draft.
 */
export interface BsaSection63CertificateDraft {
  $schema: string;
  certificateDraftId: string;
  caseId: string;
  caseTitle: string;
  draftGeneratedAtUtc: string;
  statutoryReference: CuratedLegalSourceRef;
  evaluation: CertificateDraftEvaluation;
  evidenceItems: EvidenceCertificateItem[];
  partA: PartASection63PartyDraft;
  partB: PartBSection63ExpertDraft;
  statutoryDisclaimers: string[];
}
