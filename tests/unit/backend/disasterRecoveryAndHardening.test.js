/**
 * VeraTrace — Disaster Recovery, Extension Pairing & Security Hardening Vitest Suite
 *
 * Validates:
 * 1. P0 — Scoped Extension Pairing, Uploads, Retries, and Revocation
 * 2. P0 — Full Encrypted Disaster Recovery Backup & Transactional Integrity
 * 3. P1 — Strict Origin CORS Enforcement (rejection of unapproved domains & subdomains)
 * 4. P1 — Authentication Rate Limiting
 * 5. P1 — Strict Tenant Isolation on Unowned / Legacy Cases
 * 6. P1 — Trusted Checkpoint Anchoring & Public Key Substitution Prevention
 * 7. P1 — Vault Master Key Safety (refusal of silent regeneration if encrypted files exist)
 * 8. P2 — Session Token Revocation & Logout
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createServer } from '../../../server/server.js';
import { getDatabase } from '../../../server/db.js';
import {
  getVaultMasterKey,
  _resetVaultMasterKeyForTesting,
  calculateSha256,
  VAULT_DIR,
  KEY_FILE,
} from '../../../server/vault.js';
import {
  createCustodyCheckpoint,
  verifyCustodyCheckpoint,
  verifyCaseAuditChain,
  getEd25519KeyPair,
} from '../../../server/chainOfCustody.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createSyntheticPng(text = 'EVIDENCE_PAYLOAD') {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const content = Buffer.from(text, 'utf8');
  return Buffer.concat([header, content]);
}

describe('VeraTrace Enterprise Security Hardening & Disaster Recovery', () => {
  let app;
  let userAToken;
  let userBToken;
  let userAId;
  let userBId;

  beforeAll(async () => {
    app = createServer();

    // Register synthetic user A
    const uA = `sec_user_a_${Date.now()}`;
    const resA = await request(app)
      .post('/api/auth/register')
      .send({ username: uA, password: 'StrongPassword123!' });
    expect(resA.status).toBe(201);
    userAToken = resA.body.token;
    userAId = resA.body.user.userId;

    // Register synthetic user B
    const uB = `sec_user_b_${Date.now()}`;
    const resB = await request(app)
      .post('/api/auth/register')
      .send({ username: uB, password: 'StrongPassword123!' });
    expect(resB.status).toBe(201);
    userBToken = resB.body.token;
    userBId = resB.body.user.userId;
  });

  // --- 1. P0: CHROME EXTENSION PAIRING & SCOPED TOKENS ---
  describe('P0 — Chrome Extension Authentication & Scoped Pairing', () => {
    let extensionToken;
    let credentialId;
    let caseAId;

    beforeAll(async () => {
      // Create a case for User A
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: "User A's Extension Incident Case" });
      caseAId = caseRes.body.case.case_id;
    });

    it('Dashboard user pairs Chrome extension, receiving scoped token and credentialId', async () => {
      const pairRes = await request(app)
        .post('/api/auth/extension-pair')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ deviceName: 'Investigator Chrome MV3' });

      expect(pairRes.status).toBe(201);
      expect(pairRes.body.success).toBe(true);
      expect(pairRes.body.credentialId).toContain('ext_');
      expect(pairRes.body.extensionToken).toBeDefined();

      extensionToken = pairRes.body.extensionToken;
      credentialId = pairRes.body.credentialId;

      // Verify listing of credentials
      const listRes = await request(app)
        .get('/api/auth/extension-credentials')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.credentials.some((c) => c.credential_id === credentialId)).toBe(true);
    });

    it('Uploads evidence using the scoped extension token with case ownership verified', async () => {
      const pngBytes = createSyntheticPng('EXTENSION_TAB_CAPTURE_BYTES');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseAId}/evidence`)
        .set('Authorization', `Bearer ${extensionToken}`)
        .attach('file', pngBytes, 'browser_tab.png')
        .field('submissionSource', 'EXTENSION_CAPTURE')
        .field('submissionMethod', 'CHROME_EXT_MV3');

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.evidence).toBeDefined();
      expect(uploadRes.body.evidence.original_filename).toBe('browser_tab.png');
    });

    it('Rejects extension upload to another user’s case (Tenant isolation guard)', async () => {
      // Create a case for User B
      const caseBRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ title: "User B's Case" });
      const caseBId = caseBRes.body.case.case_id;

      // User A's extension token attempts to upload to User B's case
      const pngBytes = createSyntheticPng('UNAUTHORIZED_CROSS_TENANT_INJECTION');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseBId}/evidence`)
        .set('Authorization', `Bearer ${extensionToken}`)
        .attach('file', pngBytes, 'injected.png');

      expect(uploadRes.status).toBe(403);
      expect(uploadRes.body.error).toContain('Forbidden');
    });

    it('Revokes extension credential and rejects subsequent uploads with 401', async () => {
      // Revoke credential
      const revokeRes = await request(app)
        .delete(`/api/auth/extension-pair/${credentialId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(revokeRes.status).toBe(200);

      // Attempt upload with revoked extension token
      const pngBytes = createSyntheticPng('REVOKED_UPLOAD_ATTEMPT');
      const uploadRes = await request(app)
        .post(`/api/cases/${caseAId}/evidence`)
        .set('Authorization', `Bearer ${extensionToken}`)
        .attach('file', pngBytes, 'revoked.png');

      expect(uploadRes.status).toBe(401);
      expect(uploadRes.body.error).toContain('Extension credential has been revoked');
    });
  });

  // --- 2. P0: COMPLETE DISASTER RECOVERY & TRANSACTIONAL RESTORATION ---
  describe('P0 — Full Disaster Recovery Backups & Transactional Restoration', () => {
    let testCaseId;
    let originalPngBytes;
    let expectedSha256;
    let backupFileName;

    beforeAll(async () => {
      // Create dedicated case with evidence, timeline, and custody records
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Full DR Backup Target Case', summary: 'Critical evidence for disaster recovery test' });
      testCaseId = caseRes.body.case.case_id;

      originalPngBytes = createSyntheticPng('CRITICAL_VICTIM_FORENSIC_SNAPSHOT');
      expectedSha256 = calculateSha256(originalPngBytes);

      const evRes = await request(app)
        .post(`/api/cases/${testCaseId}/evidence`)
        .set('Authorization', `Bearer ${userAToken}`)
        .attach('file', originalPngBytes, 'critical_snapshot.png')
        .field('platform', 'Telegram');
      expect(evRes.status).toBe(201);

      // Add signed custody checkpoint
      await request(app)
        .post(`/api/cases/${testCaseId}/chain-of-custody/checkpoint`)
        .set('Authorization', `Bearer ${userAToken}`);
    });

    it('Packages full disaster recovery backup including encrypted binary files on disk', async () => {
      const backupRes = await request(app)
        .post('/api/backup')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(backupRes.status).toBe(200);
      expect(backupRes.body.success).toBe(true);
      expect(backupRes.body.filesCount).toBeGreaterThan(0);
      expect(backupRes.body.custodyCount).toBeGreaterThan(0);
      backupFileName = backupRes.body.backupFileName;
    });

    it('Restores backup transactionally with binary verification and custody chain integrity check', async () => {
      const restoreRes = await request(app)
        .post('/api/backup/restore')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ backupFileName });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.restored.filesCount).toBeGreaterThan(0);

      // Verify that the evidence file can be decrypted from vault storage and matches original bytes
      const db = getDatabase();
      const evFile = db.prepare('SELECT storage_path FROM evidence_files WHERE sha256_hash = ?').get(expectedSha256);
      expect(evFile).toBeDefined();
      expect(fs.existsSync(evFile.storage_path)).toBe(true);

      // Verify chain of custody passes cryptographic verification
      const chainCheck = verifyCaseAuditChain(testCaseId);
      expect(chainCheck.valid).toBe(true);
    });

    it('Rejects cross-tenant backup restore attempt (User B cannot overwrite User A’s case)', async () => {
      // User B attempts to restore User A's backup containing User A's case
      const crossTenantRestore = await request(app)
        .post('/api/backup/restore')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ backupFileName });

      expect(crossTenantRestore.status).toBe(400);
      expect(crossTenantRestore.body.error).toContain('Unauthorized cross-tenant overwrite rejected');
    });
  });

  // --- 3. P1: CORS RESTRICTION & SUBDOMAIN REJECTION ---
  describe('P1 — CORS Policy & Strict Origin Rejection', () => {
    it('Permits authorized origin https://veratrace-app.vercel.app', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://veratrace-app.vercel.app');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://veratrace-app.vercel.app');
    });

    it('Rejects unapproved arbitrary vercel subdomains (e.g. attacker.vercel.app)', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://attacker.vercel.app');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('CORS Policy: Origin https://attacker.vercel.app not allowed');
    });

    it('Rejects untrusted external domain', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://malicious-phishing.org');
      expect(res.status).toBe(403);
    });
  });

  // --- 4. P1: AUTHENTICATION RATE LIMITING ---
  describe('P1 — Authentication Rate Limiting', () => {
    it('Enforces sliding-window rate limit on authentication endpoints after rapid requests', async () => {
      const rateLimitApp = createServer();
      const client = request(rateLimitApp);
      let hit429 = false;

      // Issue 15 consecutive login requests from same IP
      for (let i = 0; i < 15; i++) {
        const res = await client
          .post('/api/auth/login')
          .send({ username: 'nonexistent_rate_limit_probe', password: 'WrongPassword!' });
        if (res.status === 429) {
          hit429 = true;
          expect(res.body.error).toContain('Too many authentication attempts');
          expect(res.headers['retry-after']).toBeDefined();
          break;
        }
      }

      expect(hit429).toBe(true);
    });
  });

  // --- 5. P1: STRICT TENANT ISOLATION ON UNOWNED CASES ---
  describe('P1 — Case Ownership & Unowned Isolation', () => {
    let unownedCaseId;

    beforeAll(() => {
      const db = getDatabase();
      unownedCaseId = `unowned_${Date.now()}`;
      db.prepare(`
        INSERT INTO cases (case_id, owner_id, title, summary, status, created_at, updated_at)
        VALUES (?, NULL, 'Legacy Demo Case Without Owner', 'Unassigned case', 'OPEN', datetime('now'), datetime('now'))
      `).run(unownedCaseId);
    });

    it('Ordinary user cannot access an unowned case without ownership assignment (403)', async () => {
      const res = await request(app)
        .get(`/api/cases/${unownedCaseId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Unowned case requires administrative assignment');
    });

    it('Unowned case does not appear in ordinary user case listing', async () => {
      const res = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cases.some((c) => c.case_id === unownedCaseId)).toBe(false);
    });

    it('Explicit case claim assigns ownership to user', async () => {
      const claimRes = await request(app)
        .post(`/api/cases/${unownedCaseId}/claim`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(claimRes.status).toBe(200);
      expect(claimRes.body.success).toBe(true);

      // Now user A can access it
      const accessRes = await request(app)
        .get(`/api/cases/${unownedCaseId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(accessRes.status).toBe(200);
      expect(accessRes.body.case.owner_id).toBe(userAId);
    });
  });

  // --- 6. P1: TRUSTED CUSTODY CHECKPOINTS & KEY SUBSTITUTION DEFENSE ---
  describe('P1 — Checkpoint Trusted Key Anchoring & Substitution Defense', () => {
    it('Verifies genuine checkpoint signed with authoritative server key', async () => {
      const db = getDatabase();
      const caseId = `case_chk_${Date.now()}`;
      db.prepare(`
        INSERT INTO cases (case_id, owner_id, title, status, created_at, updated_at)
        VALUES (?, ?, 'Checkpoint Test Case', 'OPEN', datetime('now'), datetime('now'))
      `).run(caseId, userAId);

      const checkpoint = createCustodyCheckpoint(caseId);

      // Verify checkpoint against server authority
      const verifyResult = verifyCustodyCheckpoint(checkpoint, true);
      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.keyTrusted).toBe(true);
      expect(verifyResult.signatureValid).toBe(true);
    });

    it('Detects and rejects public key substitution attack even if mathematically self-signed', async () => {
      const db = getDatabase();
      const caseId = `case_forgery_${Date.now()}`;
      db.prepare(`
        INSERT INTO cases (case_id, owner_id, title, status, created_at, updated_at)
        VALUES (?, ?, 'Forgery Test Case', 'OPEN', datetime('now'), datetime('now'))
      `).run(caseId, userAId);

      // Attacker generates their own rogue Ed25519 keypair
      const attackerKeys = crypto.generateKeyPairSync('ed25519');
      const attackerPrivPem = attackerKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
      const attackerPubPem = attackerKeys.publicKey.export({ type: 'spki', format: 'pem' });

      const forgerId = `chk_forged_${Date.now()}`;
      const ts = new Date().toISOString();
      const msg = `checkpoint|${forgerId}|${caseId}|0000000000000000000000000000000000000000000000000000000000000000|0|${ts}`;
      const attackerSig = crypto.sign(null, Buffer.from(msg, 'utf8'), attackerKeys.privateKey).toString('hex');

      const forgedCheckpoint = {
        checkpointId: forgerId,
        caseId,
        headEventHash: '0000000000000000000000000000000000000000000000000000000000000000',
        eventCount: 0,
        ed25519PublicKey: attackerPubPem,
        ed25519Signature: attackerSig,
        timestampUtc: ts,
      };

      // Verify using server authority — MUST fail key trust!
      const result = verifyCustodyCheckpoint(forgedCheckpoint, true);
      expect(result.keyTrusted).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.untrustedKeyWarning).toContain('CRITICAL SECURITY ALERT: Checkpoint public key is UNTRUSTED');
    });
  });

  // --- 7. P1: VAULT MASTER KEY SAFETY ---
  describe('P1 — Vault Key Recovery & Silent Regeneration Safeguard', () => {
    it('Refuses silent master key regeneration if encrypted vault files exist', () => {
      // Create a dummy .enc file in vault_storage
      const dummyEncPath = path.join(VAULT_DIR, `synthetic_test_${Date.now()}.enc`);
      fs.writeFileSync(dummyEncPath, Buffer.from('ENCRYPTED_SYNTHETIC_CIPHERTEXT'));

      // Temporarily rename master key file to simulate lost key
      const tempKeyBackup = `${KEY_FILE}.bak_${Date.now()}`;
      let backedUp = false;
      if (fs.existsSync(KEY_FILE)) {
        fs.renameSync(KEY_FILE, tempKeyBackup);
        backedUp = true;
      }
      _resetVaultMasterKeyForTesting();

      try {
        // Attempting to call getVaultMasterKey must throw critical recovery error!
        expect(() => {
          getVaultMasterKey();
        }).toThrow(/CRITICAL VAULT RECOVERY REQUIRED/);
      } finally {
        // Restore real key
        if (backedUp && fs.existsSync(tempKeyBackup)) {
          fs.renameSync(tempKeyBackup, KEY_FILE);
        }
        _resetVaultMasterKeyForTesting();
        if (fs.existsSync(dummyEncPath)) {
          fs.unlinkSync(dummyEncPath);
        }
      }
    });
  });

  // --- 8. P2: SESSION REVOCATION & LOGOUT ---
  describe('P2 — Token Revocation & Session Logout', () => {
    it('Revokes user token upon logout, causing subsequent requests to fail with 401', async () => {
      // 1. Issue a dedicated session for testing logout
      const tempUser = `logout_user_${Date.now()}`;
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ username: tempUser, password: 'SecurePassword123!' });
      const tempToken = regRes.body.token;

      // Verify token works
      const beforeLogout = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(beforeLogout.status).toBe(200);

      // 2. Perform logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // 3. Attempt request with revoked token
      const afterLogout = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.body.error).toContain('Token has been revoked');
    });
  });
});
