/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Manifest Builder & Ed25519 Signer
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 10.2 (Exported Dossier Manifest), 11.2 (Deterministic Canonicalization & Ed25519 Signing)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect } from 'vitest';
import { verify, createPublicKey } from 'node:crypto';
import {
  generateEd25519KeyPair,
  signManifest,
  createAndSignManifest,
  createPublicKeyset,
} from '../../../src/lib/forensics/manifestSigner.js';
import {
  buildUnsealedManifest,
  computeManifestContentSha256,
  getUnsignedManifestPayload,
  getUnsignedCanonicalBytes,
  normalizeManifestFileEntries,
} from '../../../src/lib/forensics/manifestBuilder.js';
import {
  DOSSIER_MANIFEST_SCHEMA_V1,
  DEFAULT_GENERATOR_INFO,
  DEFAULT_MANIFEST_DISCLAIMERS,
} from '../../../src/lib/forensics/manifestTypes.js';
import { canonicalizeJson } from '../../../src/lib/forensics/canonicalJson.js';

describe('Ed25519 Key Generation', () => {
  it('generates a valid Ed25519 keypair in SPKI and PKCS#8 PEM formats', () => {
    const { keyId, publicKeyPem, privateKeyPem, keyEntry } = generateEd25519KeyPair();

    expect(keyId).toMatch(/^veratrace-ed25519-\d+$/);
    expect(publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(publicKeyPem).toContain('-----END PUBLIC KEY-----');
    expect(privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(privateKeyPem).toContain('-----END PRIVATE KEY-----');

    expect(keyEntry.keyId).toBe(keyId);
    expect(keyEntry.algorithm).toBe('Ed25519');
    expect(keyEntry.status).toBe('ACTIVE');
    expect(keyEntry.publicKeyPem).toBe(publicKeyPem);

    const validFrom = new Date(keyEntry.validFromUtc!).getTime();
    const validUntil = new Date(keyEntry.validUntilUtc!).getTime();
    expect(validUntil - validFrom).toBeGreaterThanOrEqual(364 * 24 * 3600 * 1000);
  });

  it('supports custom keyId and validity period', () => {
    const customKeyId = 'veratrace-ed25519-custom-2026';
    const { keyId, keyEntry } = generateEd25519KeyPair({
      keyId: customKeyId,
      validDays: 30,
    });

    expect(keyId).toBe(customKeyId);
    expect(keyEntry.keyId).toBe(customKeyId);

    const diffDays =
      (new Date(keyEntry.validUntilUtc!).getTime() - new Date(keyEntry.validFromUtc!).getTime()) /
      (24 * 3600 * 1000);
    expect(Math.round(diffDays)).toBe(30);
  });
});

describe('Manifest Builder (Blueprint Section 10.2)', () => {
  const sampleCase = {
    caseId: '7b8e1a22-3c44-48f5-9a88-29d99b1a0011',
    title: 'Persistent Telegram Impersonation & Extortion',
    category: 'IMPERSONATION_DEFAMATION',
    exportTimestampUtc: '2026-10-24T22:25:00.000Z',
  };

  const sampleFiles = [
    {
      evidenceId: 'ev-002',
      originalFilename: 'threat_message.png',
      mediaType: 'image/png',
      fileSizeBytes: 2048,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      packageRelativePath: 'evidence/ev-002_threat_message.png',
      systemReceiptUtc: '2026-10-24T22:15:00.000Z',
    },
    {
      evidenceId: 'ev-001',
      originalFilename: 'profile_clone.png',
      mediaType: 'image/png',
      fileSizeBytes: 1024,
      sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      packageRelativePath: 'evidence/ev-001_profile_clone.png',
      systemReceiptUtc: '2026-10-24T22:10:00.000Z',
    },
  ];

  it('builds an unsealed manifest strictly adhering to blueprint structure', () => {
    const unsealed = buildUnsealedManifest(sampleCase, sampleFiles);

    expect(unsealed.$schema).toBe(DOSSIER_MANIFEST_SCHEMA_V1);
    expect(unsealed.manifestVersion).toBe(1);
    expect(unsealed.generator).toEqual(DEFAULT_GENERATOR_INFO);
    expect(unsealed.case.caseId).toBe(sampleCase.caseId);
    expect(unsealed.case.title).toBe(sampleCase.caseId ? sampleCase.title : '');
    expect(unsealed.case.category).toBe(sampleCase.category);
    expect(unsealed.case.exportTimestampUtc).toBe(sampleCase.exportTimestampUtc);

    expect(unsealed.trustSeal.digestAlgorithm).toBe('SHA-256');
    expect(unsealed.trustSeal.canonicalizationAlgorithm).toBe('RFC8785_JCS');
    expect(unsealed.trustSeal.signatureAlgorithm).toBe('ED25519');
    expect(unsealed.trustSeal.manifestContentSha256).toHaveLength(64);
    expect(unsealed.trustSeal.serverDigitalSignature).toBeUndefined();

    // Default disclaimers present
    expect(unsealed.disclaimers).toEqual(DEFAULT_MANIFEST_DISCLAIMERS);
  });

  it('sorts files deterministically regardless of input insertion order', () => {
    const filesA = [...sampleFiles];
    const filesB = [sampleFiles[1], sampleFiles[0]];

    const unsealedA = buildUnsealedManifest(sampleCase, filesA);
    const unsealedB = buildUnsealedManifest(sampleCase, filesB);

    expect(unsealedA.files[0].packageRelativePath).toBe('evidence/ev-001_profile_clone.png');
    expect(unsealedA.files[1].packageRelativePath).toBe('evidence/ev-002_threat_message.png');

    expect(unsealedB.files[0].packageRelativePath).toBe('evidence/ev-001_profile_clone.png');
    expect(unsealedB.files[1].packageRelativePath).toBe('evidence/ev-002_threat_message.png');

    // Both manifests must have identical canonical content SHA-256
    expect(unsealedA.trustSeal.manifestContentSha256).toBe(unsealedB.trustSeal.manifestContentSha256);
  });

  it('detects and prevents path traversal in packageRelativePath', () => {
    expect(() => {
      normalizeManifestFileEntries([
        {
          evidenceId: 'ev-evil',
          originalFilename: 'malicious.pdf',
          sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          packageRelativePath: '../../etc/passwd',
        },
      ]);
    }).toThrow(/Insecure packageRelativePath detected/);

    expect(() => {
      normalizeManifestFileEntries([
        {
          evidenceId: 'ev-evil-2',
          originalFilename: 'malicious.pdf',
          sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          packageRelativePath: '/root/secret.key',
        },
      ]);
    }).toThrow(/Insecure packageRelativePath detected/);
  });

  it('validates 64-character lowercase SHA-256 hashes on file entries', () => {
    expect(() => {
      normalizeManifestFileEntries([
        {
          evidenceId: 'ev-bad-hash',
          sha256: 'not-a-valid-sha256',
        },
      ]);
    }).toThrow(/invalid sha256/);
  });
});

describe('Manifest Signer (Ed25519 & RFC 8785 JCS)', () => {
  const sampleCase = {
    caseId: '7b8e1a22-3c44-48f5-9a88-29d99b1a0011',
    title: 'Persistent Telegram Impersonation & Extortion',
    category: 'IMPERSONATION_DEFAMATION',
    exportTimestampUtc: '2026-10-24T22:25:00.000Z',
  };

  const sampleFiles = [
    {
      evidenceId: 'e4a2b109-7711-44aa-bb22-334455667788',
      originalFilename: 'IMG_4920.PNG',
      mediaType: 'image/png',
      fileSizeBytes: 1420852,
      sha256: 'b2f671d49f6d6103623fa5bf29f9e160a006db2c2a93947bcf5de8362d221815',
      packageRelativePath: 'evidence/e4a2b109_IMG_4920.PNG',
      systemReceiptUtc: '2026-10-24T22:16:30.120Z',
      sourceClassification: 'USER_UPLOAD',
    },
  ];

  it('signs manifest with Ed25519 and produces verifiable signature', () => {
    const { keyId, publicKeyPem, privateKeyPem } = generateEd25519KeyPair({
      keyId: 'veratrace-ed25519-2026-q4',
    });

    const unsealed = buildUnsealedManifest(sampleCase, sampleFiles, {
      signingKeyId: keyId,
    });

    const signed = signManifest(unsealed, privateKeyPem);

    expect(signed.trustSeal.signingKeyId).toBe(keyId);
    expect(signed.trustSeal.serverDigitalSignature).toBeDefined();
    expect(typeof signed.trustSeal.serverDigitalSignature).toBe('string');
    expect(signed.trustSeal.serverDigitalSignature.length).toBeGreaterThan(60);

    // Verify manually with Node.js crypto
    const canonicalBytes = getUnsignedCanonicalBytes(signed);
    const signatureBuffer = Buffer.from(signed.trustSeal.serverDigitalSignature, 'base64');
    const publicKey = createPublicKey(publicKeyPem);

    const isValid = verify(null, canonicalBytes, publicKey, signatureBuffer);
    expect(isValid).toBe(true);
  });

  it('fails verification if any manifest property is tampered with', () => {
    const { keyId, publicKeyPem, privateKeyPem } = generateEd25519KeyPair({ keyId: 'key-test' });
    const signed = createAndSignManifest(sampleCase, sampleFiles, privateKeyPem, { signingKeyId: keyId });

    const signatureBuffer = Buffer.from(signed.trustSeal.serverDigitalSignature, 'base64');
    const publicKey = createPublicKey(publicKeyPem);

    // 1. Tamper with case title
    const tamperedTitle = { ...signed, case: { ...signed.case, title: 'Tampered Title' } };
    const bytes1 = getUnsignedCanonicalBytes(tamperedTitle);
    expect(verify(null, bytes1, publicKey, signatureBuffer)).toBe(false);

    // 2. Tamper with file hash
    const tamperedHash = {
      ...signed,
      files: [{ ...signed.files[0], sha256: '0000000000000000000000000000000000000000000000000000000000000000' }],
    };
    const bytes2 = getUnsignedCanonicalBytes(tamperedHash);
    expect(verify(null, bytes2, publicKey, signatureBuffer)).toBe(false);

    // 3. Tamper with trust seal signingKeyId
    const tamperedKey = {
      ...signed,
      trustSeal: { ...signed.trustSeal, signingKeyId: 'forged-key-id' },
    };
    const bytes3 = getUnsignedCanonicalBytes(tamperedKey);
    expect(verify(null, bytes3, publicKey, signatureBuffer)).toBe(false);
  });

  it('never leaks private key into manifest structure or JSON output', () => {
    const { keyId, privateKeyPem } = generateEd25519KeyPair({ keyId: 'key-leak-test' });
    const signed = createAndSignManifest(sampleCase, sampleFiles, privateKeyPem, { signingKeyId: keyId });

    const jsonString = JSON.stringify(signed);
    expect(jsonString).not.toContain('PRIVATE KEY');
    expect(jsonString).not.toContain(privateKeyPem);
    expect((signed as any).privateKey).toBeUndefined();
    expect((signed as any).privateKeyPem).toBeUndefined();
  });

  it('creates public keyset structure conforming to Blueprint Section 11.2', () => {
    const kp1 = generateEd25519KeyPair({ keyId: 'veratrace-ed25519-2026-q4' });
    const kp2 = generateEd25519KeyPair({ keyId: 'veratrace-ed25519-2025-legacy' });
    kp2.keyEntry.status = 'DEPRECATED';

    const keyset = createPublicKeyset([kp1.keyEntry, kp2.keyEntry]);

    expect(keyset.$schema).toBe('https://veratrace.org/schemas/v1/public-keyset.json');
    expect(keyset.keys).toHaveLength(2);
    expect(keyset.keys[0].keyId).toBe('veratrace-ed25519-2026-q4');
    expect(keyset.keys[0].status).toBe('ACTIVE');
    expect(keyset.keys[1].keyId).toBe('veratrace-ed25519-2025-legacy');
    expect(keyset.keys[1].status).toBe('DEPRECATED');
  });
});
