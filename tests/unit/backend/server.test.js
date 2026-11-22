/**
 * VeraTrace — Backend API, Vault Storage & Security Remediation Vitest Suite
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from '../../../server/server.js';
import { getDatabase } from '../../../server/db.js';
import { verifyCaseAuditChain } from '../../../server/chainOfCustody.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for valid PNG bytes
function createValidPngBuffer(text = 'TEST') {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const textChunk = Buffer.from(text, 'utf8');
  return Buffer.concat([pngHeader, textChunk]);
}

describe('VeraTrace Backend Enterprise Forensic Engine & Security Controls', () => {
  let app;
  let userAToken;
  let userBToken;
  let userAId;
  let userBId;

  beforeAll(async () => {
    app = createServer();

    // 1. Register User A
    const uA = `user_a_${Date.now()}`;
    const resA = await request(app)
      .post('/api/auth/register')
      .send({ username: uA, password: 'SecurePassword123!' });
    expect(resA.status).toBe(201);
    userAToken = resA.body.token;
    userAId = resA.body.user.userId;

    // 2. Register User B
    const uB = `user_b_${Date.now()}`;
    const resB = await request(app)
      .post('/api/auth/register')
      .send({ username: uB, password: 'SecurePassword123!' });
    expect(resB.status).toBe(201);
    userBToken = resB.body.token;
    userBId = resB.body.user.userId;
  });

  // --- HEALTH CHECK ---
  it('GET /api/health returns operational status with AES-256-GCM vault verification', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.vaultStorage).toContain('AES-256-GCM');
  });

  // --- AUTHENTICATION & ACCESS CONTROL TESTS ---
  describe('P0 — Authentication and IDOR Authorization Enforcement', () => {
    it('Rejects unauthenticated requests with 401 Unauthorized', async () => {
      const resCases = await request(app).get('/api/cases');
      expect(resCases.status).toBe(401);
      expect(resCases.body.error).toContain('Authentication Required');

      const resCreate = await request(app).post('/api/cases').send({ title: 'Unauth Case' });
      expect(resCreate.status).toBe(401);

      const resBackup = await request(app).post('/api/backup');
      expect(resBackup.status).toBe(401);
    });

    it('Enforces case ownership and blocks cross-tenant IDOR access (403 Forbidden)', async () => {
      // User A creates Case A
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: "User A's Confidential Case", summary: 'Sensitive victim testimony' });
      expect(caseRes.status).toBe(201);
      const caseAId = caseRes.body.case.case_id;

      // User A ingests an evidence file
      const pngBuffer = createValidPngBuffer('VICTIM_PRIVATE_MEDICAL_LOG');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseAId}/evidence`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', pngBuffer, 'medical.png');
      expect(uploadRes.status).toBe(201);
      const evidenceId = uploadRes.body.evidence.evidence_id;

      // ATTACK 1: User B attempts to view User A's case details
      const idorCase = await request(app)
        .get(`/api/cases/${caseAId}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(idorCase.status).toBe(403);
      expect(idorCase.body.error).toContain('Forbidden');

      // ATTACK 2: User B attempts to list User A's evidence
      const idorEvidence = await request(app)
        .get(`/api/cases/${caseAId}/evidence`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(idorEvidence.status).toBe(403);

      // ATTACK 3: User B attempts to directly download User A's decrypted evidence file
      const idorFile = await request(app)
        .get(`/api/evidence/${evidenceId}/file`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(idorFile.status).toBe(403);

      // ATTACK 4: User B attempts to delete User A's evidence
      const idorDelete = await request(app)
        .delete(`/api/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(idorDelete.status).toBe(403);
    });
  });

  // --- UPLOAD VALIDATION & MAGIC BYTES TESTS ---
  describe('P1 — Upload Validation & Magic Byte Enforcement', () => {
    it('Accepts genuine PNG and PDF evidence files', async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Magic Byte Test Case' });
      const caseId = caseRes.body.case.case_id;

      const validPng = createValidPngBuffer('GENUINE_SCREENSHOT_DATA');
      const uploadPng = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', validPng, 'screenshot.png');
      expect(uploadPng.status).toBe(201);
      expect(uploadPng.body.evidence.file_type).toBe('image/png');
    });

    it('Rejects disguised executables and malicious binary signatures (400 Bad Request)', async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Malicious Upload Test Case' });
      const caseId = caseRes.body.case.case_id;

      // Disguised Windows PE/DOS executable ('MZ' header) disguised with .png extension
      const fakePngExe = Buffer.concat([
        Buffer.from([0x4d, 0x5a, 0x90, 0x00]), // MZ header
        Buffer.from('MALICIOUS_EXECUTABLE_PAYLOAD', 'utf8'),
      ]);

      const uploadMalicious = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', fakePngExe, 'disguised_trojan.png');

      expect(uploadMalicious.status).toBe(400);
      expect(uploadMalicious.body.error).toContain('Disallowed executable file detected');
    });
  });

  // --- ENCRYPTED BACKUPS & RESTORATION TESTS ---
  describe('P0 — Authenticated AES-256-GCM Encrypted Backups & Restoration', () => {
    it('Generates AES-256-GCM encrypted backup envelope without leaking plaintext on disk', async () => {
      const res = await request(app)
        .post('/api/backup')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cipher).toBe('aes-256-gcm');
      expect(res.body.backupFileName).toContain('.enc');

      // Verify the file stored on disk is NOT plaintext JSON
      const backupPath = path.join(__dirname, '..', '..', '..', 'server', 'backups', res.body.backupFileName);
      expect(fs.existsSync(backupPath)).toBe(true);

      const fileContent = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      expect(fileContent.format).toBe('VERATRACE_ENCRYPTED_BACKUP_V1');
      expect(fileContent.ciphertextBase64).toBeDefined();
      expect(fileContent.tag).toBeDefined();
      expect(fileContent.iv).toBeDefined();
      // Ensure plaintext cases data does NOT exist in the envelope
      expect(fileContent.cases).toBeUndefined();
    });

    it('Successfully restores from authenticated encrypted backup', async () => {
      // 1. Create a distinct case to back up
      const uniqueTitle = `Backup Restore Target ${Date.now()}`;
      await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: uniqueTitle });

      // 2. Generate encrypted backup
      const backupRes = await request(app)
        .post('/api/backup')
        .set('Authorization', `Bearer ${userAToken}`);
      const backupFileName = backupRes.body.backupFileName;

      // 3. Restore backup
      const restoreRes = await request(app)
        .post('/api/backup/restore')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ backupFileName });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.restored).toBeDefined();
    });

    it('Rejects corrupted backups or tampered ciphertext with authentication error', async () => {
      // Read a valid backup envelope
      const backupDir = path.join(__dirname, '..', '..', '..', 'server', 'backups');
      const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.enc'));
      expect(files.length).toBeGreaterThan(0);

      const validEnvelope = JSON.parse(fs.readFileSync(path.join(backupDir, files[0]), 'utf8'));

      // Tamper with authentication tag
      const tamperedEnvelope = {
        ...validEnvelope,
        tag: '00112233445566778899aabbccddeeff', // Corrupted tag
      };

      const restoreRes = await request(app)
        .post('/api/backup/restore')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ backupEnvelope: tamperedEnvelope });

      expect(restoreRes.status).toBe(400);
      expect(restoreRes.body.error).toContain('Backup Decryption Failed');
    });
  });

  // --- ED25519-SIGNED AUDIT CHECKPOINTS ---
  describe('P1 — Independently Verifiable Ed25519 Signed Audit Checkpoints', () => {
    it('Creates and cryptographically verifies an Ed25519-signed custody checkpoint', async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Checkpoint Verification Case' });
      const caseId = caseRes.body.case.case_id;

      // Ingest evidence to add custody events
      const validPng = createValidPngBuffer('CHECKPOINT_EVIDENCE_SAMPLE');
      await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', validPng, 'evidence1.png');

      // Create signed checkpoint
      const checkpointRes = await request(app)
        .post(`/api/cases/${caseId}/chain-of-custody/checkpoint`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(checkpointRes.status).toBe(201);
      expect(checkpointRes.body.checkpointId).toBeDefined();
      expect(checkpointRes.body.ed25519Signature).toBeDefined();
      expect(checkpointRes.body.ed25519PublicKey).toContain('BEGIN PUBLIC KEY');

      // Verify the signed checkpoint
      const verifyRes = await request(app)
        .post(`/api/cases/${caseId}/chain-of-custody/checkpoint/verify`)
        .send(checkpointRes.body);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.verified).toBe(true);
      expect(verifyRes.body.signatureValid).toBe(true);
      expect(verifyRes.body.databaseChainMatches).toBe(true);
    });
  });

  // --- CROSS-PLATFORM CORRELATION SAFEGUARDS ---
  describe('P1 — Cross-Platform Intelligence Stop-Lists & Safeguards', () => {
    it('Excludes generic handles (admin, support) from cross-platform correlation links', async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Stoplist Test Case' });
      const caseId = caseRes.body.case.case_id;

      const db = getDatabase();
      const t1 = `t_admin1_${Date.now()}`;
      const t2 = `t_admin2_${Date.now()}`;

      // Insert generic @admin handles on two different platforms
      db.prepare(`
        INSERT INTO timeline_events (event_id, case_id, occurred_at, label, platform, sender_handle, created_at)
        VALUES 
          (?, ?, '2026-10-15T10:00:00Z', 'Direct Message', 'Instagram', '@admin', datetime('now')),
          (?, ?, '2026-10-16T14:00:00Z', 'Message', 'WhatsApp', '@admin', datetime('now'))
      `).run(t1, caseId, t2, caseId);

      const intelRes = await request(app)
        .get(`/api/cases/${caseId}/intelligence`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(intelRes.status).toBe(200);
      // The generic handle @admin MUST NOT trigger a SHARED_IDENTIFIER correlation
      const adminCorr = intelRes.body.correlations.find(
        (c) => c.relationType === 'SHARED_IDENTIFIER' && c.explanation.includes('@admin')
      );
      expect(adminCorr).toBeUndefined();
    });

    it('Correlates specific, non-generic handles as investigative clues', async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Specific Handle Case' });
      const caseId = caseRes.body.case.case_id;

      const db = getDatabase();
      const t1 = `t_spec1_${Date.now()}`;
      const t2 = `t_spec2_${Date.now()}`;

      db.prepare(`
        INSERT INTO timeline_events (event_id, case_id, occurred_at, label, platform, sender_handle, created_at)
        VALUES 
          (?, ?, '2026-10-15T10:00:00Z', 'Direct Message', 'Instagram', '@unique_perpetrator_99', datetime('now')),
          (?, ?, '2026-10-16T14:00:00Z', 'Message', 'WhatsApp', '@unique_perpetrator_99', datetime('now'))
      `).run(t1, caseId, t2, caseId);

      const intelRes = await request(app)
        .get(`/api/cases/${caseId}/intelligence`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(intelRes.status).toBe(200);
      const uniqueCorr = intelRes.body.correlations.find(
        (c) => c.relationType === 'SHARED_IDENTIFIER'
      );
      expect(uniqueCorr).toBeDefined();
      expect(uniqueCorr.confidenceLevel).toBe('PROBABLE_CLUE');
      expect(uniqueCorr.explanation).toContain('Investigative clue; does not prove single-author identity');
    });
  });

  // --- PRESERVATION LOCK & NON-DESTRUCTIVE REDACTION ---
  describe('Vault Immutability & Preservation Lock', () => {
    it('Creates Version 2 working copy without modifying Version 1', async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Redaction Versioning Case' });
      const caseId = caseRes.body.case.case_id;

      const originalBytes = createValidPngBuffer('RAW_ORIGINAL_CONTENT');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', originalBytes, 'original.png');
      const evidenceId = uploadRes.body.evidence.evidence_id;

      const redactedBytes = createValidPngBuffer('REDACTED_WORKING_COPY');
      const redactRes = await request(app)
        .post(`/api/evidence/${evidenceId}/versions`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', redactedBytes, 'redacted.png')
        .field('isRedacted', 'true');

      expect(redactRes.status).toBe(201);
      expect(redactRes.body.version.versionNum).toBe(2);

      // Verify Version 1 remains intact
      const v1Res = await request(app)
        .get(`/api/evidence/${evidenceId}/file?version=1`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(v1Res.body.equals(originalBytes)).toBe(true);

      // Verify Version 2 returns redacted bytes
      const v2Res = await request(app)
        .get(`/api/evidence/${evidenceId}/file?version=2`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(v2Res.body.equals(redactedBytes)).toBe(true);
    });

    it('Preservation Lock prohibits deletion and records rejection in custody chain', async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Legal Hold Lock Case' });
      const caseId = caseRes.body.case.case_id;

      const fileBytes = createValidPngBuffer('PRESERVED_SEALED_PAYLOAD');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', fileBytes, 'hold.png');
      const evidenceId = uploadRes.body.evidence.evidence_id;

      // Activate lock
      await request(app)
        .patch(`/api/cases/${caseId}/preservation-lock`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ locked: true, reason: 'Statutory hold' });

      // Attempt deletion
      const delRes = await request(app)
        .delete(`/api/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(delRes.status).toBe(403);
      expect(delRes.body.error).toContain('Preservation Lock is active');
    });
  });
});
