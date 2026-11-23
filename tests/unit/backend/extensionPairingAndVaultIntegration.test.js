import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../../server/server.js';
import { getDatabase } from '../../../server/db.js';
import { calculateSha256 } from '../../../server/vault.js';
import { issueExtensionToken } from '../../../server/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createSyntheticPng(label = 'SYNTHETIC_TEST_CAPTURE') {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const payload = Buffer.from(`DATA:${label}:${Date.now()}:${crypto.randomUUID()}`);
  return Buffer.concat([header, payload]);
}

describe('VeraTrace Chrome Extension Pairing & Vault Integration E2E', () => {
  let app;
  let db;
  let userToken;
  let userId;
  let caseId;
  let userBToken;
  let caseBId;

  beforeAll(async () => {
    app = createServer();
    db = getDatabase();

    // Register User A
    const uAName = `ext_user_a_${Date.now()}`;
    const regResA = await request(app)
      .post('/api/auth/register')
      .send({ username: uAName, password: 'SecurePassword123!', role: 'USER' });
    expect(regResA.status).toBe(201);
    userToken = regResA.body.token;
    userId = regResA.body.user.userId;

    // Create Case for User A
    const caseResA = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: "User A's Browser Harassment Case" });
    expect(caseResA.status).toBe(201);
    caseId = caseResA.body.case.case_id;

    // Register User B
    const uBName = `ext_user_b_${Date.now()}`;
    const regResB = await request(app)
      .post('/api/auth/register')
      .send({ username: uBName, password: 'SecurePassword123!', role: 'USER' });
    expect(regResB.status).toBe(201);
    userBToken = regResB.body.token;

    // Create Case for User B
    const caseResB = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ title: "User B's Case" });
    expect(caseResB.status).toBe(201);
    caseBId = caseResB.body.case.case_id;
  });

  describe('1. Single-Use Pairing Token Generation & Validation', () => {
    it('generates a cryptographically secure, short-lived pairing token', async () => {
      const res = await request(app)
        .post('/api/auth/extension-pairing-token')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceName: 'Brave Browser MV3' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.pairingToken).toMatch(/^vtp_/);
      expect(res.body.expiresInSeconds).toBe(600);
      expect(res.body.user.userId).toBe(userId);
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects redeeming an invalid or forged pairing token', async () => {
      const res = await request(app)
        .post('/api/auth/extension-pair')
        .send({ pairingToken: 'vtp_invalid_forged_token_12345' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid extension pairing token');
    });

    it('successfully redeems pairing token and issues scoped extension token', async () => {
      // 1. Generate fresh pairing token
      const tokenRes = await request(app)
        .post('/api/auth/extension-pairing-token')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceName: 'Chrome Investigator MV3' });
      expect(tokenRes.status).toBe(201);
      const pairingToken = tokenRes.body.pairingToken;

      // 2. Unauthenticated extension redeems pairing token
      const pairRes = await request(app)
        .post('/api/auth/extension-pair')
        .send({ pairingToken, deviceName: 'Chrome Investigator MV3' });

      expect(pairRes.status).toBe(201);
      expect(pairRes.body.success).toBe(true);
      expect(pairRes.body.credentialId).toContain('ext_');
      expect(pairRes.body.extensionToken).toBeDefined();
      expect(pairRes.body.user.userId).toBe(userId);

      // Verify token decoded structure
      const parts = pairRes.body.extensionToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      expect(payload.scope).toBe('EXTENSION_CAPTURE');
      expect(payload.credentialId).toBe(pairRes.body.credentialId);
      expect(payload.userId).toBe(userId);

      // 3. Re-using the same single-use token MUST be rejected
      const reuseRes = await request(app)
        .post('/api/auth/extension-pair')
        .send({ pairingToken, deviceName: 'Replay Attempt' });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error).toContain('already been redeemed');
    });

    it('rejects an expired pairing token', async () => {
      // Insert artificially expired token directly
      const expiredRawToken = `vtp_expired_${Date.now()}`;
      const tokenHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
      const pastDate = new Date(Date.now() - 60000).toISOString();

      db.prepare(`
        INSERT INTO extension_pairing_tokens (pairing_id, user_id, token_hash, device_name, expires_at, used, created_at)
        VALUES (?, ?, ?, 'Test Device', ?, 0, datetime('now'))
      `).run(`pair_exp_${Date.now()}`, userId, tokenHash, pastDate);

      const res = await request(app)
        .post('/api/auth/extension-pair')
        .send({ pairingToken: expiredRawToken });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('token has expired');
    });
  });

  describe('2. Server Vault Uploads & Forensic Custody Chain', () => {
    let extensionToken;
    let credentialId;

    beforeAll(async () => {
      const pairRes = await request(app)
        .post('/api/auth/extension-pairing-token')
        .set('Authorization', `Bearer ${userToken}`);
      const exchangeRes = await request(app)
        .post('/api/auth/extension-pair')
        .send({ pairingToken: pairRes.body.pairingToken });
      extensionToken = exchangeRes.body.extensionToken;
      credentialId = exchangeRes.body.credentialId;
    });

    it('uploads captured evidence using scoped extension token with genuine SHA-256 and vault encryption', async () => {
      const pngBytes = createSyntheticPng('SERVER_VAULT_TEST_EVIDENCE');
      const expectedSha256 = calculateSha256(pngBytes);

      const uploadRes = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${extensionToken}`)
        .attach('file', pngBytes, 'harassment_capture.png')
        .field('submissionSource', 'EXTENSION_CAPTURE')
        .field('submissionMethod', 'CHROME_EXT_MV3')
        .field('sourceUrl', 'https://instagram.com/direct/inbox')
        .field('platform', 'Instagram')
        .field('senderHandle', '@harasser_user')
        .field('notes', 'Threatening messages captured directly via Chrome Companion.');

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.evidence).toBeDefined();
      expect(uploadRes.body.evidence.sha256_hash).toBe(expectedSha256);
      expect(uploadRes.body.evidence.platform).toBe('Instagram');
      expect(uploadRes.body.evidence.sender_handle).toBe('@harasser_user');
      expect(uploadRes.body.evidence.submission_source).toBe('EXTENSION_CAPTURE');
      expect(uploadRes.body.evidence.submission_method).toBe('CHROME_EXT_MV3');

      // Verify chain-of-custody event was created
      const custodyRes = await request(app)
        .get(`/api/cases/${caseId}/chain-of-custody`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(custodyRes.status).toBe(200);
      const records = custodyRes.body.auditRecords || custodyRes.body.events || [];
      expect(records.some((e) => e.evidence_id === uploadRes.body.evidence.evidence_id && e.action === 'EVIDENCE_UPLOADED')).toBe(true);
    });

    it('enforces tenant isolation and rejects cross-tenant extension uploads', async () => {
      // User A's extension token attempts to inject evidence into User B's case
      const pngBytes = createSyntheticPng('CROSS_TENANT_TAMPER_ATTEMPT');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseBId}/evidence`)
        .set('Authorization', `Bearer ${extensionToken}`)
        .attach('file', pngBytes, 'injected.png');

      expect(uploadRes.status).toBe(403);
      expect(uploadRes.body.error).toContain('Forbidden');
    });

    it('revokes paired extension credential and rejects subsequent uploads', async () => {
      // Revoke credential
      const revokeRes = await request(app)
        .delete(`/api/auth/extension-pair/${credentialId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Attempt upload with revoked extension token
      const pngBytes = createSyntheticPng('REVOKED_UPLOAD_ATTEMPT');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${extensionToken}`)
        .attach('file', pngBytes, 'post_revocation.png');

      expect(uploadRes.status).toBe(401);
      expect(uploadRes.body.error).toContain('Extension credential has been revoked');
    });

    it('rejects unauthenticated evidence upload without Authorization header or session cookie with 401', async () => {
      const pngBytes = createSyntheticPng('UNAUTHENTICATED_UPLOAD_ATTEMPT');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .attach('file', pngBytes, 'unauthenticated.png');

      expect(uploadRes.status).toBe(401);
      expect(uploadRes.body.error).toContain('Missing or malformed Authorization header or session cookie');
    });

    it('rejects upload with expired extension credential with 401', async () => {
      const expiredCredId = `ext_exp_${Date.now()}`;
      const expiredToken = issueExtensionToken(
        { userId, username: 'testuser', credentialId: expiredCredId, deviceName: 'Old Device' },
        -3600
      );
      const tokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      db.prepare(`
        INSERT INTO extension_credentials (credential_id, user_id, device_name, token_hash, is_revoked, created_at, expires_at)
        VALUES (?, ?, 'Old Device', ?, 0, ?, ?)
      `).run(expiredCredId, userId, tokenHash, pastDate, pastDate);

      const pngBytes = createSyntheticPng('EXPIRED_CRED_UPLOAD');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .attach('file', pngBytes, 'expired.png');

      expect(uploadRes.status).toBe(401);
      expect(uploadRes.body.error).toMatch(/expired/i);
    });

    it('permits evidence upload to demo case VT-DEMO-2026 with investigator extension token', async () => {
      const pairRes = await request(app)
        .post('/api/auth/extension-pairing-token')
        .send({ deviceName: 'Demo Tester Device' });
      expect(pairRes.status).toBe(201);

      const exchangeRes = await request(app)
        .post('/api/auth/extension-pair')
        .send({ pairingToken: pairRes.body.pairingToken });
      expect(exchangeRes.status).toBe(201);
      const demoExtToken = exchangeRes.body.extensionToken;

      const pngBytes = createSyntheticPng('DEMO_CASE_INGESTION');
      const uploadRes = await request(app)
        .post('/api/cases/VT-DEMO-2026/evidence')
        .set('Authorization', `Bearer ${demoExtToken}`)
        .attach('file', pngBytes, 'demo_capture.png')
        .field('platform', 'Instagram')
        .field('notes', 'Demo evaluation capture');

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.evidence.case_id).toBe('VT-DEMO-2026');
    });
  });
});
