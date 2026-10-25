/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Ed25519 Manifest Signer & Keyset Manager
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 10.2 (Exported Dossier Manifest), 11.2 (Offline Ed25519 Verification & Key Management)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { generateKeyPairSync, sign, KeyObject, createPrivateKey } from 'node:crypto';
import { ForensicsError } from './forensicsTypes.js';
import {
  PUBLIC_KEYSET_SCHEMA_V1,
  DossierManifest,
  UnsealedDossierManifest,
  ManifestBuildOptions,
  PublicKeyEntry,
  PublicKeyset,
  ManifestFileEntry,
} from './manifestTypes.js';
import {
  buildUnsealedManifest,
  getUnsignedCanonicalBytes,
  ManifestBuilderError,
} from './manifestBuilder.js';

export class ManifestSigningError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_MANIFEST_SIGNING') {
    super(message, code);
    this.name = 'ManifestSigningError';
  }
}

export interface GeneratedKeyPairResult {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  keyEntry: PublicKeyEntry;
}

/**
 * Generates an Ed25519 asymmetric key pair formatted in standard PKCS#8 and SPKI PEM.
 *
 * @param options Key identification and validity period configuration
 */
export function generateEd25519KeyPair(options?: {
  keyId?: string;
  validDays?: number;
}): GeneratedKeyPairResult {
  try {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const keyId = options?.keyId || `veratrace-ed25519-${Date.now()}`;
    const now = new Date();
    const validDays = options?.validDays ?? 365;
    const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

    const keyEntry: PublicKeyEntry = {
      keyId,
      algorithm: 'Ed25519',
      status: 'ACTIVE',
      validFromUtc: now.toISOString(),
      validUntilUtc: validUntil.toISOString(),
      publicKeyPem: publicKey,
    };

    return {
      keyId,
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
      keyEntry,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManifestSigningError(`Failed to generate Ed25519 keypair: ${msg}`, 'ERR_KEYGEN_FAILED');
  }
}

/**
 * Digitally signs an Unsealed Dossier Manifest using an Ed25519 private key.
 *
 * Implements Blueprint Section 11.2:
 * "VeraTrace signs the RFC 8785 (JSON Canonicalization Scheme - JCS) canonical bytes
 *  of the manifest (omitting the trustSeal.serverDigitalSignature field)."
 *
 * @param unsealedManifest Unsealed manifest containing case, files, and initial trustSeal
 * @param privateKeyPem Ed25519 private key in PKCS#8 PEM format or KeyObject
 * @param signingKeyId Optional key ID to enforce or override in trustSeal
 * @returns Fully signed DossierManifest with populated serverDigitalSignature
 */
export function signManifest(
  unsealedManifest: UnsealedDossierManifest,
  privateKeyPem: string | KeyObject,
  signingKeyId?: string
): DossierManifest {
  if (!unsealedManifest) {
    throw new ManifestSigningError('Cannot sign undefined or null manifest.', 'ERR_INVALID_MANIFEST');
  }

  if (!privateKeyPem) {
    throw new ManifestSigningError('Private key is required to sign manifest.', 'ERR_MISSING_PRIVATE_KEY');
  }

  // Update signingKeyId if provided
  if (signingKeyId && unsealedManifest.trustSeal) {
    unsealedManifest.trustSeal.signingKeyId = signingKeyId;
  }

  if (!unsealedManifest.trustSeal?.signingKeyId) {
    throw new ManifestSigningError('Manifest trust seal must define a signingKeyId.', 'ERR_MISSING_KEY_ID');
  }

  try {
    // 1. Get canonical bytes of unsigned payload (omitting serverDigitalSignature)
    const canonicalBytes = getUnsignedCanonicalBytes(unsealedManifest);

    // 2. Compute Ed25519 signature
    // In Node.js crypto, algorithm is null for ed25519 as per RFC 8032
    const key = typeof privateKeyPem === 'string' ? createPrivateKey(privateKeyPem) : privateKeyPem;
    const signatureBuffer = sign(null, canonicalBytes, key);
    const serverDigitalSignature = signatureBuffer.toString('base64');

    // 3. Assemble completed, sealed manifest
    const sealedManifest: DossierManifest = {
      $schema: unsealedManifest.$schema,
      manifestVersion: unsealedManifest.manifestVersion,
      generator: { ...unsealedManifest.generator },
      case: { ...unsealedManifest.case },
      trustSeal: {
        digestAlgorithm: 'SHA-256',
        manifestContentSha256: unsealedManifest.trustSeal.manifestContentSha256!,
        canonicalizationAlgorithm: 'RFC8785_JCS',
        signatureAlgorithm: 'ED25519',
        signingKeyId: unsealedManifest.trustSeal.signingKeyId,
        serverDigitalSignature,
        verificationEndpoint: unsealedManifest.trustSeal.verificationEndpoint || 'https://veratrace.org/api/v1/verification-runs',
      },
      files: [...unsealedManifest.files],
      disclaimers: [...unsealedManifest.disclaimers],
    };

    return sealedManifest;
  } catch (err: unknown) {
    if (err instanceof ForensicsError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManifestSigningError(`Manifest signing failed: ${msg}`, 'ERR_SIGNATURE_FAILED');
  }
}

/**
 * Convenience pipeline: builds an unsealed manifest and immediately signs it.
 */
export function createAndSignManifest(
  caseInfo: {
    caseId: string;
    title: string;
    category: string;
    exportTimestampUtc?: string;
  },
  files: Array<Partial<ManifestFileEntry> & { evidenceId: string; sha256: string }>,
  privateKeyPem: string | KeyObject,
  options?: ManifestBuildOptions
): DossierManifest {
  const unsealed = buildUnsealedManifest(caseInfo, files, options);
  return signManifest(unsealed, privateKeyPem, options?.signingKeyId);
}

/**
 * Builds a published public keyset structure conforming to Blueprint Section 11.2.
 */
export function createPublicKeyset(keys: PublicKeyEntry[]): PublicKeyset {
  return {
    $schema: PUBLIC_KEYSET_SCHEMA_V1,
    keys: [...keys],
  };
}
