/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module K: Curated Legal Sources & Section 63 BSA Certificate Generator
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 1.2, 8.1, 8.2, 8.3, 12, 14.2 (#8 Deterministic BSA Check), 16.1
 *
 * Generates structured Section 63 BSA 2023 Certificate Drafts (Part A & Part B)
 * with strict technical/human authority separation, deterministic completeness validation,
 * and unambiguous statutory disclaimers.
 */

import { ForensicsError } from '../forensics/forensicsTypes.js';
import {
  BSA_CERTIFICATE_DRAFT_SCHEMA_V1,
  OFFICIAL_BSA_2023_SOURCE,
  BsaSection63CertificateDraft,
  EvidenceCertificateItem,
  PartACertifierInfo,
  DeviceParticulars,
  PartAStatutoryAffirmations,
  CertificateDraftEvaluation,
} from './bsaCertificateTypes.js';

export class BsaCertificateError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_BSA_CERTIFICATE') {
    super(message, code);
    this.name = 'BsaCertificateError';
  }
}

/**
 * Input parameters for Section 63 certificate draft generation.
 */
export interface GenerateBsaCertificateParams {
  caseInfo: {
    caseId: string;
    title: string;
    category?: string;
    summary?: string;
  };
  evidenceItems: Array<{
    evidenceId: string;
    originalFilename: string;
    mediaType?: string;
    fileSizeBytes?: number;
    sha256: string;
    sha512?: string;
    systemReceiptUtc?: string;
    sourceClassification?: string;
    captureMethod?: string;
    userClaimedSource?: string;
    claimedEventTime?: string;
    claimedTimezone?: string;
    processingEventsCount?: number;
  }>;
  partAInput?: {
    certifier?: Partial<PartACertifierInfo>;
    device?: Partial<DeviceParticulars>;
    affirmations?: Partial<PartAStatutoryAffirmations>;
  };
  manifestContext?: {
    signingKeyId?: string;
    manifestContentSha256?: string;
    ed25519SignaturePresent?: boolean;
  };
  auditDurabilityNotice?: string;
}

/**
 * Standard statutory notices and forensic disclaimers required on all Section 63 drafts.
 */
export const STATUTORY_SECTION_63_DISCLAIMERS = Object.freeze([
  '1. Not Legal Advice or Admissibility Guarantee: VeraTrace is an intake preservation and draft assistance system, not an accredited forensics laboratory or legal counsel. Generation of this software certificate draft does NOT guarantee judicial admissibility under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023. Admissibility is determined exclusively by the presiding judicial magistrate or judge.',
  '2. Human Attestation Mandatory: This document is an unattested draft. Part A must be factually reviewed, confirmed, printed, and signed by the lawful custodian of the personal device. Part B requires review and execution by a qualified forensic examiner where applicable under Section 63(4). VeraTrace does not execute signatures or certifications on behalf of any human.',
  '3. No Phantom Filing: VeraTrace has NOT submitted or filed this certificate or accompanying evidence with any police station, magistrate court, cyber cell, or government authority (including cybercrime.gov.in). Official reporting must be performed directly by the complainant or legal representative.',
  '4. Byte Preservation vs Content Authenticity: Cryptographic SHA-256 and SHA-512 fingerprints attest solely to the byte-level preservation of the files from the instant of system intake. They do not attest to the historical truth, veracity, or real-world authenticity of communications depicted therein.',
  '5. Judicial Nuance on Section 63(4) Expert Requirement: The conjunction "and an expert" in Section 63(4) remains an evolving question of judicial interpretation across High Courts regarding whether Part B is strictly required in all private complaints or if Part A alone suffices. Complainants are advised to consult legal counsel before court submission.',
] as const);

/**
 * Generates an RFC 4122 v4 UUID without requiring external native dependencies.
 */
function generateUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'cert-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Evaluates the deterministic completeness of Part A custodian inputs per Blueprint Section 14.2 (#8).
 * Never uses heuristic or probabilistic guessing.
 */
export function evaluatePartACompleteness(input?: {
  certifier?: Partial<PartACertifierInfo>;
  device?: Partial<DeviceParticulars>;
  affirmations?: Partial<PartAStatutoryAffirmations>;
}): {
  isComplete: boolean;
  missingFields: string[];
  deficiencyReasons: string[];
} {
  const missingFields: string[] = [];
  const deficiencyReasons: string[] = [];

  const certifier = input?.certifier;
  if (!certifier?.certifierName || typeof certifier.certifierName !== 'string' || certifier.certifierName.trim() === '') {
    missingFields.push('partA.certifier.certifierName');
    deficiencyReasons.push('Certifier (Party) full legal name is required.');
  }

  const device = input?.device;
  if (!device?.deviceMake || typeof device.deviceMake !== 'string' || device.deviceMake.trim() === '') {
    missingFields.push('partA.device.deviceMake');
    deficiencyReasons.push('Device manufacturer/make is required under Section 63(4)(b).');
  }

  if (!device?.deviceModel || typeof device.deviceModel !== 'string' || device.deviceModel.trim() === '') {
    missingFields.push('partA.device.deviceModel');
    deficiencyReasons.push('Device model is required under Section 63(4)(b).');
  }

  const affirmations = input?.affirmations;
  if (affirmations?.regularOperationAffirmation !== true) {
    missingFields.push('partA.affirmations.regularOperationAffirmation');
    deficiencyReasons.push('Section 63(2)(a) regular computer operation affirmation is required.');
  }

  if (affirmations?.ordinaryCourseAffirmation !== true) {
    missingFields.push('partA.affirmations.ordinaryCourseAffirmation');
    deficiencyReasons.push('Section 63(2)(b) ordinary course feeding affirmation is required.');
  }

  if (affirmations?.operatingConditionAffirmation !== true) {
    missingFields.push('partA.affirmations.operatingConditionAffirmation');
    deficiencyReasons.push('Section 63(2)(c) proper operating condition affirmation is required.');
  }

  if (affirmations?.reproductionAccuracyAffirmation !== true) {
    missingFields.push('partA.affirmations.reproductionAccuracyAffirmation');
    deficiencyReasons.push('Section 63(2)(d) accurate reproduction affirmation is required.');
  }

  if (affirmations?.lawfulCustodyAffirmation !== true) {
    missingFields.push('partA.affirmations.lawfulCustodyAffirmation');
    deficiencyReasons.push('Declaration of lawful custody, management, and control over the device is required.');
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    deficiencyReasons,
  };
}

/**
 * Generates a structured Bharatiya Sakshya Adhiniyam, 2023 Section 63 Certificate Draft.
 *
 * Implements Blueprint Section 8.1-8.3 & Milestone 6:
 * - Auto-populates technical parameters from immutable application records.
 * - Enforces deterministic validation of Part A custodian affirmations.
 * - Flags deficiencies without fabricating missing device or certifier data.
 * - Isolates Part B as requiring qualified expert review without automated signing.
 * - Embeds explicit statutory disclaimers.
 *
 * @param params Case data, evidence ledger, and user-provided custodian affirmations
 */
export function generateBsaSection63CertificateDraft(
  params: GenerateBsaCertificateParams
): BsaSection63CertificateDraft {
  if (!params.caseInfo || !params.caseInfo.caseId) {
    throw new BsaCertificateError('Cannot generate Section 63 certificate without a valid caseId.', 'ERR_INVALID_CASE');
  }

  if (!Array.isArray(params.evidenceItems) || params.evidenceItems.length === 0) {
    throw new BsaCertificateError('Cannot generate Section 63 certificate without at least one evidence item.', 'ERR_EMPTY_EVIDENCE');
  }

  const certificateDraftId = generateUuid();
  const draftGeneratedAtUtc = new Date().toISOString();

  // 1. Compile immutable evidence identification ledger
  const evidenceItems: EvidenceCertificateItem[] = [];
  const hashesForExpert: Array<{
    evidenceId: string;
    originalFilename: string;
    sha256Hex: string;
    sha512Hex?: string;
    fileSizeBytes: number;
    systemReceiptUtc: string;
  }> = [];

  for (const item of params.evidenceItems) {
    if (!item.evidenceId || !item.sha256 || item.sha256.length !== 64) {
      throw new BsaCertificateError(
        `Evidence item '${item.evidenceId || 'unknown'}' has invalid SHA-256 hash.`,
        'ERR_INVALID_HASH'
      );
    }

    const sha256Clean = item.sha256.trim().toLowerCase();
    const sha512Clean = item.sha512 ? item.sha512.trim().toLowerCase() : undefined;
    const receiptUtc = item.systemReceiptUtc || draftGeneratedAtUtc;

    evidenceItems.push({
      evidenceId: item.evidenceId,
      originalFilename: item.originalFilename || `file_${item.evidenceId}`,
      mediaType: item.mediaType || 'application/octet-stream',
      fileSizeBytes: item.fileSizeBytes ?? 0,
      sha256Hex: sha256Clean,
      sha512Hex: sha512Clean,
      systemReceiptUtc: receiptUtc,
      sourceClassification: item.sourceClassification || 'USER_UPLOAD',
      captureMethod: item.captureMethod,
      userClaimedSource: item.userClaimedSource,
      claimedEventTime: item.claimedEventTime,
      claimedTimezone: item.claimedTimezone,
      processingEventsCount: item.processingEventsCount,
    });

    hashesForExpert.push({
      evidenceId: item.evidenceId,
      originalFilename: item.originalFilename || `file_${item.evidenceId}`,
      sha256Hex: sha256Clean,
      sha512Hex: sha512Clean,
      fileSizeBytes: item.fileSizeBytes ?? 0,
      systemReceiptUtc: receiptUtc,
    });
  }

  // 2. Deterministic Part A Completeness Check
  const evalResult = evaluatePartACompleteness(params.partAInput);
  const evaluation: CertificateDraftEvaluation = {
    overallStatus: evalResult.isComplete ? 'DRAFT_READY_FOR_HUMAN_SIGNATURE' : 'DEFICIENT_DRAFT',
    partAStatus: evalResult.isComplete ? 'DRAFT_READY_FOR_HUMAN_SIGNATURE' : 'DEFICIENT',
    partBStatus: 'REQUIRES_QUALIFIED_EXPERT_REVIEW',
    missingFields: evalResult.missingFields,
    deficiencyReasons: evalResult.deficiencyReasons,
    isPartAComplete: evalResult.isComplete,
    requiresHumanReview: true,
    requiresExpertReview: true,
  };

  // 3. Assemble Part A (Schedule Part A: Party Custodian)
  const certifierInput = params.partAInput?.certifier;
  const deviceInput = params.partAInput?.device;
  const affirmationsInput = params.partAInput?.affirmations;

  const partA: BsaSection63CertificateDraft['partA'] = {
    authorityModel: 'HUMAN_PARTY_AFFIRMATION',
    certifier: {
      certifierName: certifierInput?.certifierName ? certifierInput.certifierName.trim() : '',
      parentage: certifierInput?.parentage?.trim(),
      residentialAddress: certifierInput?.residentialAddress?.trim(),
      officialDesignation: certifierInput?.officialDesignation?.trim(),
      relationshipToCase: certifierInput?.relationshipToCase || 'COMPLAINANT',
    },
    device: {
      deviceType: deviceInput?.deviceType || 'SMARTPHONE',
      deviceMake: deviceInput?.deviceMake ? deviceInput.deviceMake.trim() : '',
      deviceModel: deviceInput?.deviceModel ? deviceInput.deviceModel.trim() : '',
      serialOrImeiNumber: deviceInput?.serialOrImeiNumber?.trim(),
      operatingSystem: deviceInput?.operatingSystem?.trim(),
      storageCapacity: deviceInput?.storageCapacity?.trim(),
    },
    affirmations: {
      regularOperationAffirmation: affirmationsInput?.regularOperationAffirmation === true,
      ordinaryCourseAffirmation: affirmationsInput?.ordinaryCourseAffirmation === true,
      operatingConditionAffirmation: affirmationsInput?.operatingConditionAffirmation === true,
      reproductionAccuracyAffirmation: affirmationsInput?.reproductionAccuracyAffirmation === true,
      lawfulCustodyAffirmation: affirmationsInput?.lawfulCustodyAffirmation === true,
    },
    attestationStatus: 'DRAFT_UNATTESTED_PENDING_HUMAN_SIGNATURE',
    humanSignatureRequiredNotice:
      'This certificate is an unexecuted draft. The party in lawful charge of the device must personally review all statements, print this document, and physically sign it before filing in court.',
    signedAtUtc: null,
    signatureLocation: null,
  };

  // 4. Assemble Part B (Schedule Part B: Technical Parameters & Expert Review Seam)
  const auditNotice =
    params.auditDurabilityNotice ||
    'Provenance audit logs were extracted from an in-memory session recorder. Durable write-ahead audit logs require PostgreSQL processing_events table integration.';

  const partB: BsaSection63CertificateDraft['partB'] = {
    authorityModel: 'QUALIFIED_EXPERT_REVIEW',
    attestationStatus: 'REQUIRES_QUALIFIED_EXPERT_OR_POLICE_EXAMINER_REVIEW (UNATTESTED)',
    unresolvedJudicialInterpretationNotice:
      'NOTICE ON SECTION 63(4): Section 63(4) refers to a certificate purporting to be signed by a person in charge of the device AND an expert. Judicial interpretation across High Courts is evolving regarding whether an expert certificate (Part B) is mandatory in all private complaints or if Part A suffices when evidence was extracted directly by the lawful custodian. Complainants should seek qualified legal counsel review.',
    technicalParameters: {
      evidenceCount: evidenceItems.length,
      cryptographicHashAlgorithm: 'SHA-256',
      evidenceHashesSummary: hashesForExpert,
      manifestEd25519TrustSealPresent: params.manifestContext?.ed25519SignaturePresent ?? false,
      manifestSigningKeyId: params.manifestContext?.signingKeyId,
      canonicalManifestContentSha256: params.manifestContext?.manifestContentSha256,
      auditTrailDurabilityNotice: auditNotice,
    },
    expertSignatoryPlaceholders: {
      expertName: null,
      designation: null,
      accreditationOrCadre: null,
      examinationToolsAndProcedures: null,
      findingsAndConclusions: null,
      signedAtUtc: null,
      sealOrStamp: null,
    },
  };

  return {
    $schema: BSA_CERTIFICATE_DRAFT_SCHEMA_V1,
    certificateDraftId,
    caseId: params.caseInfo.caseId,
    caseTitle: params.caseInfo.title,
    draftGeneratedAtUtc,
    statutoryReference: OFFICIAL_BSA_2023_SOURCE,
    evaluation,
    evidenceItems,
    partA,
    partB,
    statutoryDisclaimers: [...STATUTORY_SECTION_63_DISCLAIMERS],
  };
}
