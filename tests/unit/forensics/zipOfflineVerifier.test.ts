/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Standalone Offline ZIP Verification Engine (Module J)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 10.2 (Exported Dossier Manifest), 11.1 (Verification State Machine),
 *           11.2 (Offline Ed25519 Verification & Mitigating Circular Trust Trap)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import {
  verifyDossierZipArchiveOffline,
  parseDossierZipArchive,
  validatePublicKeyset,
  isRecognizedAuxiliaryDossierPath,
  OfflineVerifierError,
} from '../../../src/lib/forensics/offlineVerifier.js';
import {
  packageDossier,
  getDefaultSigningKey,
} from '../../../src/lib/forensics/dossierPackager.js';
import {
  generateEd25519KeyPair,
  createPublicKeyset,
} from '../../../src/lib/forensics/manifestSigner.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/localStorageAdapter.js';
import { getRawKey, getDossierKey } from '../../../src/lib/storage/storageTypes.js';
import { hashBuffer } from '../../../src/lib/forensics/streamingHasher.js';
import { PUBLIC_KEYSET_SCHEMA_V1, PublicKeyEntry } from '../../../src/lib/forensics/manifestTypes.js';
import { generateBsaSection63CertificateDraft } from '../../../src/lib/legal/bsaCertificateGenerator.js';

const TEST_STORAGE_DIR = path.resolve('./storage_test_zip_verifier');

/**
 * Deterministic raw ZIP builder helper for crafting targeted security test cases
 * (path traversal, duplicate entries, malformed records, unsupported compression).
 */
function buildRawZipBuffer(entries: Array<{ name: string; content: Buffer; compMethod?: number }>): Buffer {
  const localChunks: Buffer[] = [];
  const cdChunks: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compMethod = entry.compMethod ?? 0; // 0 = STORED
    const size = entry.content.length;

    // Local file header (30 bytes + name + data)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // version needed (2.0)
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(compMethod, 8); // comp method
    lh.writeUInt16LE(0, 10); // mod time
    lh.writeUInt16LE(0, 12); // mod date
    lh.writeUInt32LE(0, 14); // crc32 (mocked)
    lh.writeUInt32LE(size, 18); // comp size
    lh.writeUInt32LE(size, 22); // uncomp size
    lh.writeUInt16LE(nameBuf.length, 26); // name length
    lh.writeUInt16LE(0, 28); // extra length

    localChunks.push(lh, nameBuf, entry.content);

    // Central Directory header (46 bytes + name)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(compMethod, 10); // comp method
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(0, 16); // crc32
    cd.writeUInt32LE(size, 20); // comp size
    cd.writeUInt32LE(size, 24); // uncomp size
    cd.writeUInt16LE(nameBuf.length, 28); // name length
    cd.writeUInt16LE(0, 30); // extra length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk start
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(localOffset, 42); // local header offset

    cdChunks.push(cd, nameBuf);
    localOffset += 30 + nameBuf.length + size;
  }

  const localData = Buffer.concat(localChunks);
  const cdData = Buffer.concat(cdChunks);

  // End of Central Directory (EOCD - 22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk start
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdData.length, 12); // cd size
  eocd.writeUInt32LE(localData.length, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localData, cdData, eocd]);
}

describe('Standalone Offline ZIP Verification Engine (Module J)', () => {
  let storage: LocalStorageAdapter;
  let testKeyPair: { keyId: string; publicKeyPem: string; privateKeyPem: string; keyEntry: PublicKeyEntry };

  const sampleEvidencePng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x91, 0x68,
    0x36, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const sampleEvidencePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF',
    'utf8'
  );

  beforeEach(async () => {
    storage = new LocalStorageAdapter(TEST_STORAGE_DIR);

    testKeyPair = generateEd25519KeyPair({
      keyId: 'veratrace-ed25519-2026-q4',
      validDays: 365,
    });
  });

  afterEach(async () => {
    try {
      await fsp.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('1. Valid Dossier Verification (Generated by Packager)', () => {
    it('verifies a complete, authentic packaged dossier ZIP without filesystem extraction', async () => {
      const caseId = 'case-zip-auth-001';
      const ev1Id = 'ev-png-001';
      const ev2Id = 'ev-pdf-002';

      await storage.writeStagedBuffer(getRawKey(caseId, ev1Id), sampleEvidencePng);
      await storage.writeStagedBuffer(getRawKey(caseId, ev2Id), sampleEvidencePdf);

      const packagingResult = await packageDossier(
        {
          caseId,
          title: 'Direct ZIP Offline Verification Test Case',
          category: 'CYBERBULLYING_HARASSMENT',
        },
        [
          {
            evidenceId: ev1Id,
            originalFilename: 'screenshot.png',
            mediaType: 'image/png',
            sizeBytes: sampleEvidencePng.length,
            sha256: hashBuffer(sampleEvidencePng).sha256Hex,
          },
          {
            evidenceId: ev2Id,
            originalFilename: 'complaint.pdf',
            mediaType: 'application/pdf',
            sizeBytes: sampleEvidencePdf.length,
            sha256: hashBuffer(sampleEvidencePdf).sha256Hex,
          },
        ],
        {
          storageAdapter: storage,
          signingPrivateKeyPem: testKeyPair.privateKeyPem,
          signingKeyId: testKeyPair.keyId,
        }
      );

      const zipKey = getDossierKey(caseId, packagingResult.dossierId, 'zip');
      const zipBuffer = await storage.readBuffer(zipKey);

      const keyset = createPublicKeyset([testKeyPair.keyEntry]);

      // Execute direct ZIP verification
      const report = await verifyDossierZipArchiveOffline(zipBuffer, {
        trustedKeyset: keyset,
      });

      expect(report.overallStatus).toBe('MATCH');
      expect(report.archiveValid).toBe(true);
      expect(report.signatureValid).toBe(true);
      expect(report.manifestContentSha256Matches).toBe(true);
      expect(report.keyStatus).toBe('ACTIVE');
      expect(report.checkedFilesCount).toBe(2);
      expect(report.mismatchedFilesCount).toBe(0);
      expect(report.missingFilesCount).toBe(0);
      expect(report.unexpectedFilesCount).toBe(0);
      expect(report.archiveEntriesCount).toBeGreaterThanOrEqual(6);
      expect(report.dossierIndex).toBeDefined();
      expect((report.dossierIndex as any).caseId).toBe(caseId);

      // Verify each evidence file had MATCH status
      expect(report.fileResults).toHaveLength(2);
      expect(report.fileResults.every((f) => f.status === 'MATCH')).toBe(true);

      // Verify legal disclaimer presence
      expect(report.executionNotes).toContain('BSA 2023 Section 63');
      expect(report.executionNotes).toContain('does NOT attest to historical authenticity');
    });
  });

  describe('2. Tampering Detection (Signature & Evidence Bytes)', () => {
    it('detects digital signature tampering inside the manifest within the ZIP', async () => {
      const parsed = parseDossierZipArchive(await getSampleZipBuffer());
      const manifestJson = JSON.parse(parsed.manifestBuffer!.toString('utf8'));

      // Tamper signature
      manifestJson.trustSeal.serverDigitalSignature = Buffer.from('TAMPERED_INVALID_SIG_BYTES').toString('base64');
      const tamperedManifestBuf = Buffer.from(JSON.stringify(manifestJson, null, 2), 'utf8');

      parsed.entries.set('veratrace_manifest.v1.json', tamperedManifestBuf);

      const entriesForZip: Array<{ name: string; content: Buffer }> = [];
      for (const [name, buf] of parsed.entries.entries()) {
        entriesForZip.push({ name, content: buf });
      }
      const tamperedZip = buildRawZipBuffer(entriesForZip);

      const report = await verifyDossierZipArchiveOffline(tamperedZip, {
        trustedKeyset: createPublicKeyset([testKeyPair.keyEntry]),
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.signatureValid).toBe(false);
      expect(report.executionNotes).toContain('Ed25519 signature is cryptographically INVALID');
    });

    it('detects evidence byte modification inside the ZIP archive', async () => {
      const parsed = parseDossierZipArchive(await getSampleZipBuffer());

      // Alter 1 byte of the raw PNG evidence
      const evKey = Array.from(parsed.entries.keys()).find((k) => k.startsWith('evidence/'));
      expect(evKey).toBeDefined();

      const originalBuf = parsed.entries.get(evKey!)!;
      const alteredBuf = Buffer.from(originalBuf);
      alteredBuf[0] = alteredBuf[0] ^ 0xff; // Flip bits
      parsed.entries.set(evKey!, alteredBuf);

      const entriesForZip: Array<{ name: string; content: Buffer }> = [];
      for (const [name, buf] of parsed.entries.entries()) {
        entriesForZip.push({ name, content: buf });
      }
      const tamperedZip = buildRawZipBuffer(entriesForZip);

      const report = await verifyDossierZipArchiveOffline(tamperedZip, {
        trustedKeyset: createPublicKeyset([testKeyPair.keyEntry]),
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.mismatchedFilesCount).toBe(1);
      const mismatchedItem = report.fileResults.find((f) => f.status === 'MISMATCH');
      expect(mismatchedItem).toBeDefined();
      expect(mismatchedItem?.packageRelativePath).toBe(evKey);
    });

    it('detects tampering of legal/bsa_section_63_certificate.json inside the ZIP archive', async () => {
      const caseId = 'case-cert-tamper-check';
      const evId = 'ev-png-tamper';
      await storage.writeStagedBuffer(getRawKey(caseId, evId), sampleEvidencePng);

      const certDraft = generateBsaSection63CertificateDraft({
        caseInfo: { caseId, title: 'Certificate Integrity Test Case' },
        evidenceItems: [
          {
            evidenceId: evId,
            originalFilename: 'proof.png',
            fileSizeBytes: sampleEvidencePng.length,
            sha256: hashBuffer(sampleEvidencePng).sha256Hex,
          },
        ],
      });

      const packagingResult = await packageDossier(
        { caseId, title: 'Certificate Integrity Test Case', category: 'ONLINE_FRAUD' },
        [
          {
            evidenceId: evId,
            originalFilename: 'proof.png',
            mediaType: 'image/png',
            sizeBytes: sampleEvidencePng.length,
            sha256: hashBuffer(sampleEvidencePng).sha256Hex,
          },
        ],
        {
          storageAdapter: storage,
          signingPrivateKeyPem: testKeyPair.privateKeyPem,
          signingKeyId: testKeyPair.keyId,
          bsaCertificateDraft: certDraft,
        }
      );

      const zipKey = getDossierKey(caseId, packagingResult.dossierId, 'zip');
      const originalZipBuffer = await storage.readBuffer(zipKey);

      // Verify the untouched archive is clean first
      const cleanReport = await verifyDossierZipArchiveOffline(originalZipBuffer, {
        trustedKeyset: createPublicKeyset([testKeyPair.keyEntry]),
      });
      expect(cleanReport.overallStatus).toBe('MATCH');
      expect(cleanReport.mismatchedFilesCount).toBe(0);

      // Now tamper with the certificate content inside the ZIP
      const parsed = parseDossierZipArchive(originalZipBuffer);
      const originalCertBuf = parsed.entries.get('legal/bsa_section_63_certificate.json');
      expect(originalCertBuf).toBeDefined();

      const certJson = JSON.parse(originalCertBuf!.toString('utf8'));
      certJson.partA = {
        certifier: { certifierName: 'MALICIOUS_FORGED_NAME' },
      };
      parsed.entries.set('legal/bsa_section_63_certificate.json', Buffer.from(JSON.stringify(certJson, null, 2), 'utf8'));

      const entriesForZip: Array<{ name: string; content: Buffer }> = [];
      for (const [name, buf] of parsed.entries.entries()) {
        entriesForZip.push({ name, content: buf });
      }
      const tamperedZip = buildRawZipBuffer(entriesForZip);

      const report = await verifyDossierZipArchiveOffline(tamperedZip, {
        trustedKeyset: createPublicKeyset([testKeyPair.keyEntry]),
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.mismatchedFilesCount).toBe(1);
      const certMismatch = report.fileResults.find((f) => f.packageRelativePath === 'legal/bsa_section_63_certificate.json');
      expect(certMismatch).toBeDefined();
      expect(certMismatch?.status).toBe('MISMATCH');
      expect(report.executionNotes).toContain('Auxiliary Integrity');
      expect(report.executionNotes).toContain('legal/bsa_section_63_certificate.json');
    });
  });

  describe('3. Missing and Unexpected Files Detection', () => {
    it('detects missing auxiliary artifact when legal/bsa_section_63_certificate.json is deleted from ZIP', async () => {
      const caseId = 'case-cert-missing-check';
      const evId = 'ev-png-missing';
      await storage.writeStagedBuffer(getRawKey(caseId, evId), sampleEvidencePng);

      const certDraft = generateBsaSection63CertificateDraft({
        caseInfo: { caseId, title: 'Certificate Missing Test Case' },
        evidenceItems: [
          {
            evidenceId: evId,
            originalFilename: 'proof.png',
            fileSizeBytes: sampleEvidencePng.length,
            sha256: hashBuffer(sampleEvidencePng).sha256Hex,
          },
        ],
      });

      const packagingResult = await packageDossier(
        { caseId, title: 'Certificate Missing Test Case', category: 'ONLINE_FRAUD' },
        [
          {
            evidenceId: evId,
            originalFilename: 'proof.png',
            mediaType: 'image/png',
            sizeBytes: sampleEvidencePng.length,
            sha256: hashBuffer(sampleEvidencePng).sha256Hex,
          },
        ],
        {
          storageAdapter: storage,
          signingPrivateKeyPem: testKeyPair.privateKeyPem,
          signingKeyId: testKeyPair.keyId,
          bsaCertificateDraft: certDraft,
        }
      );

      const zipKey = getDossierKey(caseId, packagingResult.dossierId, 'zip');
      const originalZipBuffer = await storage.readBuffer(zipKey);

      const parsed = parseDossierZipArchive(originalZipBuffer);
      expect(parsed.entries.has('legal/bsa_section_63_certificate.json')).toBe(true);
      parsed.entries.delete('legal/bsa_section_63_certificate.json');

      const entriesForZip: Array<{ name: string; content: Buffer }> = [];
      for (const [name, buf] of parsed.entries.entries()) {
        entriesForZip.push({ name, content: buf });
      }
      const incompleteZip = buildRawZipBuffer(entriesForZip);

      const report = await verifyDossierZipArchiveOffline(incompleteZip, {
        trustedKeyset: createPublicKeyset([testKeyPair.keyEntry]),
      });

      expect(report.overallStatus).toBe('INCOMPLETE');
      expect(report.missingFilesCount).toBe(1);
      const missingCert = report.fileResults.find((f) => f.packageRelativePath === 'legal/bsa_section_63_certificate.json');
      expect(missingCert).toBeDefined();
      expect(missingCert?.status).toBe('FILE_MISSING');
      expect(report.executionNotes).toContain('Missing auxiliary artifact: legal/bsa_section_63_certificate.json');
    });
    it('detects missing files when an evidence file declared in manifest is deleted from ZIP', async () => {
      const parsed = parseDossierZipArchive(await getSampleZipBuffer());

      const evKey = Array.from(parsed.entries.keys()).find((k) => k.startsWith('evidence/'));
      expect(evKey).toBeDefined();
      parsed.entries.delete(evKey!); // Remove from archive

      const entriesForZip: Array<{ name: string; content: Buffer }> = [];
      for (const [name, buf] of parsed.entries.entries()) {
        entriesForZip.push({ name, content: buf });
      }
      const incompleteZip = buildRawZipBuffer(entriesForZip);

      const report = await verifyDossierZipArchiveOffline(incompleteZip, {
        trustedKeyset: createPublicKeyset([testKeyPair.keyEntry]),
      });

      expect(report.overallStatus).toBe('INCOMPLETE');
      expect(report.missingFilesCount).toBe(1);
      expect(report.fileResults.some((f) => f.status === 'FILE_MISSING')).toBe(true);
    });

    it('detects undeclared rogue evidence files injected into the ZIP archive', async () => {
      const parsed = parseDossierZipArchive(await getSampleZipBuffer());

      // Inject unexpected file
      parsed.entries.set('evidence/untracked_hidden_spyware.exe', Buffer.from('ROGUE_PAYLOAD_DATA'));

      const entriesForZip: Array<{ name: string; content: Buffer }> = [];
      for (const [name, buf] of parsed.entries.entries()) {
        entriesForZip.push({ name, content: buf });
      }
      const rogueZip = buildRawZipBuffer(entriesForZip);

      const report = await verifyDossierZipArchiveOffline(rogueZip, {
        trustedKeyset: createPublicKeyset([testKeyPair.keyEntry]),
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.unexpectedFilesCount).toBe(1);
      const rogueItem = report.fileResults.find((f) => f.status === 'UNEXPECTED_FILE');
      expect(rogueItem).toBeDefined();
      expect(rogueItem?.packageRelativePath).toBe('evidence/untracked_hidden_spyware.exe');
    });
  });

  describe('4. Key Trust & Revocation Policy', () => {
    it('rejects verification when signing key is not in out-of-band trusted keyset (Circular Trust Protection)', async () => {
      const zipBuffer = await getSampleZipBuffer();

      // Pass empty keyset or keyset with a different key ID
      const differentKey = generateEd25519KeyPair({ keyId: 'different-unrelated-key' });
      const untrustedKeyset = createPublicKeyset([differentKey.keyEntry]);

      const report = await verifyDossierZipArchiveOffline(zipBuffer, {
        trustedKeyset: untrustedKeyset,
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.keyStatus).toBe('UNTRUSTED');
      expect(report.executionNotes).toContain('not found in trusted keyset');
    });

    it('rejects verification when signing key has status REVOKED in trusted keyset', async () => {
      const zipBuffer = await getSampleZipBuffer();

      const revokedKeyEntry: PublicKeyEntry = {
        ...testKeyPair.keyEntry,
        status: 'REVOKED',
        revokedAtUtc: '2026-10-25T00:00:00Z',
        revocationReason: 'Private key compromised in test drill.',
      };

      const report = await verifyDossierZipArchiveOffline(zipBuffer, {
        trustedKeyset: createPublicKeyset([revokedKeyEntry]),
      });

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.keyStatus).toBe('REVOKED');
      expect(report.executionNotes).toContain('REVOKED');
      expect(report.executionNotes).toContain('Private key compromised');
    });

    it('rejects archives where no trusted keyset or public key is supplied', async () => {
      const zipBuffer = await getSampleZipBuffer();

      const report = await verifyDossierZipArchiveOffline(zipBuffer, {});

      expect(report.overallStatus).toBe('MISMATCH');
      expect(report.keyStatus).toBe('UNTRUSTED');
      expect(report.executionNotes).toContain('CIRCULAR_TRUST_PROTECTION');
    });
  });

  describe('5. Malformed Archives & Path Traversal (Zip Slip) Protections', () => {
    it('rejects corrupt/truncated buffer with MALFORMED_ARCHIVE', async () => {
      const corruptBuf = Buffer.from('THIS_IS_DEFINITELY_NOT_A_VALID_ZIP_ARCHIVE');

      const report = await verifyDossierZipArchiveOffline(corruptBuf, {});

      expect(report.overallStatus).toBe('MALFORMED_ARCHIVE');
      expect(report.archiveValid).toBe(false);
      expect(report.archiveError).toContain('missing End of Central Directory');
    });

    it('rejects Zip Slip relative path traversal (..) with MALFORMED_ARCHIVE', async () => {
      const evilZip = buildRawZipBuffer([
        { name: 'veratrace_manifest.v1.json', content: Buffer.from('{}') },
        { name: '../../etc/passwd', content: Buffer.from('root:x:0:0::/root:/bin/sh') },
      ]);

      const report = await verifyDossierZipArchiveOffline(evilZip, {});

      expect(report.overallStatus).toBe('MALFORMED_ARCHIVE');
      expect(report.archiveValid).toBe(false);
      expect(report.archiveError).toContain('Path traversal attempt');
    });

    it('rejects leading slash absolute path traversal with MALFORMED_ARCHIVE', async () => {
      const evilZip = buildRawZipBuffer([
        { name: '/etc/shadow', content: Buffer.from('root:*') },
      ]);

      const report = await verifyDossierZipArchiveOffline(evilZip, {});

      expect(report.overallStatus).toBe('MALFORMED_ARCHIVE');
      expect(report.archiveValid).toBe(false);
      expect(report.archiveError).toContain('Absolute path traversal');
    });

    it('rejects Windows drive letter path traversal with MALFORMED_ARCHIVE', async () => {
      const evilZip = buildRawZipBuffer([
        { name: 'C:\\Windows\\system32\\cmd.exe', content: Buffer.from('fake_exe') },
      ]);

      const report = await verifyDossierZipArchiveOffline(evilZip, {});

      expect(report.overallStatus).toBe('MALFORMED_ARCHIVE');
      expect(report.archiveValid).toBe(false);
      expect(report.archiveError).toContain('Drive letter path traversal');
    });

    it('rejects null byte injection in archive entry names with MALFORMED_ARCHIVE', async () => {
      const evilZip = buildRawZipBuffer([
        { name: 'safe_name.txt\0evil.exe', content: Buffer.from('malware') },
      ]);

      const report = await verifyDossierZipArchiveOffline(evilZip, {});

      expect(report.overallStatus).toBe('MALFORMED_ARCHIVE');
      expect(report.archiveValid).toBe(false);
      expect(report.archiveError).toContain('null byte detected');
    });

    it('rejects duplicate archive entry collision with MALFORMED_ARCHIVE', async () => {
      const dupZip = buildRawZipBuffer([
        { name: 'evidence/duplicate_file.txt', content: Buffer.from('ORIGINAL') },
        { name: 'evidence/duplicate_file.txt', content: Buffer.from('OVERWRITE_ATTEMPT') },
      ]);

      const report = await verifyDossierZipArchiveOffline(dupZip, {});

      expect(report.overallStatus).toBe('MALFORMED_ARCHIVE');
      expect(report.archiveValid).toBe(false);
      expect(report.archiveError).toContain('Duplicate archive entry collision');
    });

    it('rejects archives missing veratrace_manifest.v1.json with INVALID_MANIFEST', async () => {
      const noManifestZip = buildRawZipBuffer([
        { name: 'dossier_index.json', content: Buffer.from('{}') },
        { name: 'reports/summary.pdf', content: Buffer.from('PDF') },
      ]);

      const report = await verifyDossierZipArchiveOffline(noManifestZip, {});

      expect(report.overallStatus).toBe('INVALID_MANIFEST');
      expect(report.archiveValid).toBe(true);
      expect(report.executionNotes).toContain('does not contain the required manifest artifact');
    });
  });

  describe('6. Published Keyset Schema & Integration Seam Verification', () => {
    it('verifies public/.well-known/veratrace-public-keys.json conforms to PUBLIC_KEYSET_SCHEMA_V1', () => {
      const keysetPath = path.resolve('public/.well-known/veratrace-public-keys.json');
      expect(fs.existsSync(keysetPath)).toBe(true);

      const content = fs.readFileSync(keysetPath, 'utf8');
      const json = JSON.parse(content);

      const validation = validatePublicKeyset(json);
      expect(validation.valid).toBe(true);
      expect(json.$schema).toBe(PUBLIC_KEYSET_SCHEMA_V1);
      expect(Array.isArray(json.keys)).toBe(true);
      expect(json.integrationSeam).toBeDefined();
      expect(json.integrationSeam.status).toBe('PENDING_KEY_CEREMONY');
      expect(json.integrationSeam.blocker).toContain('Person 3');
    });

    it('validates public keyset schema rules and rejects invalid entries', () => {
      // Invalid algorithm
      const badAlg = {
        $schema: PUBLIC_KEYSET_SCHEMA_V1,
        keys: [{ keyId: 'k1', algorithm: 'RSA-4096', status: 'ACTIVE', publicKeyPem: '-----BEGIN PUBLIC KEY-----' }],
      };
      expect(validatePublicKeyset(badAlg).valid).toBe(false);

      // Invalid status
      const badStatus = {
        $schema: PUBLIC_KEYSET_SCHEMA_V1,
        keys: [{ keyId: 'k2', algorithm: 'Ed25519', status: 'COMPROMISED', publicKeyPem: '-----BEGIN PUBLIC KEY-----' }],
      };
      expect(validatePublicKeyset(badStatus).valid).toBe(false);

      // Missing SPKI header
      const badPem = {
        $schema: PUBLIC_KEYSET_SCHEMA_V1,
        keys: [{ keyId: 'k3', algorithm: 'Ed25519', status: 'ACTIVE', publicKeyPem: 'NOT_A_PEM' }],
      };
      expect(validatePublicKeyset(badPem).valid).toBe(false);
    });

    it('correctly classifies recognized auxiliary dossier paths', () => {
      expect(isRecognizedAuxiliaryDossierPath('veratrace_manifest.v1.json')).toBe(true);
      expect(isRecognizedAuxiliaryDossierPath('dossier_index.json')).toBe(true);
      expect(isRecognizedAuxiliaryDossierPath('reports/case_summary.pdf')).toBe(true);
      expect(isRecognizedAuxiliaryDossierPath('audit/processing_events.json')).toBe(true);
      expect(isRecognizedAuxiliaryDossierPath('timeline/timeline_events.json')).toBe(true);
      expect(isRecognizedAuxiliaryDossierPath('previews/ev-001.preview')).toBe(true);
      expect(isRecognizedAuxiliaryDossierPath('legal/bsa_section_63_certificate.json')).toBe(true);

      // Rogue files are NOT auxiliary
      expect(isRecognizedAuxiliaryDossierPath('evidence/rogue.png')).toBe(false);
      expect(isRecognizedAuxiliaryDossierPath('trojan.exe')).toBe(false);
      expect(isRecognizedAuxiliaryDossierPath('scripts/hack.sh')).toBe(false);
    });
  });

  // Helper to generate a standardized valid dossier zip buffer
  async function getSampleZipBuffer(): Promise<Buffer> {
    const caseId = 'sample-case-for-tampering';
    const evId = 'ev-png-sample';
    await storage.writeStagedBuffer(getRawKey(caseId, evId), sampleEvidencePng);

    const result = await packageDossier(
      { caseId, title: 'Sample Packaged Case', category: 'ONLINE_FRAUD' },
      [
        {
          evidenceId: evId,
          originalFilename: 'sample.png',
          mediaType: 'image/png',
          sizeBytes: sampleEvidencePng.length,
          sha256: hashBuffer(sampleEvidencePng).sha256Hex,
        },
      ],
      {
        storageAdapter: storage,
        signingPrivateKeyPem: testKeyPair.privateKeyPem,
        signingKeyId: testKeyPair.keyId,
      }
    );

    const key = getDossierKey(caseId, result.dossierId, 'zip');
    return storage.readBuffer(key);
  }
});
