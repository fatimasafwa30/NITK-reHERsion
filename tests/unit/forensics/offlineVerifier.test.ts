/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Offline Verification Engine (Module J)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 11.1 (Verification State Machine), 11.2 (Circular Trust Trap Mitigation)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect } from 'vitest';
import {
  generateEd25519KeyPair,
  createAndSignManifest,
  createPublicKeyset,
} from '../../../src/lib/forensics/manifestSigner.js';
import {
  verifyManifestOffline,
} from '../../../src/lib/forensics/offlineVerifier.js';
import { hashBuffer } from '../../../src/lib/forensics/streamingHasher.js';
import { getEvidenceRegister } from '../../../src/services/evidenceStore.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/localStorageAdapter.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Offline Verification Engine (Module J)', () => {
  const sampleCase = {
    caseId: '7b8e1a22-3c44-48f5-9a88-29d99b1a0011',
    title: 'Persistent Telegram Impersonation & Extortion',
    category: 'IMPERSONATION_DEFAMATION',
    exportTimestampUtc: '2026-10-24T22:25:00.000Z',
  };

  const file1Content = Buffer.from('PNG_FAKE_PAYLOAD_IMAGE_001_DATA');
  const file1Sha256 = hashBuffer(file1Content).sha256Hex;

  const file2Content = Buffer.from('PDF_FAKE_PAYLOAD_DOCUMENT_002_DATA');
  const file2Sha256 = hashBuffer(file2Content).sha256Hex;

  const filesForManifest = [
    {
      evidenceId: 'ev-img-001',
      packageRelativePath: 'evidence/ev-img-001_screenshot.png',
      originalFilename: 'screenshot.png',
      mediaType: 'image/png',
      fileSizeBytes: file1Content.length,
      sha256: file1Sha256,
      systemReceiptUtc: '2026-10-24T22:10:00.000Z',
      sourceClassification: 'USER_UPLOAD',
    },
    {
      evidenceId: 'ev-doc-002',
      packageRelativePath: 'evidence/ev-doc-002_complaint.pdf',
      originalFilename: 'complaint.pdf',
      mediaType: 'application/pdf',
      fileSizeBytes: file2Content.length,
      sha256: file2Sha256,
      systemReceiptUtc: '2026-10-24T22:15:00.000Z',
      sourceClassification: 'USER_UPLOAD',
    },
  ];

  it('reports MATCH for valid manifest, valid Ed25519 signature, and matching files', async () => {
    const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({
      keyId: 'veratrace-ed25519-2026-q4',
    });
    const keyset = createPublicKeyset([keyEntry]);

    const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
      signingKeyId: keyId,
    });

    const fileMap = new Map<string, Buffer>([
      ['evidence/ev-img-001_screenshot.png', file1Content],
      ['evidence/ev-doc-002_complaint.pdf', file2Content],
    ]);

    const report = await verifyManifestOffline(manifest, {
      trustedKeyset: keyset,
      files: fileMap,
    });

    expect(report.overallStatus).toBe('MATCH');
    expect(report.signatureValid).toBe(true);
    expect(report.manifestContentSha256Matches).toBe(true);
    expect(report.keyStatus).toBe('ACTIVE');
    expect(report.checkedFilesCount).toBe(2);
    expect(report.mismatchedFilesCount).toBe(0);
    expect(report.missingFilesCount).toBe(0);
    expect(report.unexpectedFilesCount).toBe(0);
    expect(report.fileResults).toHaveLength(2);
    expect(report.fileResults.every((r) => r.status === 'MATCH')).toBe(true);
  });

  describe('Structural & Syntax Failure Handling (INVALID_MANIFEST)', () => {
    it('returns INVALID_MANIFEST when manifest input is corrupt JSON string', async () => {
      const report = await verifyManifestOffline('{ corrupt_json: true, missing_closing_brace', {});
      expect(report.overallStatus).toBe('INVALID_MANIFEST');
      expect(report.executionNotes).toContain('Corrupted manifest JSON syntax');
    });

    it('returns INVALID_MANIFEST when required fields are missing', async () => {
      const invalidManifest = {
        $schema: 'https://veratrace.org/schemas/v1/dossier-manifest.json',
        manifestVersion: 2, // invalid version
        case: sampleCase,
      };

      const report = await verifyManifestOffline(invalidManifest, {});
      expect(report.overallStatus).toBe('INVALID_MANIFEST');
      expect(report.executionNotes).toContain('Unsupported manifestVersion');
    });

    it('returns INVALID_MANIFEST when trust seal is absent or missing required properties', async () => {
      const invalidManifest = {
        $schema: 'https://veratrace.org/schemas/v1/dossier-manifest.json',
        manifestVersion: 1,
        generator: { software: 'VeraTrace' },
        case: sampleCase,
        files: [],
      };

      const report = await verifyManifestOffline(invalidManifest, {});
      expect(report.overallStatus).toBe('INVALID_MANIFEST');
      expect(report.executionNotes).toContain('trustSeal is missing');
    });
  });

  describe('File Inventory & Hash Recalculation', () => {
    it('returns INCOMPLETE when an expected file is missing from package', async () => {
      const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'key-test' });
      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: keyId,
      });

      // Package only provides file 1, missing file 2
      const partialFiles = new Map<string, Buffer>([
        ['evidence/ev-img-001_screenshot.png', file1Content],
      ]);

      const report = await verifyManifestOffline(manifest, {
        trustedKeyset: [keyEntry],
        files: partialFiles,
      });

      expect(report.overallStatus).toBe('INCOMPLETE');
      expect(report.missingFilesCount).toBe(1);
      expect(report.checkedFilesCount).toBe(1);

      const missingResult = report.fileResults.find((r) => r.status === 'FILE_MISSING');
      expect(missingResult).toBeDefined();
      expect(missingResult?.packageRelativePath).toBe('evidence/ev-doc-002_complaint.pdf');
    });

    it('returns MISMATCH when file contents have been tampered with', async () => {
      const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'key-test' });
      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: keyId,
      });

      // Tampered byte in file 1
      const tamperedFile1 = Buffer.from('TAMPERED_MODIFIED_IMAGE_BYTES');

      const files = new Map<string, Buffer>([
        ['evidence/ev-img-001_screenshot.png', tamperedFile1],
        ['evidence/ev-doc-002_complaint.pdf', file2Content],
      ]);

      const report = await verifyManifestOffline(manifest, {
        trustedKeyset: [keyEntry],
        files,
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.mismatchedFilesCount).toBe(1);

      const mismatchResult = report.fileResults.find((r) => r.status === 'MISMATCH');
      expect(mismatchResult).toBeDefined();
      expect(mismatchResult?.calculatedSha256).not.toBe(file1Sha256);
    });

    it('returns MISMATCH when package contains unexpected unlisted files', async () => {
      const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'key-test' });
      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: keyId,
      });

      const files = new Map<string, Buffer>([
        ['evidence/ev-img-001_screenshot.png', file1Content],
        ['evidence/ev-doc-002_complaint.pdf', file2Content],
        ['evidence/unlisted_backdoor.sh', Buffer.from('#!/bin/sh\necho hacked')],
      ]);

      const report = await verifyManifestOffline(manifest, {
        trustedKeyset: [keyEntry],
        files,
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.unexpectedFilesCount).toBe(1);

      const unexpectedResult = report.fileResults.find((r) => r.status === 'UNEXPECTED_FILE');
      expect(unexpectedResult).toBeDefined();
      expect(unexpectedResult?.packageRelativePath).toBe('evidence/unlisted_backdoor.sh');
    });
  });

  describe('Circular Trust Trap Protection (Blueprint Section 11.2)', () => {
    it('rejects verification if no trusted keyset is supplied out-of-band', async () => {
      const { keyId, privateKeyPem } = generateEd25519KeyPair({ keyId: 'key-untrusted' });
      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: keyId,
      });

      const report = await verifyManifestOffline(manifest, {});

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.keyStatus).toBe('UNTRUSTED');
      expect(report.executionNotes).toContain('CIRCULAR_TRUST_PROTECTION');
    });

    it('rejects verification if signing key ID is not found in trusted keyset', async () => {
      const { privateKeyPem } = generateEd25519KeyPair({ keyId: 'unknown-key' });
      const trustedKp = generateEd25519KeyPair({ keyId: 'official-key-2026' });

      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: 'unknown-key',
      });

      const report = await verifyManifestOffline(manifest, {
        trustedKeyset: [trustedKp.keyEntry],
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.keyStatus).toBe('UNTRUSTED');
      expect(report.executionNotes).toContain("Signing key 'unknown-key' not found in trusted keyset");
    });

    it('rejects verification if signing key has status REVOKED in keyset', async () => {
      const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'compromised-key' });
      keyEntry.status = 'REVOKED';
      keyEntry.revokedAtUtc = '2026-10-20T00:00:00Z';
      keyEntry.revocationReason = 'Key material leaked on GitHub';

      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: keyId,
      });

      const report = await verifyManifestOffline(manifest, {
        trustedKeyset: [keyEntry],
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.keyStatus).toBe('REVOKED');
      expect(report.executionNotes).toContain('Key material leaked on GitHub');
    });

    it('accepts verification if signing key has status DEPRECATED (expired active key)', async () => {
      const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'legacy-key-2025' });
      keyEntry.status = 'DEPRECATED';

      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: keyId,
      });

      const report = await verifyManifestOffline(manifest, {
        trustedKeyset: [keyEntry],
      });

      expect(report.overallStatus).toBe('MATCH');
      expect(report.keyStatus).toBe('DEPRECATED');
      expect(report.signatureValid).toBe(true);
    });
  });

  describe('Manifest-Only Verification Mode', () => {
    it('verifies manifest signature and RFC 8785 content digest when files are omitted', async () => {
      const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'manifest-only-key' });
      const manifest = createAndSignManifest(sampleCase, filesForManifest, privateKeyPem, {
        signingKeyId: keyId,
      });

      const report = await verifyManifestOffline(manifest, {
        trustedKeyset: [keyEntry],
      });

      expect(report.overallStatus).toBe('MATCH');
      expect(report.signatureValid).toBe(true);
      expect(report.manifestContentSha256Matches).toBe(true);
      expect(report.checkedFilesCount).toBe(0);
      expect(report.executionNotes).toContain('file contents not provided');
    });
  });

  describe('EvidenceRegister Integration Seam', () => {
    it('generates, signs, and verifies manifest through EvidenceRegister methods', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'veratrace-reg-test-'));
      const storage = new LocalStorageAdapter(tempDir);
      const caseId = 'case-manifest-reg-test';
      const register = getEvidenceRegister(caseId, storage);

      try {
        const added = await register.addRecord({
          name: 'incident_screenshot.png',
          buffer: file1Content,
        });

        const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'reg-signer-key' });

        const signedManifest = await register.generateAndSignManifest(
          {
            title: 'Harassment on Social Platform',
            category: 'HARASSMENT',
          },
          privateKeyPem,
          { signingKeyId: keyId }
        );

        expect(signedManifest.case.caseId).toBe(caseId);
        expect(signedManifest.files).toHaveLength(1);
        expect(signedManifest.files[0].evidenceId).toBe(added.evidenceId);
        expect(signedManifest.files[0].sha256).toBe(added.sha256);

        // Verification via register.verifyDossier
        const report = await register.verifyDossier(signedManifest, [keyEntry], {
          [signedManifest.files[0].packageRelativePath]: file1Content,
        });

        expect(report.overallStatus).toBe('MATCH');
        expect(report.signatureValid).toBe(true);
        expect(report.checkedFilesCount).toBe(1);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
