/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Dossier Manifest Builder
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 10.2 (Exported Dossier Manifest), 11.2 (Deterministic Canonicalization)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { canonicalizeJson, hashCanonicalJson } from './canonicalJson.js';
import {
  DOSSIER_MANIFEST_SCHEMA_V1,
  DEFAULT_GENERATOR_INFO,
  DEFAULT_MANIFEST_DISCLAIMERS,
  DossierManifest,
  UnsealedDossierManifest,
  ManifestCaseInfo,
  ManifestFileEntry,
  ManifestBuildOptions,
  UnsealedTrustSeal,
} from './manifestTypes.js';
import { ForensicsError } from './forensicsTypes.js';

export class ManifestBuilderError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_MANIFEST_BUILDER') {
    super(message, code);
    this.name = 'ManifestBuilderError';
  }
}

/**
 * Extracts core manifest content excluding the trust seal.
 * Used for computing the content SHA-256 digest.
 */
export function getManifestCoreContent(manifest: DossierManifest | UnsealedDossierManifest) {
  return {
    $schema: manifest.$schema,
    manifestVersion: manifest.manifestVersion,
    generator: {
      software: manifest.generator.software,
      version: manifest.generator.version,
      jurisdictionProfile: manifest.generator.jurisdictionProfile,
    },
    case: {
      caseId: manifest.case.caseId,
      title: manifest.case.title,
      category: manifest.case.category,
      exportTimestampUtc: manifest.case.exportTimestampUtc,
    },
    files: manifest.files,
    disclaimers: manifest.disclaimers,
  };
}

/**
 * Computes the canonical SHA-256 hexadecimal digest of the core manifest content.
 */
export function computeManifestContentSha256(manifest: DossierManifest | UnsealedDossierManifest): string {
  const core = getManifestCoreContent(manifest);
  return hashCanonicalJson(core);
}

/**
 * Returns the manifest payload ready for Ed25519 signing by omitting the
 * trustSeal.serverDigitalSignature property per Blueprint Section 11.2.
 */
export function getUnsignedManifestPayload(
  manifest: DossierManifest | UnsealedDossierManifest
): Record<string, unknown> {
  const trustSealSource = manifest.trustSeal;
  if (!trustSealSource) {
    throw new ManifestBuilderError('Manifest is missing trustSeal object.', 'ERR_MISSING_TRUST_SEAL');
  }

  // Omit serverDigitalSignature
  const { serverDigitalSignature: _, ...unsignedTrustSeal } = trustSealSource as any;

  return {
    $schema: manifest.$schema,
    manifestVersion: manifest.manifestVersion,
    generator: {
      software: manifest.generator.software,
      version: manifest.generator.version,
      jurisdictionProfile: manifest.generator.jurisdictionProfile,
    },
    case: {
      caseId: manifest.case.caseId,
      title: manifest.case.title,
      category: manifest.case.category,
      exportTimestampUtc: manifest.case.exportTimestampUtc,
    },
    trustSeal: unsignedTrustSeal,
    files: manifest.files,
    disclaimers: manifest.disclaimers,
  };
}

/**
 * Serializes the unsigned manifest payload to RFC 8785 canonical bytes.
 */
export function getUnsignedCanonicalBytes(
  manifest: DossierManifest | UnsealedDossierManifest
): Buffer {
  const unsignedPayload = getUnsignedManifestPayload(manifest);
  const canonicalString = canonicalizeJson(unsignedPayload);
  return Buffer.from(canonicalString, 'utf8');
}

/**
 * Formats and normalizes evidence records or file items into deterministic ManifestFileEntry records.
 */
export function normalizeManifestFileEntries(
  files: Array<Partial<ManifestFileEntry> & { evidenceId: string; sha256: string }>,
  defaultReceiptUtc?: string
): ManifestFileEntry[] {
  const fallbackUtc = defaultReceiptUtc || new Date().toISOString();
  return files.map((file) => {
    if (!file.evidenceId || typeof file.evidenceId !== 'string') {
      throw new ManifestBuilderError('Evidence entry must have a non-empty evidenceId.', 'ERR_INVALID_FILE_ENTRY');
    }
    if (!file.sha256 || typeof file.sha256 !== 'string' || file.sha256.length !== 64) {
      throw new ManifestBuilderError(
        `Evidence entry '${file.evidenceId}' has invalid sha256: expected 64-char hex string.`,
        'ERR_INVALID_FILE_SHA256'
      );
    }

    const originalFilename = file.originalFilename || (file as any).fileName || `file_${file.evidenceId}`;
    const cleanFilename = originalFilename.replace(/[/\\?%*:|"<>]/g, '_');
    const packageRelativePath = file.packageRelativePath || `evidence/${file.evidenceId}_${cleanFilename}`;

    // Disallow path traversal
    if (packageRelativePath.includes('..') || packageRelativePath.startsWith('/') || packageRelativePath.startsWith('\\')) {
      throw new ManifestBuilderError(
        `Insecure packageRelativePath detected: '${packageRelativePath}'`,
        'ERR_PATH_TRAVERSAL'
      );
    }

    return {
      evidenceId: file.evidenceId.trim(),
      packageRelativePath,
      originalFilename,
      mediaType: file.mediaType || (file as any).mimeType || 'application/octet-stream',
      fileSizeBytes: typeof file.fileSizeBytes === 'number' ? file.fileSizeBytes : (file as any).sizeBytes ?? 0,
      sha256: file.sha256.trim().toLowerCase(),
      systemReceiptUtc: file.systemReceiptUtc || (file as any).recordedAt || (file as any).receivedAtUtc || fallbackUtc,
      sourceClassification: file.sourceClassification || (file as any).userClaimedSource || 'USER_UPLOAD',
    };
  }).sort((a, b) => a.packageRelativePath.localeCompare(b.packageRelativePath));
}

/**
 * Assembles an Unsealed Dossier Manifest ready for cryptographic signing.
 *
 * @param caseInfo Case identification and export metadata
 * @param files Preserved evidence files to include
 * @param options Generator, signing key, and disclaimer overrides
 */
export function buildUnsealedManifest(
  caseInfo: {
    caseId: string;
    title: string;
    category: string;
    exportTimestampUtc?: string;
  },
  files: Array<Partial<ManifestFileEntry> & { evidenceId: string; sha256: string }>,
  options?: ManifestBuildOptions
): UnsealedDossierManifest & { trustSeal: UnsealedTrustSeal } {
  if (!caseInfo.caseId || typeof caseInfo.caseId !== 'string') {
    throw new ManifestBuilderError('Manifest requires a valid non-empty caseId.', 'ERR_INVALID_CASE_INFO');
  }
  if (!caseInfo.title || typeof caseInfo.title !== 'string') {
    throw new ManifestBuilderError('Manifest requires a valid non-empty title.', 'ERR_INVALID_CASE_INFO');
  }
  if (!caseInfo.category || typeof caseInfo.category !== 'string') {
    throw new ManifestBuilderError('Manifest requires a valid non-empty category.', 'ERR_INVALID_CASE_INFO');
  }

  const exportTimestampUtc = options?.exportTimestampUtc || caseInfo.exportTimestampUtc || new Date().toISOString();

  // Sort files deterministically by package relative path
  const normalizedFiles = normalizeManifestFileEntries(files, exportTimestampUtc);

  const manifest: UnsealedDossierManifest = {
    $schema: DOSSIER_MANIFEST_SCHEMA_V1,
    manifestVersion: 1,
    generator: {
      software: options?.software || DEFAULT_GENERATOR_INFO.software,
      version: options?.version || DEFAULT_GENERATOR_INFO.version,
      jurisdictionProfile: options?.jurisdictionProfile || DEFAULT_GENERATOR_INFO.jurisdictionProfile,
    },
    case: {
      caseId: caseInfo.caseId.trim(),
      title: caseInfo.title.trim(),
      category: caseInfo.category.trim(),
      exportTimestampUtc,
    },
    files: normalizedFiles,
    disclaimers: options?.disclaimers ? [...options.disclaimers] : [...DEFAULT_MANIFEST_DISCLAIMERS],
  };

  // Compute canonical SHA-256 digest of core manifest content
  const manifestContentSha256 = computeManifestContentSha256(manifest);

  const trustSeal: UnsealedTrustSeal = {
    digestAlgorithm: 'SHA-256',
    manifestContentSha256,
    canonicalizationAlgorithm: 'RFC8785_JCS',
    signatureAlgorithm: 'ED25519',
    signingKeyId: options?.signingKeyId || 'veratrace-ed25519-2026-q4',
    verificationEndpoint: options?.verificationEndpoint || 'https://veratrace.org/api/v1/verification-runs',
  };

  return {
    ...manifest,
    trustSeal,
  };
}
