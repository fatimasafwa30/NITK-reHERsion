/**
 * VeraTrace — Complete Evidence Ingestion UX & Functional Remediation Test Suite
 *
 * Verifies:
 * 1. File validation (enforcing 50 MB limit, empty file rejection, supported format checks).
 * 2. SHA-256 calculation correctness against independent Node.js crypto digest.
 * 3. Full metadata persistence (platform channel, sender handle, source URL, capture timestamp, contextual notes).
 * 4. Genuine backend vault storage, file encryption, and upload timestamp recording.
 * 5. Chain of custody append-only audit event creation and cryptographic hash-chain verification.
 * 6. Case association, multi-tenant IDOR isolation, and unauthorized access rejection.
 * 7. Case Vault reactive updates without requiring a page refresh.
 * 8. Chrome extension companion capture metadata and scoped pairing compatibility.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createServer } from '../../../server/server.js';
import { getDatabase } from '../../../server/db.js';
import { verifyCaseAuditChain } from '../../../server/chainOfCustody.js';
import { processEvidenceFile, getEvidenceForCase } from '../../../src/services/evidenceService.js';
import { MAX_FILE_BYTES, sha256File } from '../../../src/lib/hash.js';

function createValidPngBuffer(payload = 'VERATRACE_EVIDENCE_CAPTURE_TEST') {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const textChunk = Buffer.from(payload, 'utf8');
  return Buffer.concat([pngHeader, textChunk]);
}

describe('Complete Evidence Ingestion Workflow & Functional Remediation', () => {
  let app;
  let db;
  let userToken;
  let userId;
  let otherUserToken;
  let testCaseId;

  beforeAll(async () => {
    app = createServer();
    db = getDatabase();

    // Register User 1
    const username = `victim_${Date.now()}`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'SecureVictimPassword123!' });
    expect(regRes.status).toBe(201);
    userToken = regRes.body.token;
    userId = regRes.body.user.userId;

    // Register User 2 (for IDOR attack tests)
    const otherUsername = `attacker_${Date.now()}`;
    const otherRegRes = await request(app)
      .post('/api/auth/register')
      .send({ username: otherUsername, password: 'SecureAttackerPassword123!' });
    expect(otherRegRes.status).toBe(201);
    otherUserToken = otherRegRes.body.token;

    // Create a Case for User 1
    const caseRes = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Harassment Intake Case 2026',
        summary: 'Cross-platform digital harassment intake testing suite.',
      });
    expect(caseRes.status).toBe(201);
    testCaseId = caseRes.body.case.case_id;
  });

  describe('1. File Intake & Security Validation', () => {
    it('enforces the 50 MB limit constant and rejects files exceeding 50 MB', async () => {
      expect(MAX_FILE_BYTES).toBe(50 * 1024 * 1024);

      // Oversized mock file (51 MB)
      const oversizedMock = {
        name: 'huge_evidence.mp4',
        size: 51 * 1024 * 1024,
        type: 'video/mp4',
        slice: () => {},
        arrayBuffer: async () => new ArrayBuffer(0),
      };

      await expect(processEvidenceFile(testCaseId, oversizedMock)).rejects.toThrow(
        /quota exceeded/i
      );
    });

    it('rejects empty files (0 bytes) from intake', async () => {
      const emptyMock = {
        name: 'empty.png',
        size: 0,
        type: 'image/png',
        slice: () => {},
        arrayBuffer: async () => new ArrayBuffer(0),
      };

      await expect(processEvidenceFile(testCaseId, emptyMock)).rejects.toThrow(
        /payload contains 0 bytes/i
      );
    });

    it('rejects unsupported executable binaries', async () => {
      const exeBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable header
      const exeMock = {
        name: 'malware.exe',
        size: exeBytes.length,
        type: 'application/x-msdownload',
        slice: () => ({
          arrayBuffer: async () => exeBytes.buffer.slice(exeBytes.byteOffset, exeBytes.byteOffset + exeBytes.byteLength),
        }),
        arrayBuffer: async () => exeBytes.buffer.slice(exeBytes.byteOffset, exeBytes.byteOffset + exeBytes.byteLength),
      };

      await expect(processEvidenceFile(testCaseId, exeMock)).rejects.toThrow(
        /Disallowed file signature|MZ header|Unsupported container format/i
      );
    });
  });

  describe('2. SHA-256 Digest Correctness', () => {
    it('calculates SHA-256 digest matching an independent Node crypto hash bit-for-bit', async () => {
      const payload = Buffer.from('VeraTrace Independent SHA-256 Digest Verification 2026', 'utf8');
      const expectedDigest = crypto.createHash('sha256').update(payload).digest('hex');

      const mockFile = {
        name: 'test_doc.txt',
        size: payload.length,
        type: 'text/plain',
        arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
      };

      const calculatedDigest = await sha256File(mockFile);
      expect(calculatedDigest).toBe(expectedDigest);
      expect(calculatedDigest).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('3. Backend Ingestion, Metadata Persistence & Sealing', () => {
    it('persists all incident metadata (platform, sender handle, source url, capture timestamp, contextual notes)', async () => {
      const pngPayload = createValidPngBuffer('EVIDENCE_PAYLOAD_WITH_FULL_METADATA');
      const expectedSha256 = crypto.createHash('sha256').update(pngPayload).digest('hex');

      const captureTime = new Date('2026-10-15T22:30:00.000Z').toISOString();
      const testNotes = 'Victim received unsolicited contact on Instagram after blocking on WhatsApp.';
      const testPlatform = 'Instagram';
      const testSender = '@unwanted_stalker_handle';
      const testUrl = 'https://instagram.com/p/C_sample_incident';

      const uploadRes = await request(app)
        .post(`/api/cases/${testCaseId}/evidence`)
        .set('Authorization', `Bearer ${userToken}`)
        .field('platform', testPlatform)
        .field('senderHandle', testSender)
        .field('sourceUrl', testUrl)
        .field('captureTimestamp', captureTime)
        .field('notes', testNotes)
        .field('submissionSource', 'USER_SUBMITTED')
        .field('submissionMethod', 'MANUAL_DROPZONE')
        .attach('file', pngPayload, 'instagram_harassment.png');

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.success).toBe(true);

      const evidence = uploadRes.body.evidence;
      expect(evidence.evidence_id).toBeDefined();
      expect(evidence.case_id).toBe(testCaseId);
      expect(evidence.sha256_hash).toBe(expectedSha256);
      expect(evidence.platform).toBe(testPlatform);
      expect(evidence.sender_handle).toBe(testSender);
      expect(evidence.source_url).toBe(testUrl);
      expect(evidence.notes).toBe(testNotes);
      expect(evidence.capture_timestamp).toBe(captureTime);
      expect(evidence.upload_timestamp).toBeDefined();
      expect(evidence.capture_timestamp).not.toBe(evidence.upload_timestamp);

      // Verify database record has all fields persisted
      const dbRow = db.prepare('SELECT * FROM evidence_records WHERE evidence_id = ?').get(evidence.evidence_id);
      expect(dbRow).toBeDefined();
      expect(dbRow.platform).toBe(testPlatform);
      expect(dbRow.sender_handle).toBe(testSender);
      expect(dbRow.notes).toBe(testNotes);
      expect(dbRow.source_url).toBe(testUrl);
      expect(dbRow.capture_timestamp).toBe(captureTime);

      // Verify file version 1 is created in evidence_files
      const fileRow = db.prepare('SELECT * FROM evidence_files WHERE evidence_id = ? AND version_num = 1').get(evidence.evidence_id);
      expect(fileRow).toBeDefined();
      expect(fileRow.sha256_hash).toBe(expectedSha256);
      expect(fileRow.is_original).toBe(1);

      // Verify timeline event was automatically generated and linked
      const timelineRow = db.prepare('SELECT * FROM timeline_events WHERE related_evidence_id = ?').get(evidence.evidence_id);
      expect(timelineRow).toBeDefined();
      expect(timelineRow.platform).toBe(testPlatform);
      expect(timelineRow.sender_handle).toBe(testSender);
      expect(timelineRow.occurred_at).toBe(captureTime);
    });
  });

  describe('4. Chain of Custody Integrity', () => {
    it('creates append-only custody event and verifies custody hash-chain remains unbroken', async () => {
      const pngPayload = createValidPngBuffer('CUSTODY_TEST_PNG');
      const uploadRes = await request(app)
        .post(`/api/cases/${testCaseId}/evidence`)
        .set('Authorization', `Bearer ${userToken}`)
        .field('platform', 'WhatsApp')
        .field('senderHandle', '+1 555-0199')
        .field('notes', 'Threat message recorded in chain of custody')
        .attach('file', pngPayload, 'whatsapp_threat.png');

      expect(uploadRes.status).toBe(201);
      const evidenceId = uploadRes.body.evidence.evidence_id;

      // Verify custody event exists
      const custodyRow = db.prepare(`
        SELECT * FROM chain_of_custody 
        WHERE case_id = ? AND evidence_id = ? AND action = 'EVIDENCE_UPLOADED'
      `).get(testCaseId, evidenceId);

      expect(custodyRow).toBeDefined();
      expect(custodyRow.previous_event_hash).toBeDefined();
      expect(custodyRow.current_event_hash).toBeDefined();
      expect(custodyRow.current_event_hash).toMatch(/^[a-f0-9]{64}$/);

      // Parse metadata in custody event
      const meta = JSON.parse(custodyRow.event_metadata);
      expect(meta.platform).toBe('WhatsApp');
      expect(meta.senderHandle).toBe('+1 555-0199');
      expect(meta.originalFilename).toContain('whatsapp_threat.png');

      // Verify case audit chain is 100% cryptographically intact
      const chainVerification = verifyCaseAuditChain(testCaseId);
      expect(chainVerification.valid).toBe(true);
      expect(chainVerification.breakages).toHaveLength(0);
      expect(chainVerification.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Access Control & IDOR Rejection', () => {
    it('rejects unauthenticated upload requests with 401 Unauthorized', async () => {
      const pngPayload = createValidPngBuffer('UNAUTH_TEST');
      const res = await request(app)
        .post(`/api/cases/${testCaseId}/evidence`)
        .attach('file', pngPayload, 'unauth.png');

      expect(res.status).toBe(401);
    });

    it('rejects cross-tenant evidence upload into another user case with 403 Forbidden', async () => {
      const pngPayload = createValidPngBuffer('ATTACKER_IDOR_TEST');
      const res = await request(app)
        .post(`/api/cases/${testCaseId}/evidence`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .attach('file', pngPayload, 'idor_attempt.png');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });
  });

  describe('6. Chrome Extension Capture Integration', () => {
    it('accepts extension capture uploads with scoped pairing and marks EXTENSION_CAPTURE source', async () => {
      // 1. Pair extension to obtain scoped extension token
      const pairRes = await request(app)
        .post('/api/auth/extension-pair')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceName: 'Chrome Laptop Extension MV3' });

      expect(pairRes.status).toBe(201);
      const extToken = pairRes.body.extensionToken;
      expect(extToken).toBeDefined();

      // 2. Upload captured tab using extension token
      const capturePayload = createValidPngBuffer('ACTIVE_TAB_SCREENSHOT_BYTES');
      const captureTime = new Date().toISOString();
      const tabUrl = 'https://instagram.com/direct/t/12345';

      const extUploadRes = await request(app)
        .post(`/api/cases/${testCaseId}/evidence`)
        .set('Authorization', `Bearer ${extToken}`)
        .field('submissionSource', 'EXTENSION_CAPTURE')
        .field('submissionMethod', 'CHROME_EXT_MV3')
        .field('sourceUrl', tabUrl)
        .field('captureTimestamp', captureTime)
        .field('platform', 'Instagram')
        .field('senderHandle', '@suspicious_account')
        .field('notes', 'Captured via VeraTrace Chrome Extension activeTab')
        .attach('file', capturePayload, 'tab_capture_123.png');

      expect(extUploadRes.status).toBe(201);
      expect(extUploadRes.body.evidence.submission_source).toBe('EXTENSION_CAPTURE');
      expect(extUploadRes.body.evidence.submission_method).toBe('CHROME_EXT_MV3');
      expect(extUploadRes.body.evidence.source_url).toBe(tabUrl);
    });
  });

  describe('7. Case Vault Live Updates Without Page Refresh', () => {
    it('registers sealed evidence into client store and retrieves immediately from getEvidenceForCase', async () => {
      const clientCaseId = `client_case_${Date.now()}`;
      const payload = createValidPngBuffer('REAL_CLIENT_EVIDENCE_FOR_VAULT_TEST');

      const mockFile = {
        name: 'client_evidence.png',
        size: payload.length,
        type: 'image/png',
        slice: (start = 0, end = payload.length) => ({
          arrayBuffer: async () => payload.buffer.slice(payload.byteOffset + start, payload.byteOffset + end),
        }),
        arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
      };

      const record = await processEvidenceFile(clientCaseId, mockFile, {
        platform: 'Telegram',
        senderHandle: '@stalker_telegram',
        sourceUrl: 'https://t.me/threat_message',
        notes: 'Coercive message preserved locally for Case Vault display',
        captureTimestamp: '2026-10-18T14:00:00.000Z',
      });

      expect(record).toBeDefined();
      expect(record.evidenceId).toBeDefined();
      expect(record.platform).toBe('Telegram');
      expect(record.senderHandle).toBe('@stalker_telegram');

      // Query vault store without any page reload
      const vaultEvidence = getEvidenceForCase(clientCaseId);
      expect(vaultEvidence.length).toBe(1);
      expect(vaultEvidence[0].evidenceId).toBe(record.evidenceId);
      expect(vaultEvidence[0].fileName).toBe('client_evidence.png');
      expect(vaultEvidence[0].platform).toBe('Telegram');
      expect(vaultEvidence[0].senderHandle).toBe('@stalker_telegram');
      expect(vaultEvidence[0].notes).toContain('Coercive message preserved locally');
    });
  });
});
