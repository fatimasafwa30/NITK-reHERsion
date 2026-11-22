/**
 * VeraTrace — Backend API, Vault Storage & Forensic Engine Vitest Suite
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../server/server.js';
import { getDatabase } from '../../../server/db.js';
import { verifyCaseAuditChain } from '../../../server/chainOfCustody.js';

describe('VeraTrace Backend Enterprise Forensic Engine', () => {
  let app;

  beforeAll(() => {
    app = createServer();
  });

  it('GET /api/health returns operational status with AES-256-GCM vault verification', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.vaultStorage).toContain('AES-256-GCM');
  });

  it('Creates a case and verifies initial chain of custody genesis event', async () => {
    const res = await request(app)
      .post('/api/cases')
      .send({
        title: 'Forensic Case VT-TEST-001',
        summary: 'Investigation of multi-platform harassment evidence.',
      });

    expect(res.status).toBe(201);
    expect(res.body.case).toBeDefined();
    const caseId = res.body.case.case_id;

    // Verify chain of custody entry
    const auditRes = await request(app).get(`/api/cases/${caseId}/chain-of-custody`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.auditRecords.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.body.auditRecords[0].action).toBe('CASE_CREATED');
    expect(auditRes.body.auditRecords[0].previous_event_hash).toBe(
      '0000000000000000000000000000000000000000000000000000000000000000'
    );
  });

  it('Ingests evidence, computes SHA-256, encrypts in vault, and triggers integrity evaluation', async () => {
    // 1. Create case
    const caseRes = await request(app)
      .post('/api/cases')
      .send({ title: 'Evidence Ingestion Test Case' });
    const caseId = caseRes.body.case.case_id;

    // 2. Upload file payload
    const testFileBuffer = Buffer.from('VERATRACE_TEST_EVIDENCE_PAYLOAD_BYTES_OCT2026', 'utf-8');
    const uploadRes = await request(app)
      .post(`/api/cases/${caseId}/evidence`)
      .attach('file', testFileBuffer, 'harassing_message.png')
      .field('submissionSource', 'EXTENSION_CAPTURE')
      .field('captureTimestamp', new Date().toISOString())
      .field('sourceUrl', 'https://instagram.com/direct/t/12345');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.evidence.sha256_hash).toBeDefined();
    expect(uploadRes.body.evidence.sha256_hash.length).toBe(64);
    expect(uploadRes.body.fileVersion.isOriginal).toBe(1);
    expect(uploadRes.body.assessment).toBeDefined();

    const evidenceId = uploadRes.body.evidence.evidence_id;

    // 3. Decrypt and stream file from vault
    const fileRes = await request(app).get(`/api/evidence/${evidenceId}/file`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.body.toString()).toBe('VERATRACE_TEST_EVIDENCE_PAYLOAD_BYTES_OCT2026');

    // 4. Verify chain of custody is intact
    const verifyChain = verifyCaseAuditChain(caseId);
    expect(verifyChain.verified).toBe(true);
    expect(verifyChain.breakages.length).toBe(0);
  });

  it('Creates a working redacted copy (Version 2) without mutating Version 1 original', async () => {
    const caseRes = await request(app).post('/api/cases').send({ title: 'Redaction Case' });
    const caseId = caseRes.body.case.case_id;

    const originalBuffer = Buffer.from('UNREDACTED SENSITIVE CONTENT', 'utf-8');
    const uploadRes = await request(app)
      .post(`/api/cases/${caseId}/evidence`)
      .attach('file', originalBuffer, 'original.png');
    const evidenceId = uploadRes.body.evidence.evidence_id;

    // Redacted version
    const redactedBuffer = Buffer.from('[REDACTED] CONTENT', 'utf-8');
    const redactRes = await request(app)
      .post(`/api/evidence/${evidenceId}/versions`)
      .attach('file', redactedBuffer, 'redacted.png')
      .field('isRedacted', 'true')
      .field('notes', 'Redacted personally identifiable information');

    expect(redactRes.status).toBe(201);
    expect(redactRes.body.version.versionNum).toBe(2);

    // Retrieve Version 1 (Original)
    const v1Res = await request(app).get(`/api/evidence/${evidenceId}/file?version=1`);
    expect(v1Res.body.toString()).toBe('UNREDACTED SENSITIVE CONTENT');

    // Retrieve Version 2 (Redacted)
    const v2Res = await request(app).get(`/api/evidence/${evidenceId}/file?version=2`);
    expect(v2Res.body.toString()).toBe('[REDACTED] CONTENT');
  });

  it('Enforces Preservation Lock: blocks deletion when legal preservation hold is active', async () => {
    const caseRes = await request(app).post('/api/cases').send({ title: 'Preservation Lock Case' });
    const caseId = caseRes.body.case.case_id;

    const fileBuffer = Buffer.from('PRESERVED FILE CONTENT', 'utf-8');
    const uploadRes = await request(app)
      .post(`/api/cases/${caseId}/evidence`)
      .attach('file', fileBuffer, 'locked.png');
    const evidenceId = uploadRes.body.evidence.evidence_id;

    // Activate Preservation Lock
    const lockRes = await request(app)
      .patch(`/api/cases/${caseId}/preservation-lock`)
      .send({ locked: true, reason: 'Police investigation pending', lockedBy: 'Officer Sharma' });
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.preservationLocked).toBe(true);

    // Attempt deletion -> MUST BE REJECTED with 403 Forbidden
    const deleteRes = await request(app).delete(`/api/evidence/${evidenceId}`);
    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.error).toContain('Preservation Lock');

    // Verify rejection was recorded in Chain of Custody
    const auditRes = await request(app).get(`/api/cases/${caseId}/chain-of-custody`);
    const rejectionEvent = auditRes.body.auditRecords.find(
      (e) => e.action === 'DELETION_REQUESTED_REJECTED'
    );
    expect(rejectionEvent).toBeDefined();
  });

  it('Runs cross-platform intelligence correlation and records reviewer decisions', async () => {
    const caseRes = await request(app).post('/api/cases').send({ title: 'Intelligence Test Case' });
    const caseId = caseRes.body.case.case_id;

    const db = getDatabase();
    const t1Id = `t1_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const t2Id = `t2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // Add two timeline events with same handle on Instagram & WhatsApp
    db.prepare(`
      INSERT INTO timeline_events (event_id, case_id, occurred_at, label, platform, sender_handle, created_at)
      VALUES 
        (?, ?, '2026-10-15T10:00:00Z', 'Direct Message', 'Instagram', '@harasser_user', datetime('now')),
        (?, ?, '2026-10-16T14:00:00Z', 'Threatening Message', 'WhatsApp', '@harasser_user', datetime('now'))
    `).run(t1Id, caseId, t2Id, caseId);

    const intelRes = await request(app).get(`/api/cases/${caseId}/intelligence`);
    expect(intelRes.status).toBe(200);
    expect(intelRes.body.graph).toBeDefined();
    expect(intelRes.body.correlations.length).toBeGreaterThanOrEqual(1);

    const correlation = intelRes.body.correlations[0];
    expect(correlation.relationType).toBe('SHARED_IDENTIFIER');

    // Review decision
    const reviewRes = await request(app)
      .post(`/api/cases/${caseId}/correlations/${correlation.correlationId}/review`)
      .send({
        status: 'VERIFIED_RELATIONSHIP',
        reviewedBy: 'Forensic Investigator',
        notes: 'Corroborated by user statement and screenshot context',
      });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.status).toBe('VERIFIED_RELATIONSHIP');
  });

  it('Generates encrypted backup with valid SHA-256 fingerprint', async () => {
    const res = await request(app).post('/api/backup');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sha256).toBeDefined();
    expect(res.body.sha256.length).toBe(64);
  });
});
