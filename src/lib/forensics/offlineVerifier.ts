/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module J: Standalone Offline Verification Engine
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 11.1 (Verification State Machine), 11.2 (Offline Ed25519 Verification & Circular Trust Protection)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Standalone offline verifier executing zero-network asymmetric signature verification,
 * RFC 8785 canonical digest validation, and SHA-256 byte-preservation checks.
 */

import { verify, createPublicKey, KeyObject } from 'node:crypto';
import zlib from 'node:zlib';
import { hashBuffer } from './streamingHasher.js';
import { ForensicsError } from './forensicsTypes.js';
import {
  DossierManifest,
  PublicKeyset,
  PublicKeyEntry,
  VerificationReport,
  VerificationFileResultItem,
  VerificationOutcomeStatus,
  PublicKeyStatus,
  VerifyZipDossierOptions,
  ZipDossierVerificationReport,
  KNOWN_AUXILIARY_DOSSIER_PATHS,
  PUBLIC_KEYSET_SCHEMA_V1,
} from './manifestTypes.js';
import {
  computeManifestContentSha256,
  getUnsignedCanonicalBytes,
} from './manifestBuilder.js';

export class OfflineVerifierError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_OFFLINE_VERIFIER') {
    super(message, code);
    this.name = 'OfflineVerifierError';
  }
}

export type FileInputCollection =
  | Map<string, Buffer | Uint8Array>
  | Record<string, Buffer | Uint8Array>
  | Array<{ packageRelativePath: string; buffer: Buffer | Uint8Array }>;

export interface VerifyManifestOptions {
  /**
   * Pinned or out-of-band authenticated keyset.
   * MITIGATING THE CIRCULAR TRUST TRAP: Must NOT be loaded from inside an untrusted archive.
   */
  trustedKeyset?: PublicKeyset | PublicKeyEntry[];
  /**
   * Direct trusted public key PEM (convenience for single-key out-of-band trust anchors)
   */
  trustedPublicKeyPem?: string;
  /**
   * Preserved evidence file buffers extracted from dossier package
   */
  files?: FileInputCollection;
}

/**
 * Normalizes varied file input representations into a unified Map<packageRelativePath, Buffer>.
 */
function normalizeFilesCollection(files?: FileInputCollection): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  if (!files) return result;

  if (files instanceof Map) {
    for (const [path, buf] of files.entries()) {
      result.set(path.replace(/\\/g, '/'), Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    }
  } else if (Array.isArray(files)) {
    for (const item of files) {
      const path = item.packageRelativePath.replace(/\\/g, '/');
      result.set(path, Buffer.isBuffer(item.buffer) ? item.buffer : Buffer.from(item.buffer));
    }
  } else if (typeof files === 'object') {
    for (const [path, buf] of Object.entries(files)) {
      result.set(path.replace(/\\/g, '/'), Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    }
  }

  return result;
}

/**
 * Checks whether a given archive path corresponds to a known auxiliary dossier artifact
 * (such as index, reports, audit logs, timelines, previews, or well-known metadata).
 */
export function isRecognizedAuxiliaryDossierPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  const norm = path.replace(/\\/g, '/');
  if ((KNOWN_AUXILIARY_DOSSIER_PATHS as readonly string[]).includes(norm)) {
    return true;
  }
  if (
    norm.startsWith('audit/') ||
    norm.startsWith('timeline/') ||
    norm.startsWith('reports/') ||
    norm.startsWith('previews/') ||
    norm.startsWith('legal/') ||
    norm.startsWith('.well-known/') ||
    norm.startsWith('manifest/')
  ) {
    return true;
  }
  return false;
}

/**
 * Validates manifest structural conformance to Dossier Manifest v1 schema.
 */
function validateManifestStructure(data: unknown): { valid: boolean; manifest?: DossierManifest; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Manifest must be a non-null object.' };
  }

  const m = data as Partial<DossierManifest>;

  if (typeof m.$schema !== 'string' || !m.$schema.includes('dossier-manifest')) {
    return { valid: false, error: 'Manifest $schema is missing or invalid.' };
  }

  if (m.manifestVersion !== 1) {
    return { valid: false, error: `Unsupported manifestVersion: ${m.manifestVersion} (expected 1).` };
  }

  if (!m.generator || typeof m.generator !== 'object' || !m.generator.software) {
    return { valid: false, error: 'Manifest generator metadata is missing or invalid.' };
  }

  if (!m.case || typeof m.case !== 'object' || !m.case.caseId || !m.case.title) {
    return { valid: false, error: 'Manifest case identification is missing or invalid.' };
  }

  if (!m.trustSeal || typeof m.trustSeal !== 'object') {
    return { valid: false, error: 'Manifest cryptographic trustSeal is missing.' };
  }

  const s = m.trustSeal;
  if (s.signatureAlgorithm !== 'ED25519') {
    return { valid: false, error: `Unsupported signatureAlgorithm: '${s.signatureAlgorithm}' (expected ED25519).` };
  }

  if (s.canonicalizationAlgorithm !== 'RFC8785_JCS') {
    return { valid: false, error: `Unsupported canonicalizationAlgorithm: '${s.canonicalizationAlgorithm}' (expected RFC8785_JCS).` };
  }

  if (!s.signingKeyId || typeof s.signingKeyId !== 'string') {
    return { valid: false, error: 'Manifest trustSeal is missing signingKeyId.' };
  }

  if (!s.serverDigitalSignature || typeof s.serverDigitalSignature !== 'string') {
    return { valid: false, error: 'Manifest trustSeal is missing serverDigitalSignature.' };
  }

  if (!s.manifestContentSha256 || typeof s.manifestContentSha256 !== 'string' || s.manifestContentSha256.length !== 64) {
    return { valid: false, error: 'Manifest trustSeal has invalid manifestContentSha256.' };
  }

  if (!Array.isArray(m.files)) {
    return { valid: false, error: 'Manifest files list must be an array.' };
  }

  for (let i = 0; i < m.files.length; i++) {
    const f = m.files[i];
    if (!f.evidenceId || !f.packageRelativePath || !f.sha256 || f.sha256.length !== 64) {
      return { valid: false, error: `Manifest file entry at index ${i} is missing required fields (evidenceId, packageRelativePath, or sha256).` };
    }
  }

  return { valid: true, manifest: m as DossierManifest };
}

/**
 * Resolves a public key from the out-of-band trusted keyset.
 */
function resolveTrustedKey(
  signingKeyId: string,
  options: VerifyManifestOptions
): { keyEntry?: PublicKeyEntry; keyStatus: PublicKeyStatus | 'UNTRUSTED'; error?: string } {
  // If a direct PEM was provided, match it
  if (options.trustedPublicKeyPem) {
    return {
      keyEntry: {
        keyId: signingKeyId,
        algorithm: 'Ed25519',
        status: 'ACTIVE',
        publicKeyPem: options.trustedPublicKeyPem,
      },
      keyStatus: 'ACTIVE',
    };
  }

  const rawKeyset = options.trustedKeyset;
  if (!rawKeyset) {
    return {
      keyStatus: 'UNTRUSTED',
      error: 'No trusted keyset or public key provided to offline verifier (CIRCULAR_TRUST_PROTECTION).',
    };
  }

  const keys: PublicKeyEntry[] = Array.isArray(rawKeyset)
    ? rawKeyset
    : (rawKeyset as PublicKeyset).keys || [];

  const found = keys.find((k) => k.keyId === signingKeyId);
  if (!found) {
    return {
      keyStatus: 'UNTRUSTED',
      error: `Signing key '${signingKeyId}' not found in trusted keyset.`,
    };
  }

  if (found.status === 'REVOKED') {
    return {
      keyEntry: found,
      keyStatus: 'REVOKED',
      error: `Signing key '${signingKeyId}' is REVOKED: ${found.revocationReason || 'compromised'}.`,
    };
  }

  return {
    keyEntry: found,
    keyStatus: found.status,
  };
}

/**
 * Executes independent offline verification of a VeraTrace Dossier Manifest and its associated files.
 *
 * Implements Blueprint Section 11.1 (Verification State Machine):
 * 1. Checks JSON syntax & v1 Schema.
 * 2. Compares package file inventory and recalculates SHA-256 digests.
 * 3. Evaluates Manifest RFC 8785 canonical content SHA-256.
 * 4. Verifies Ed25519 asymmetric signature using out-of-band pinned keyset.
 *
 * @param manifestInput Raw JSON string or parsed DossierManifest
 * @param options Trusted keyset and package file buffers
 */
export async function verifyManifestOffline(
  manifestInput: string | unknown,
  options: VerifyManifestOptions
): Promise<VerificationReport> {
  const verifiedAtUtc = new Date().toISOString();
  const fileResults: VerificationFileResultItem[] = [];

  // 1. Parse JSON Syntax if input is string
  let parsedRaw: unknown;
  if (typeof manifestInput === 'string') {
    try {
      parsedRaw = JSON.parse(manifestInput);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        overallStatus: 'INVALID_MANIFEST',
        verificationMode: 'OFFLINE_ASYMMETRIC',
        checkedFilesCount: 0,
        mismatchedFilesCount: 0,
        missingFilesCount: 0,
        unexpectedFilesCount: 0,
        signatureValid: false,
        manifestContentSha256Matches: false,
        executionNotes: `Corrupted manifest JSON syntax: ${msg}`,
        verifiedAtUtc,
        fileResults,
      };
    }
  } else {
    parsedRaw = manifestInput;
  }

  // 2. Validate Schema & Structure
  const structureResult = validateManifestStructure(parsedRaw);
  if (!structureResult.valid || !structureResult.manifest) {
    return {
      overallStatus: 'INVALID_MANIFEST',
      verificationMode: 'OFFLINE_ASYMMETRIC',
      checkedFilesCount: 0,
      mismatchedFilesCount: 0,
      missingFilesCount: 0,
      unexpectedFilesCount: 0,
      signatureValid: false,
      manifestContentSha256Matches: false,
      executionNotes: `Schema conformance failure: ${structureResult.error}`,
      verifiedAtUtc,
      fileResults,
    };
  }

  const manifest = structureResult.manifest;
  const signingKeyId = manifest.trustSeal.signingKeyId;

  // 3. File Inventory and Hash Recalculation (if files provided)
  const filesMap = normalizeFilesCollection(options.files);
  const hasFilesProvided = filesMap.size > 0;
  let missingFilesCount = 0;
  let mismatchedFilesCount = 0;
  let unexpectedFilesCount = 0;
  let checkedFilesCount = 0;

  if (hasFilesProvided) {
    const manifestPaths = new Set<string>();

    for (const expectedFile of manifest.files) {
      const normalizedPath = expectedFile.packageRelativePath.replace(/\\/g, '/');
      manifestPaths.add(normalizedPath);

      const fileBuffer = filesMap.get(normalizedPath);
      if (!fileBuffer) {
        missingFilesCount++;
        fileResults.push({
          packageRelativePath: expectedFile.packageRelativePath,
          evidenceId: expectedFile.evidenceId,
          expectedSha256: expectedFile.sha256,
          status: 'FILE_MISSING',
          details: `Listed file not found in package: '${expectedFile.packageRelativePath}'.`,
        });
        continue;
      }

      // Recalculate SHA-256
      checkedFilesCount++;
      const calculatedSha256 = hashBuffer(fileBuffer).sha256Hex;
      if (calculatedSha256 !== expectedFile.sha256.toLowerCase()) {
        mismatchedFilesCount++;
        fileResults.push({
          packageRelativePath: expectedFile.packageRelativePath,
          evidenceId: expectedFile.evidenceId,
          expectedSha256: expectedFile.sha256,
          calculatedSha256,
          status: 'MISMATCH',
          details: `Digest mismatch: expected ${expectedFile.sha256}, calculated ${calculatedSha256}.`,
        });
      } else {
        fileResults.push({
          packageRelativePath: expectedFile.packageRelativePath,
          evidenceId: expectedFile.evidenceId,
          expectedSha256: expectedFile.sha256,
          calculatedSha256,
          status: 'MATCH',
        });
      }
    }

    // Check for unexpected extra files in package
    for (const providedPath of filesMap.keys()) {
      if (
        !manifestPaths.has(providedPath) &&
        !isRecognizedAuxiliaryDossierPath(providedPath)
      ) {
        unexpectedFilesCount++;
        fileResults.push({
          packageRelativePath: providedPath,
          expectedSha256: 'NONE (UNEXPECTED)',
          status: 'UNEXPECTED_FILE',
          details: `Package contains file not listed in manifest: '${providedPath}'.`,
        });
      }
    }
  }

  // 4. Manifest Content Digest Verification
  const calculatedContentSha256 = computeManifestContentSha256(manifest);
  const manifestContentSha256Matches =
    calculatedContentSha256.toLowerCase() === manifest.trustSeal.manifestContentSha256.toLowerCase();

  // 5. Out-of-band Key Resolution (Circular Trust Trap Mitigation)
  const keyResolution = resolveTrustedKey(signingKeyId, options);
  const keyStatus = keyResolution.keyStatus;

  // 6. Asymmetric Ed25519 Signature Verification
  let signatureValid = false;
  let signatureCheckError: string | null = null;

  if (keyResolution.keyEntry && (keyStatus === 'ACTIVE' || keyStatus === 'DEPRECATED')) {
    try {
      const canonicalBytes = getUnsignedCanonicalBytes(manifest);
      const signatureBuffer = Buffer.from(manifest.trustSeal.serverDigitalSignature, 'base64');
      const publicKey = createPublicKey(keyResolution.keyEntry.publicKeyPem);

      signatureValid = verify(null, canonicalBytes, publicKey, signatureBuffer);
      if (!signatureValid) {
        signatureCheckError = 'Ed25519 signature is cryptographically INVALID against canonical RFC 8785 manifest bytes.';
      }
    } catch (err: unknown) {
      signatureValid = false;
      const msg = err instanceof Error ? err.message : String(err);
      signatureCheckError = `Signature verification error: ${msg}`;
    }
  }

  // 7. Overall State Machine Decision
  let overallStatus: VerificationOutcomeStatus;
  let executionNotes: string;

  if (missingFilesCount > 0 && mismatchedFilesCount === 0 && unexpectedFilesCount === 0) {
    overallStatus = 'INCOMPLETE';
    executionNotes = `Package incomplete: ${missingFilesCount} expected files are missing.`;
  } else if (
    mismatchedFilesCount > 0 ||
    unexpectedFilesCount > 0 ||
    !manifestContentSha256Matches ||
    keyStatus === 'UNTRUSTED' ||
    keyStatus === 'REVOKED' ||
    !signatureValid
  ) {
    overallStatus = 'MISMATCH';
    const issues: string[] = [];
    if (mismatchedFilesCount > 0) issues.push(`${mismatchedFilesCount} file(s) have SHA-256 hash mismatches`);
    if (unexpectedFilesCount > 0) issues.push(`${unexpectedFilesCount} unexpected extra file(s) found`);
    if (!manifestContentSha256Matches) issues.push('Manifest content SHA-256 digest does not match');
    if (keyStatus === 'UNTRUSTED') issues.push(keyResolution.error || `Public key '${signingKeyId}' is untrusted`);
    if (keyStatus === 'REVOKED') issues.push(keyResolution.error || `Public key '${signingKeyId}' has been revoked`);
    if (!signatureValid && keyStatus !== 'UNTRUSTED' && keyStatus !== 'REVOKED') {
      issues.push(signatureCheckError || 'Digital signature verification failed');
    }

    executionNotes = `Verification failed (MISMATCH): ${issues.join('; ')}.`;
  } else {
    overallStatus = 'MATCH';
    executionNotes = hasFilesProvided
      ? `MATCH: Verified offline via Ed25519 asymmetric signature, RFC 8785 JCS, and ${checkedFilesCount} file SHA-256 hashes.`
      : 'MATCH: Verified offline via Ed25519 asymmetric signature and RFC 8785 JCS (file contents not provided).';
  }

  return {
    overallStatus,
    verificationMode: 'OFFLINE_ASYMMETRIC',
    checkedFilesCount,
    mismatchedFilesCount,
    missingFilesCount,
    unexpectedFilesCount,
    signatureValid,
    signingKeyId,
    keyStatus,
    manifestContentSha256Matches,
    executionNotes,
    verifiedAtUtc,
    fileResults,
  };
}

/**
 * Validates a public keyset object or JSON string against PUBLIC_KEYSET_SCHEMA_V1.
 */
export function validatePublicKeyset(data: unknown): {
  valid: boolean;
  keyset?: PublicKeyset;
  error?: string;
} {
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch (err: unknown) {
      return { valid: false, error: `Invalid keyset JSON syntax: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'Public keyset must be a non-null object.' };
  }

  const k = parsed as Partial<PublicKeyset>;
  if (typeof k.$schema !== 'string' || !k.$schema.includes('public-keyset')) {
    return { valid: false, error: 'Keyset $schema is missing or invalid.' };
  }

  if (!Array.isArray(k.keys)) {
    return { valid: false, error: 'Keyset keys property must be an array.' };
  }

  for (let i = 0; i < k.keys.length; i++) {
    const entry = k.keys[i];
    if (!entry || typeof entry !== 'object') {
      return { valid: false, error: `Key entry at index ${i} is not an object.` };
    }
    if (!entry.keyId || typeof entry.keyId !== 'string') {
      return { valid: false, error: `Key entry at index ${i} missing required keyId.` };
    }
    const alg = String(entry.algorithm).toUpperCase();
    if (alg !== 'ED25519') {
      return { valid: false, error: `Key entry '${entry.keyId}' has unsupported algorithm '${entry.algorithm}' (expected Ed25519).` };
    }
    const status = entry.status;
    if (status !== 'ACTIVE' && status !== 'DEPRECATED' && status !== 'REVOKED') {
      return { valid: false, error: `Key entry '${entry.keyId}' has invalid status '${status}'.` };
    }
    if (!entry.publicKeyPem || typeof entry.publicKeyPem !== 'string' || !entry.publicKeyPem.includes('PUBLIC KEY')) {
      return { valid: false, error: `Key entry '${entry.keyId}' missing valid SPKI publicKeyPem.` };
    }
  }

  return { valid: true, keyset: k as PublicKeyset };
}

export interface ParsedZipArchive {
  entries: Map<string, Buffer>;
  manifestBuffer?: Buffer;
  indexBuffer?: Buffer;
  entryNames: string[];
  totalUncompressedBytes: number;
}

/**
 * Safely parses a ZIP archive buffer completely in-memory.
 * Inspects End of Central Directory and Central Directory headers without writing
 * any files to disk.
 *
 * Security Protections:
 * 1. Path Traversal (Zip Slip) rejection: absolute paths, drive letters, relative tokens (.. / .), null bytes.
 * 2. Duplicate archive entry collision rejection.
 * 3. Decompression bomb limits (max entries count and cumulative uncompressed size).
 * 4. Compression method validation (only Store 0 and Deflate 8).
 * 5. Complete buffer read boundary checks.
 */
export function parseDossierZipArchive(
  zipInput: Buffer | Uint8Array,
  options?: VerifyZipDossierOptions
): ParsedZipArchive {
  const maxEntries = options?.maxEntriesCount ?? 10000;
  const maxUncompressedBytes = options?.maxUncompressedSizeBytes ?? 500 * 1024 * 1024; // 500 MB

  const buf = Buffer.isBuffer(zipInput)
    ? zipInput
    : Buffer.from(zipInput.buffer, zipInput.byteOffset, zipInput.byteLength);

  if (buf.length < 22) {
    throw new OfflineVerifierError('Archive buffer is too small to be a valid ZIP file.', 'ERR_MALFORMED_ZIP');
  }

  // 1. Locate End of Central Directory (EOCD) signature [0x50, 0x4b, 0x05, 0x06]
  const eocdSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = buf.lastIndexOf(eocdSig);
  if (eocdOffset === -1) {
    throw new OfflineVerifierError('Not a valid ZIP archive: missing End of Central Directory (EOCD) record.', 'ERR_MALFORMED_ZIP');
  }

  if (eocdOffset + 22 > buf.length) {
    throw new OfflineVerifierError('Corrupt ZIP archive: truncated EOCD record.', 'ERR_MALFORMED_ZIP');
  }

  const diskNumber = buf.readUInt16LE(eocdOffset + 4);
  const cdStartDisk = buf.readUInt16LE(eocdOffset + 6);
  if (diskNumber !== 0 || cdStartDisk !== 0) {
    throw new OfflineVerifierError('Multi-disk or spanned ZIP archives are not supported.', 'ERR_UNSUPPORTED_ZIP');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  if (totalEntries > maxEntries) {
    throw new OfflineVerifierError(
      `ZIP bomb mitigation: archive entry count (${totalEntries}) exceeds limit of ${maxEntries}.`,
      'ERR_ZIP_BOMB'
    );
  }

  if (cdOffset + cdSize > buf.length) {
    throw new OfflineVerifierError('Corrupt ZIP archive: Central Directory table extends beyond buffer length.', 'ERR_MALFORMED_ZIP');
  }

  // 2. Iterate Central Directory headers
  let cdPtr = cdOffset;
  const entries = new Map<string, Buffer>();
  const seenEntries = new Set<string>();
  let totalUncompressedBytes = 0;
  let manifestBuffer: Buffer | undefined;
  let indexBuffer: Buffer | undefined;

  for (let i = 0; i < totalEntries; i++) {
    if (cdPtr + 46 > buf.length) {
      throw new OfflineVerifierError(`Corrupt Central Directory header at entry index ${i}: truncated header.`, 'ERR_MALFORMED_ZIP');
    }

    const cdSig = buf.readUInt32LE(cdPtr);
    if (cdSig !== 0x02014b50) {
      throw new OfflineVerifierError(`Corrupt Central Directory signature at offset ${cdPtr} (entry ${i}).`, 'ERR_MALFORMED_ZIP');
    }

    const compMethod = buf.readUInt16LE(cdPtr + 10);
    const compSize = buf.readUInt32LE(cdPtr + 20);
    const uncompressedSize = buf.readUInt32LE(cdPtr + 24);
    const fnLen = buf.readUInt16LE(cdPtr + 28);
    const extraLen = buf.readUInt16LE(cdPtr + 30);
    const commentLen = buf.readUInt16LE(cdPtr + 32);
    const localHeaderOffset = buf.readUInt32LE(cdPtr + 42);

    if (cdPtr + 46 + fnLen + extraLen + commentLen > buf.length) {
      throw new OfflineVerifierError(`Corrupt Central Directory entry at index ${i}: filename or extra fields exceed bounds.`, 'ERR_MALFORMED_ZIP');
    }

    const rawName = buf.toString('utf8', cdPtr + 46, cdPtr + 46 + fnLen);
    cdPtr += 46 + fnLen + extraLen + commentLen;

    // Check directory entry
    const isDir = rawName.endsWith('/') || rawName.endsWith('\\');

    // 3. Path Traversal & Security Checks
    if (rawName.includes('\0')) {
      throw new OfflineVerifierError(`Path traversal attempt: null byte detected in archive entry '${rawName}'.`, 'ERR_PATH_TRAVERSAL');
    }

    if (rawName.startsWith('/') || rawName.startsWith('\\')) {
      throw new OfflineVerifierError(`Absolute path traversal attempt detected in archive entry '${rawName}'.`, 'ERR_PATH_TRAVERSAL');
    }

    if (/^[a-zA-Z]:/.test(rawName)) {
      throw new OfflineVerifierError(`Drive letter path traversal attempt detected in archive entry '${rawName}'.`, 'ERR_PATH_TRAVERSAL');
    }

    const normalizedName = rawName.replace(/\\/g, '/');
    const segments = normalizedName.split('/');
    for (const seg of segments) {
      if (seg === '..' || seg === '.') {
        throw new OfflineVerifierError(`Path traversal attempt detected in archive entry '${rawName}'.`, 'ERR_PATH_TRAVERSAL');
      }
    }

    if (isDir) {
      // Directory entry contains no file data, continue
      continue;
    }

    // Duplicate entry collision check
    if (seenEntries.has(normalizedName)) {
      throw new OfflineVerifierError(`Duplicate archive entry collision detected: '${normalizedName}'.`, 'ERR_DUPLICATE_ENTRY');
    }
    seenEntries.add(normalizedName);

    // Cumulative uncompressed size check (zip bomb mitigation)
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > maxUncompressedBytes) {
      throw new OfflineVerifierError(
        `ZIP bomb mitigation: total uncompressed archive size exceeds limit of ${maxUncompressedBytes} bytes.`,
        'ERR_ZIP_BOMB'
      );
    }

    // 4. Read Local File Header
    if (localHeaderOffset + 30 > buf.length) {
      throw new OfflineVerifierError(`Corrupt Local File Header offset for '${normalizedName}'.`, 'ERR_MALFORMED_ZIP');
    }

    const localSig = buf.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) {
      throw new OfflineVerifierError(`Corrupt Local File Header signature for '${normalizedName}'.`, 'ERR_MALFORMED_ZIP');
    }

    const localFnLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFnLen + localExtraLen;

    if (dataOffset + compSize > buf.length) {
      throw new OfflineVerifierError(`Corrupt entry '${normalizedName}': compressed data extends beyond archive boundary.`, 'ERR_MALFORMED_ZIP');
    }

    const rawData = buf.subarray(dataOffset, dataOffset + compSize);
    let decompressed: Buffer;

    if (compMethod === 0) {
      decompressed = rawData;
    } else if (compMethod === 8) {
      try {
        decompressed = zlib.inflateRawSync(rawData);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new OfflineVerifierError(`Corrupted DEFLATE stream for '${normalizedName}': ${msg}`, 'ERR_MALFORMED_ZIP');
      }
    } else {
      throw new OfflineVerifierError(`Unsupported compression method (${compMethod}) for '${normalizedName}'.`, 'ERR_UNSUPPORTED_ZIP');
    }

    if (uncompressedSize > 0 && decompressed.length !== uncompressedSize) {
      throw new OfflineVerifierError(`Decompressed size mismatch for '${normalizedName}': expected ${uncompressedSize}, got ${decompressed.length}.`, 'ERR_MALFORMED_ZIP');
    }

    entries.set(normalizedName, decompressed);

    if (normalizedName === 'veratrace_manifest.v1.json' || normalizedName === 'manifest.json') {
      manifestBuffer = decompressed;
    } else if (normalizedName === 'dossier_index.json') {
      indexBuffer = decompressed;
    }
  }

  return {
    entries,
    manifestBuffer,
    indexBuffer,
    entryNames: Array.from(seenEntries),
    totalUncompressedBytes,
  };
}

/**
 * Executes direct offline cryptographic verification of an entire VeraTrace Dossier ZIP package.
 *
 * Implements Blueprint Section 11.1 & 11.2:
 * 1. Safely parses ZIP entries in memory, rejecting Zip Slip (path traversal), duplicate names, and malformed headers.
 * 2. Extracts `veratrace_manifest.v1.json` and all evidence artifacts without writing files to disk.
 * 3. Enforces circular trust protection: rejects any attempt to trust keys bundled inside the archive.
 * 4. Recalculates SHA-256 for all declared evidence files, detecting missing, mismatched, and unexpected files.
 * 5. Verifies RFC 8785 canonical JSON bytes against Ed25519 digital trust seal using out-of-band trusted keys.
 * 6. Returns structured status distinguishing MALFORMED_ARCHIVE, INVALID_MANIFEST, INCOMPLETE, MISMATCH, and MATCH.
 *
 * @param zipInput ZIP file bytes as Buffer or Uint8Array
 * @param options Trusted keyset or public key PEM, plus security limits
 */
export async function verifyDossierZipArchiveOffline(
  zipInput: Buffer | Uint8Array,
  options: VerifyZipDossierOptions = {}
): Promise<ZipDossierVerificationReport> {
  const verifiedAtUtc = new Date().toISOString();

  // 1. In-memory ZIP parsing with security validation
  let parsed: ParsedZipArchive;
  try {
    parsed = parseDossierZipArchive(zipInput, options);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      overallStatus: 'MALFORMED_ARCHIVE',
      verificationMode: 'OFFLINE_ASYMMETRIC',
      archiveValid: false,
      archiveError: errorMsg,
      archiveEntriesCount: 0,
      checkedFilesCount: 0,
      mismatchedFilesCount: 0,
      missingFilesCount: 0,
      unexpectedFilesCount: 0,
      signatureValid: false,
      manifestContentSha256Matches: false,
      executionNotes: `Archive validation failed (MALFORMED_ARCHIVE): ${errorMsg}.`,
      verifiedAtUtc,
      fileResults: [],
    };
  }

  // 2. Locate Manifest Artifact
  if (!parsed.manifestBuffer) {
    return {
      overallStatus: 'INVALID_MANIFEST',
      verificationMode: 'OFFLINE_ASYMMETRIC',
      archiveValid: true,
      archiveError: undefined,
      archiveEntriesCount: parsed.entries.size,
      checkedFilesCount: 0,
      mismatchedFilesCount: 0,
      missingFilesCount: 0,
      unexpectedFilesCount: 0,
      signatureValid: false,
      manifestContentSha256Matches: false,
      executionNotes: 'Dossier archive does not contain the required manifest artifact (veratrace_manifest.v1.json).',
      verifiedAtUtc,
      fileResults: [],
    };
  }

  // 3. Extract Dossier Index if present
  let dossierIndex: unknown = undefined;
  if (parsed.indexBuffer) {
    try {
      dossierIndex = JSON.parse(parsed.indexBuffer.toString('utf8'));
    } catch {
      dossierIndex = undefined;
    }
  }

  // 4. Verify Manifest and Evidence File Hashes
  // CIRCULAR TRUST PROTECTION: We explicitly pass options.trustedKeyset / options.trustedPublicKeyPem.
  // The verifier NEVER trusts any public keys bundled within the ZIP entries or dossierIndex.
  const manifestReport = await verifyManifestOffline(parsed.manifestBuffer.toString('utf8'), {
    trustedKeyset: options.trustedKeyset,
    trustedPublicKeyPem: options.trustedPublicKeyPem,
    files: parsed.entries,
  });

  // 4b. Verify Auxiliary Artifact Inventory from Dossier Index (if present)
  let auxiliaryMismatches = 0;
  let auxiliaryMissing = 0;
  const auxiliaryResults: VerificationFileResultItem[] = [];
  const auxiliaryNotes: string[] = [];

  if (dossierIndex && typeof dossierIndex === 'object' && Array.isArray((dossierIndex as any).archiveInventory)) {
    const rawInventory = (dossierIndex as any).archiveInventory as Array<{
      path?: string;
      role?: string;
      sha256?: string;
      sizeBytes?: number;
    }>;

    for (const invEntry of rawInventory) {
      if (!invEntry || typeof invEntry.path !== 'string') continue;
      const normPath = invEntry.path.replace(/\\/g, '/');

      // Skip entries already validated by manifest verification or self-referential files
      if (
        invEntry.role === 'RAW_EVIDENCE' ||
        normPath === 'veratrace_manifest.v1.json' ||
        normPath === 'dossier_index.json'
      ) {
        continue;
      }

      const fileBuf = parsed.entries.get(normPath);
      if (!fileBuf) {
        auxiliaryMissing++;
        auxiliaryResults.push({
          packageRelativePath: normPath,
          expectedSha256: invEntry.sha256 || '',
          status: 'FILE_MISSING',
          details: `Auxiliary artifact declared in dossier index inventory missing from package: '${normPath}'.`,
        });
        auxiliaryNotes.push(`Missing auxiliary artifact: ${normPath}`);
      } else {
        const computedSha256 = hashBuffer(fileBuf).sha256Hex;
        const expectedSha = (invEntry.sha256 || '').trim().toLowerCase();
        if (expectedSha && computedSha256 !== expectedSha) {
          auxiliaryMismatches++;
          auxiliaryResults.push({
            packageRelativePath: normPath,
            expectedSha256: invEntry.sha256 || '',
            calculatedSha256: computedSha256,
            status: 'MISMATCH',
            details: `Checksum mismatch for auxiliary artifact '${normPath}': expected ${invEntry.sha256}, calculated ${computedSha256}.`,
          });
          auxiliaryNotes.push(`Checksum mismatch for auxiliary artifact: ${normPath}`);
        }
      }
    }
  }

  // Aggregate overall status and file counts
  let overallStatus = manifestReport.overallStatus;
  if (auxiliaryMismatches > 0) {
    overallStatus = 'MISMATCH';
  } else if (auxiliaryMissing > 0 && overallStatus === 'MATCH') {
    overallStatus = 'INCOMPLETE';
  }

  const mismatchedFilesCount = manifestReport.mismatchedFilesCount + auxiliaryMismatches;
  const missingFilesCount = manifestReport.missingFilesCount + auxiliaryMissing;
  const fileResults = [...manifestReport.fileResults, ...auxiliaryResults];

  const executionNotesWithAux = auxiliaryNotes.length > 0
    ? `${manifestReport.executionNotes} [Auxiliary Integrity: ${auxiliaryNotes.join('; ')}.]`
    : manifestReport.executionNotes;

  // 5. Append statutory forensic disclaimer
  const legalNotice =
    ' NOTICE: VeraTrace cryptographic verification confirms data integrity, hash matching, and provenance from the time of intake. It does NOT attest to historical authenticity or constitute legal admissibility under BSA 2023 Section 63 without an attested certificate.';

  return {
    ...manifestReport,
    overallStatus,
    mismatchedFilesCount,
    missingFilesCount,
    fileResults,
    archiveValid: true,
    archiveError: undefined,
    archiveEntriesCount: parsed.entries.size,
    dossierIndex,
    executionNotes: `${executionNotesWithAux}${legalNotice}`,
  };
}
