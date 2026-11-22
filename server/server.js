/**
 * VeraTrace — Backend REST API Server (Remediated Enterprise Forensic Engine)
 *
 * Implements:
 * 1. Cryptographically Secure Authentication (HMAC-SHA256 Token issuance & Scrypt hashing)
 * 2. Strict Multi-Tenant Authorization & Case-Level IDOR Prevention
 * 3. AES-256-GCM Authenticated Encryption for Vault & Backups (No plaintext leaks)
 * 4. Magic-Byte File Validation & Executable Binary Disallowance
 * 5. Ed25519-Signed Custody Checkpoints for External Audit Anchoring
 * 6. Cross-Platform Intelligence with Generic Identifier Stop-Lists
 * 7. Whitelisted CORS & Sliding-Window Rate Limiting
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDatabase } from './db.js';
import {
  storeVaultFile,
  retrieveVaultFile,
  calculateSha256,
  encryptBackup,
  decryptBackup,
  decryptBuffer,
  VAULT_DIR,
} from './vault.js';
import {
  recordCustodyEvent,
  verifyCaseAuditChain,
  createCustodyCheckpoint,
  verifyCustodyCheckpoint,
  computeKeyFingerprint,
  getEd25519KeyPair,
  CUSTODY_ACTIONS,
} from './chainOfCustody.js';
import {
  assessEvidenceIntegrity,
  EVIDENCE_CLASSIFICATIONS,
} from './integrityEngine.js';
import {
  analyzeCaseIntelligence,
  recordCorrelationReview,
} from './correlationEngine.js';
import {
  hashPassword,
  verifyPassword,
  issueToken,
  issueExtensionToken,
  revokeToken,
  revokeExtensionCredential,
  isTokenRevoked,
  requireAuth,
  optionalAuth,
} from './auth.js';
import {
  validateEvidenceFile,
  sanitizeFilename,
} from './fileValidator.js';
import { createRateLimiter } from './rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  // --- 1. CORS CONFIGURATION (ENVIRONMENT-AWARE WHITELIST) ---
  const isProduction = process.env.NODE_ENV === 'production';

  const defaultProductionOrigins = [
    'https://veratrace-app.vercel.app',
  ];

  const defaultDevelopmentOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5176',
    'http://localhost:4000',
    'https://veratrace-app.vercel.app',
  ];

  const defaultAllowedOrigins = isProduction ? defaultProductionOrigins : defaultDevelopmentOrigins;

  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : defaultAllowedOrigins;

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (such as mobile apps, curl, or server-side test runners)
        if (!origin) return callback(null, true);
        if (configuredOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS Policy: Origin ${origin} not allowed by Access-Control-Allow-Origin.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Actor', 'X-VeraTrace-Version'],
    })
  );

  // Custom CORS rejection handler so callers receive 403 Forbidden
  app.use((err, req, res, next) => {
    if (err && err.message && err.message.startsWith('CORS Policy:')) {
      return res.status(403).json({ error: err.message });
    }
    next(err);
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // File upload handler (Max 100 MB per file)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  // Dedicated Rate Limiters
  const authLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 10, message: 'Too many authentication attempts. Please try again in a minute.' });
  const uploadLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 60, message: 'Upload rate limit exceeded. Please wait a minute.' });
  const decryptionLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 120, message: 'Evidence decryption rate limit exceeded. Please wait a minute.' });
  const backupLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 10, message: 'Backup rate limit exceeded.' });

  const db = getDatabase();

  // --- AUTHORIZATION & IDOR GUARDS ---
  /**
   * Middleware: Asserts user is authorized to access the case specified in req.params.id
   */
  function requireCaseAccess(req, res, next) {
    const caseId = req.params.id || req.params.caseId || req.body.caseId;
    if (!caseId) {
      return res.status(400).json({ error: 'Case ID parameter is required' });
    }

    const c = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(caseId);
    if (!c) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Tenant / Owner enforcement
    if (!c.owner_id) {
      if (req.user && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'Forbidden: Unowned case requires administrative assignment.',
        });
      }
    } else if (req.user && req.user.role !== 'ADMIN' && c.owner_id !== req.user.userId) {
      return res.status(403).json({
        error: 'Forbidden: You do not have authorization to view or modify this case (Case-Level Access Control).',
      });
    }

    req.caseRecord = c;
    next();
  }

  /**
   * Middleware: Asserts user is authorized to access the evidence record in req.params.id
   */
  function requireEvidenceAccess(req, res, next) {
    const evidenceId = req.params.id;
    if (!evidenceId) {
      return res.status(400).json({ error: 'Evidence ID parameter is required' });
    }

    const rec = db.prepare(`
      SELECT e.*, c.owner_id 
      FROM evidence_records e 
      JOIN cases c ON e.case_id = c.case_id 
      WHERE e.evidence_id = ?
    `).get(evidenceId);

    if (!rec) {
      return res.status(404).json({ error: 'Evidence record not found' });
    }

    if (!rec.owner_id) {
      if (req.user && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'Forbidden: Access denied to evidence belonging to unowned case without admin role.',
        });
      }
    } else if (req.user && req.user.role !== 'ADMIN' && rec.owner_id !== req.user.userId) {
      return res.status(403).json({
        error: 'Forbidden: Access denied to evidence belonging to another user (IDOR Guard).',
      });
    }

    req.evidenceRecord = rec;
    next();
  }

  // --- HEALTH & DIAGNOSTICS (PUBLIC) ---
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'VeraTrace Evidence Vault & Intelligence Engine',
      version: '2.1.0-enterprise',
      vaultStorage: 'AES-256-GCM Encrypted',
      backupStorage: 'AES-256-GCM Authenticated',
      auth: 'HMAC-SHA256 Token Auth Active',
      timestamp: new Date().toISOString(),
    });
  });

  // --- AUTHENTICATION & USER MANAGEMENT ---
  app.post('/api/auth/register', authLimiter, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const cleanUser = username.trim().toLowerCase();
    const existing = db.prepare('SELECT user_id FROM users WHERE username = ?').get(cleanUser);
    if (existing) {
      return res.status(409).json({ error: 'Username already registered.' });
    }

    const userId = `usr_${crypto.randomUUID()}`;
    const passwordHash = hashPassword(password);
    const assignedRole = role === 'INVESTIGATOR' || role === 'ADMIN' ? role : 'USER';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (user_id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, cleanUser, passwordHash, assignedRole, now);

    const token = issueToken({ userId, username: cleanUser, role: assignedRole });

    res.status(201).json({
      success: true,
      user: { userId, username: cleanUser, role: assignedRole },
      token,
    });
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUser = username.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUser);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password credentials.' });
    }

    const token = issueToken({ userId: user.user_id, username: user.username, role: user.role });

    res.json({
      success: true,
      user: { userId: user.user_id, username: user.username, role: user.role },
      token,
    });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    if (req.user && req.user.jti) {
      revokeToken(req.user.jti, req.user.exp);
    }
    res.json({ success: true, message: 'Logged out successfully; session token revoked.' });
  });

  // Dedicated Chrome Extension Scoped Pairing Flow
  app.post('/api/auth/extension-pair', requireAuth, authLimiter, (req, res) => {
    const { deviceName = 'Chrome MV3 Extension' } = req.body || {};
    const credentialId = `ext_${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const extensionToken = issueExtensionToken(
      {
        userId: req.user.userId,
        username: req.user.username,
        credentialId,
        deviceName,
      },
      30 * 86400
    );

    const tokenHash = crypto.createHash('sha256').update(extensionToken).digest('hex');

    db.prepare(`
      INSERT INTO extension_credentials (credential_id, user_id, device_name, token_hash, is_revoked, created_at, expires_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(credentialId, req.user.userId, deviceName, tokenHash, now.toISOString(), expiresAt);

    res.status(201).json({
      success: true,
      credentialId,
      extensionToken,
      expiresAt,
      deviceName,
      user: {
        userId: req.user.userId,
        username: req.user.username,
      },
    });
  });

  app.get('/api/auth/extension-credentials', requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT credential_id, device_name, is_revoked, created_at, expires_at
      FROM extension_credentials
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.userId);
    res.json({ credentials: rows });
  });

  app.delete('/api/auth/extension-pair/:credentialId', requireAuth, (req, res) => {
    const { credentialId } = req.params;
    const revoked = revokeExtensionCredential(credentialId, req.user.role === 'ADMIN' ? null : req.user.userId);
    if (!revoked) {
      return res.status(404).json({ error: 'Extension credential not found or unauthorized to revoke' });
    }
    res.json({ success: true, message: 'Extension credential revoked successfully.' });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT user_id, username, role, created_at FROM users WHERE user_id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User account not found' });
    res.json({ user });
  });

  // --- CASES API (PROTECTED & STRICTLY TENANT-ISOLATED) ---
  app.get('/api/cases', requireAuth, (req, res) => {
    let rows;
    if (req.user.role === 'ADMIN') {
      rows = db.prepare('SELECT * FROM cases ORDER BY updated_at DESC').all();
    } else {
      // Strictly return cases owned by the authenticated tenant
      rows = db.prepare(`
        SELECT * FROM cases 
        WHERE owner_id = ? 
        ORDER BY updated_at DESC
      `).all(req.user.userId);
    }
    res.json({ cases: rows });
  });

  // Explicit Administrative Assignment of unowned/legacy cases (Case Hijacking Guard)
  app.post('/api/cases/:id/claim', requireAuth, (req, res) => {
    // Only administrators can claim or assign unowned legacy cases
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden: Only administrators can claim or assign unowned legacy cases (Case Hijacking Guard).',
      });
    }

    const caseId = req.params.id;
    const { targetUserId } = req.body || {};
    const c = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(caseId);
    if (!c) return res.status(404).json({ error: 'Case not found' });

    const newOwnerId = targetUserId || req.user.userId;
    db.prepare('UPDATE cases SET owner_id = ?, updated_at = ? WHERE case_id = ?').run(
      newOwnerId,
      new Date().toISOString(),
      caseId
    );
    res.json({ success: true, message: `Case ${caseId} successfully assigned to ${newOwnerId}.` });
  });

  app.post('/api/cases', requireAuth, (req, res) => {
    const { title, summary, caseId } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Case title is required' });
    }

    const newId = caseId || `case_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    // NEVER trust owner_id in body; ALWAYS bind to authenticated user identity!
    const ownerId = req.user.userId;

    const stmt = db.prepare(`
      INSERT INTO cases (case_id, owner_id, title, summary, status, preservation_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'OPEN', 0, ?, ?)
    `);
    stmt.run(newId, ownerId, title.trim(), (summary || '').trim(), now, now);

    recordCustodyEvent({
      caseId: newId,
      actor: req.user.username || 'User',
      action: 'CASE_CREATED',
      metadata: { title, summary, ownerId },
    });

    const created = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(newId);
    res.status(201).json({ case: created });
  });

  app.get('/api/cases/:id', requireAuth, requireCaseAccess, (req, res) => {
    res.json({ case: req.caseRecord });
  });

  // Preservation Lock Activation / Deactivation
  app.patch('/api/cases/:id/preservation-lock', requireAuth, requireCaseAccess, (req, res) => {
    const { locked, reason, lockedBy } = req.body;
    const caseId = req.params.id;

    const now = new Date().toISOString();
    const isLocked = locked ? 1 : 0;
    const actor = lockedBy || req.user.username || 'Authorized Investigator';

    db.prepare(`
      UPDATE cases 
      SET preservation_locked = ?, locked_at = ?, locked_by = ?, updated_at = ?
      WHERE case_id = ?
    `).run(isLocked, isLocked ? now : null, isLocked ? actor : null, now, caseId);

    // Also update all evidence records in case
    db.prepare(`
      UPDATE evidence_records
      SET preservation_locked = ?, updated_at = ?
      WHERE case_id = ?
    `).run(isLocked, now, caseId);

    recordCustodyEvent({
      caseId,
      actor,
      action: isLocked ? CUSTODY_ACTIONS.PRESERVATION_LOCK_ACTIVATED : CUSTODY_ACTIONS.PRESERVATION_LOCK_DEACTIVATED,
      metadata: { reason: reason || 'Statutory legal hold activated', locked: isLocked },
    });

    res.json({
      success: true,
      caseId,
      preservationLocked: Boolean(isLocked),
      lockedAt: isLocked ? now : null,
    });
  });

  // --- EVIDENCE INGESTION & VAULT STORAGE (WITH VALIDATION & RATE LIMITS) ---
  app.post(
    '/api/cases/:id/evidence',
    requireAuth,
    requireCaseAccess,
    uploadLimiter,
    upload.single('file'),
    async (req, res) => {
      try {
        const caseId = req.params.id;
        const file = req.file;

        if (!file || !file.buffer) {
          return res.status(400).json({ error: 'Evidence file binary payload is required' });
        }

        // Magic-byte signature validation & filename sanitization
        const validation = validateEvidenceFile({
          buffer: file.buffer,
          originalFilename: file.originalname,
          clientMimeType: file.mimetype,
        });

        const caseRecord = req.caseRecord;
        const evidenceId = req.body.evidenceId || `ev_${crypto.randomUUID()}`;
        const sanitizedName = validation.sanitizedFilename;
        const fileType = validation.detectedMime;
        const fileSize = file.buffer.length;
        const sha256 = calculateSha256(file.buffer);

        const submissionSource = req.body.submissionSource || (req.body.isExtensionCapture ? 'EXTENSION_CAPTURE' : 'USER_SUBMITTED');
        const submissionMethod = req.body.submissionMethod || 'BROWSER_INTAKE';
        const captureTimestamp = req.body.captureTimestamp || null;
        const sourceUrl = req.body.sourceUrl ? String(req.body.sourceUrl).slice(0, 500) : null;
        const now = new Date().toISOString();

        // Server-Side Idempotency Protection:
        // A repeated submission (e.g. from network disconnect during ACK) returns existing record without duplicating
        const existingRecord = db.prepare(`
          SELECT * FROM evidence_records 
          WHERE case_id = ? AND (evidence_id = ? OR (sha256_hash = ? AND submission_source = 'EXTENSION_CAPTURE'))
        `).get(caseId, evidenceId, sha256);

        if (existingRecord) {
          return res.status(200).json({
            success: true,
            idempotentReplay: true,
            evidence: existingRecord,
            message: 'Evidence was already securely sealed in vault (idempotent submission ACK).',
          });
        }

        // 1. Store Version 1 (Immutable Original) in Encrypted Vault
        const fileVersion = await storeVaultFile({
          evidenceId,
          versionNum: 1,
          buffer: file.buffer,
          fileType,
          isOriginal: true,
        });

        // 2. Insert Evidence Record Master
        db.prepare(`
          INSERT INTO evidence_records (
            evidence_id, case_id, original_filename, file_type, file_size,
            sha256_hash, source_url, submission_source, submission_method,
            capture_timestamp, upload_timestamp, classification, preservation_locked,
            active_version, integrity_status, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            1, 'VERIFIED', ?, ?
          )
        `).run(
          evidenceId,
          caseId,
          sanitizedName,
          fileType,
          fileSize,
          sha256,
          sourceUrl,
          submissionSource,
          submissionMethod,
          captureTimestamp,
          now,
          submissionSource === 'EXTENSION_CAPTURE' ? EVIDENCE_CLASSIFICATIONS.CAPTURED : EVIDENCE_CLASSIFICATIONS.USER_SUBMITTED,
          caseRecord.preservation_locked,
          now,
          now
        );

        // 3. Insert File Version Record
        db.prepare(`
          INSERT INTO evidence_files (
            file_id, evidence_id, version_num, file_type, file_size,
            sha256_hash, storage_path, is_original, is_redacted, is_annotated,
            encryption_iv, encryption_tag, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fileVersion.fileId,
          evidenceId,
          1,
          fileType,
          fileSize,
          sha256,
          fileVersion.storagePath,
          1,
          0,
          0,
          fileVersion.encryptionIv,
          fileVersion.encryptionTag,
          now
        );

        // 4. Record Cryptographic Chain of Custody Entry
        recordCustodyEvent({
          caseId,
          evidenceId,
          actor: req.user.username || (submissionSource === 'EXTENSION_CAPTURE' ? 'Chrome Extension MV3' : 'User'),
          action: CUSTODY_ACTIONS.EVIDENCE_UPLOADED,
          metadata: {
            originalFilename: sanitizedName,
            sha256Hash: sha256,
            fileSize,
            submissionSource,
            captureTimestamp,
            sourceUrl,
            vaultPath: fileVersion.storagePath,
          },
        });

        // 5. Run Immediate Integrity & Credibility Assessment
        const assessment = assessEvidenceIntegrity(evidenceId);
        const record = db.prepare('SELECT * FROM evidence_records WHERE evidence_id = ?').get(evidenceId);

        res.status(201).json({
          success: true,
          evidence: record,
          fileVersion,
          assessment,
        });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.get('/api/cases/:id/evidence', requireAuth, requireCaseAccess, (req, res) => {
    const caseId = req.params.id;
    const records = db.prepare('SELECT * FROM evidence_records WHERE case_id = ? ORDER BY created_at DESC').all(caseId);

    const enriched = records.map((r) => {
      const assessment = db.prepare('SELECT * FROM integrity_assessments WHERE evidence_id = ?').get(r.evidence_id);
      const versions = db.prepare('SELECT file_id, version_num, file_type, file_size, sha256_hash, is_original, is_redacted, is_annotated, annotation_notes, created_at FROM evidence_files WHERE evidence_id = ? ORDER BY version_num ASC').all(r.evidence_id);
      return {
        ...r,
        assessment: assessment ? {
          ...assessment,
          flags: JSON.parse(assessment.flags),
          recommendedSteps: JSON.parse(assessment.recommended_steps),
        } : null,
        versions,
      };
    });

    res.json({ evidence: enriched });
  });

  // Decrypt and stream an evidence file (Strictly Authorization-Guarded & Rate-Limited)
  app.get('/api/evidence/:id/file', requireAuth, requireEvidenceAccess, decryptionLimiter, async (req, res) => {
    try {
      const evidenceId = req.params.id;
      const versionNum = parseInt(req.query.version || '1', 10);

      const fileRecord = db.prepare(`
        SELECT * FROM evidence_files WHERE evidence_id = ? AND version_num = ?
      `).get(evidenceId, versionNum);

      if (!fileRecord) {
        return res.status(404).json({ error: 'Evidence file version not found' });
      }

      const decrypted = await retrieveVaultFile(fileRecord);

      // Record access in Chain of Custody
      recordCustodyEvent({
        caseId: req.evidenceRecord.case_id,
        evidenceId,
        actor: req.user.username || 'User',
        action: CUSTODY_ACTIONS.EVIDENCE_ACCESSED,
        metadata: { versionNum, sha256: fileRecord.sha256_hash },
      });

      res.setHeader('Content-Type', fileRecord.file_type || 'application/octet-stream');
      res.setHeader('X-VeraTrace-Hash', fileRecord.sha256_hash);
      res.setHeader('X-VeraTrace-Version', versionNum);
      res.setHeader('Content-Disposition', `inline; filename="${sanitizeFilename(req.evidenceRecord.original_filename)}"`);
      res.send(decrypted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Redact or Annotate Evidence (Creates Version 2+, Original stays untouched)
  app.post('/api/evidence/:id/versions', requireAuth, requireEvidenceAccess, upload.single('file'), async (req, res) => {
    try {
      const evidenceId = req.params.id;
      const file = req.file;
      const { isRedacted, isAnnotated, notes } = req.body;

      if (!file || !file.buffer) {
        return res.status(400).json({ error: 'Working copy file payload is required' });
      }

      const validation = validateEvidenceFile({
        buffer: file.buffer,
        originalFilename: file.originalname,
        clientMimeType: file.mimetype,
      });

      const master = req.evidenceRecord;
      const maxVersionRow = db.prepare('SELECT MAX(version_num) as max_v FROM evidence_files WHERE evidence_id = ?').get(evidenceId);
      const nextVersion = (maxVersionRow?.max_v || 1) + 1;

      const fileVersion = await storeVaultFile({
        evidenceId,
        versionNum: nextVersion,
        buffer: file.buffer,
        fileType: validation.detectedMime || master.file_type,
        isOriginal: false,
        isRedacted: Boolean(isRedacted),
        isAnnotated: Boolean(isAnnotated),
        annotationNotes: notes || null,
      });

      db.prepare(`
        INSERT INTO evidence_files (
          file_id, evidence_id, version_num, file_type, file_size,
          sha256_hash, storage_path, is_original, is_redacted, is_annotated,
          annotation_notes, encryption_iv, encryption_tag, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).run(
        fileVersion.fileId,
        evidenceId,
        nextVersion,
        fileVersion.fileType,
        fileVersion.fileSize,
        fileVersion.sha256Hash,
        fileVersion.storagePath,
        fileVersion.isRedacted,
        fileVersion.isAnnotated,
        notes || null,
        fileVersion.encryptionIv,
        fileVersion.encryptionTag,
        new Date().toISOString()
      );

      // Update active version
      db.prepare('UPDATE evidence_records SET active_version = ?, updated_at = ? WHERE evidence_id = ?').run(
        nextVersion,
        new Date().toISOString(),
        evidenceId
      );

      recordCustodyEvent({
        caseId: master.case_id,
        evidenceId,
        actor: req.user.username || 'User',
        action: isRedacted ? CUSTODY_ACTIONS.EVIDENCE_REDACTED : CUSTODY_ACTIONS.EVIDENCE_ANNOTATED,
        metadata: {
          newVersionNum: nextVersion,
          notes,
          newHash: fileVersion.sha256Hash,
        },
      });

      res.status(201).json({ success: true, version: fileVersion });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Deletion Request (Preservation Lock & Authorization Guarded)
  app.delete('/api/evidence/:id', requireAuth, requireEvidenceAccess, (req, res) => {
    const evidenceId = req.params.id;
    const record = req.evidenceRecord;
    const caseRecord = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(record.case_id);

    // Enforce Preservation Lock
    if (record.preservation_locked === 1 || caseRecord?.preservation_locked === 1) {
      recordCustodyEvent({
        caseId: record.case_id,
        evidenceId,
        actor: req.user.username || 'User',
        action: CUSTODY_ACTIONS.DELETION_REQUESTED_REJECTED,
        metadata: { reason: 'Evidence Preservation Lock is active. Deletion is prohibited by statutory legal hold.' },
      });

      return res.status(403).json({
        error: 'Deletion Prohibited: Evidence Preservation Lock is active on this case. Original evidence cannot be deleted.',
      });
    }

    db.prepare('DELETE FROM evidence_records WHERE evidence_id = ?').run(evidenceId);

    recordCustodyEvent({
      caseId: record.case_id,
      evidenceId,
      actor: req.user.username || 'User',
      action: 'EVIDENCE_DELETED',
      metadata: { originalFilename: record.original_filename },
    });

    res.json({ success: true, message: 'Evidence record removed.' });
  });

  // --- CHAIN OF CUSTODY & SIGNED CHECKPOINTS API ---
  app.get('/api/cases/:id/chain-of-custody', requireAuth, requireCaseAccess, (req, res) => {
    const caseId = req.params.id;
    const rows = db.prepare('SELECT * FROM chain_of_custody WHERE case_id = ? ORDER BY rowid ASC').all(caseId);
    res.json({
      caseId,
      auditRecords: rows.map((r) => ({
        ...r,
        event_metadata: JSON.parse(r.event_metadata),
      })),
    });
  });

  app.post('/api/cases/:id/chain-of-custody/verify', requireAuth, requireCaseAccess, (req, res) => {
    const caseId = req.params.id;
    const verification = verifyCaseAuditChain(caseId);
    res.json(verification);
  });

  // Create Ed25519-Signed Checkpoint
  app.post('/api/cases/:id/chain-of-custody/checkpoint', requireAuth, requireCaseAccess, (req, res) => {
    try {
      const caseId = req.params.id;
      const checkpoint = createCustodyCheckpoint(caseId);
      res.status(201).json(checkpoint);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // List Signed Checkpoints for External Verification
  app.get('/api/cases/:id/chain-of-custody/checkpoints', requireAuth, requireCaseAccess, (req, res) => {
    const caseId = req.params.id;
    const checkpoints = db.prepare('SELECT * FROM custody_checkpoints WHERE case_id = ? ORDER BY created_at DESC').all(caseId);
    res.json({ caseId, checkpoints });
  });

  // Verify Checkpoint Signature & Compare with live SQLite state (Against Trusted Authority Key)
  app.post('/api/cases/:id/chain-of-custody/checkpoint/verify', optionalAuth, (req, res) => {
    try {
      const checkpointData = req.body.checkpoint ? req.body.checkpoint : req.body;
      const trustedKeyOptions = {
        trustedPublicKeyPem: req.body.trustedPublicKeyPem,
        trustedFingerprints: req.body.trustedFingerprints,
        allowUntrusted: req.body.allowUntrusted,
      };
      const result = verifyCustodyCheckpoint(checkpointData, true, trustedKeyOptions);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- INTEGRITY ASSESSMENT API ---
  app.get('/api/cases/:id/integrity-assessment', requireAuth, requireCaseAccess, (req, res) => {
    const caseId = req.params.id;
    const records = db.prepare('SELECT evidence_id FROM evidence_records WHERE case_id = ?').all(caseId);
    const assessments = records.map((r) => assessEvidenceIntegrity(r.evidence_id));
    res.json({ caseId, assessments });
  });

  app.post('/api/evidence/:id/assess', requireAuth, requireEvidenceAccess, (req, res) => {
    try {
      const assessment = assessEvidenceIntegrity(req.params.id);
      res.json(assessment);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- CROSS-PLATFORM INTELLIGENCE API ---
  app.get('/api/cases/:id/intelligence', requireAuth, requireCaseAccess, (req, res) => {
    try {
      const intelligence = analyzeCaseIntelligence(req.params.id);
      res.json(intelligence);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cases/:id/correlations/:corrId/review', requireAuth, requireCaseAccess, (req, res) => {
    const { status, reviewedBy, notes } = req.body;
    const result = recordCorrelationReview({
      correlationId: req.params.corrId,
      status,
      reviewedBy: reviewedBy || req.user.username || 'Investigator',
      reviewNotes: notes,
    });
    res.json(result);
  });

  // --- DISAPPEARANCE & DELETION MONITORING ---
  app.post('/api/cases/:id/disappearance-report', requireAuth, requireCaseAccess, (req, res) => {
    const { evidenceId, statement, externalUrl, verificationNotes } = req.body;
    const caseId = req.params.id;

    const reportId = `disappear_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO disappearance_reports (
        report_id, case_id, evidence_id, reported_at, victim_statement,
        external_url, verified_status, verification_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'USER_REPORTED', ?, ?)
    `).run(reportId, caseId, evidenceId, now, statement, externalUrl || null, verificationNotes || null, now);

    recordCustodyEvent({
      caseId,
      evidenceId,
      actor: req.user.username || 'Victim',
      action: CUSTODY_ACTIONS.DISAPPEARANCE_REPORT_LOGGED,
      metadata: { statement, externalUrl },
    });

    res.status(201).json({
      success: true,
      reportId,
      status: 'USER_REPORTED',
      reportedAt: now,
    });
  });

  app.get('/api/cases/:id/disappearance-reports', requireAuth, requireCaseAccess, (req, res) => {
    const reports = db.prepare('SELECT * FROM disappearance_reports WHERE case_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ reports });
  });

  // --- TRUSTED CONTACTS & PLATFORM REPORTING TRACKER ---
  app.get('/api/cases/:id/safety', requireAuth, requireCaseAccess, (req, res) => {
    const caseId = req.params.id;
    const contacts = db.prepare('SELECT * FROM trusted_contacts WHERE case_id = ?').all(caseId);
    const reports = db.prepare('SELECT * FROM platform_reports WHERE case_id = ? ORDER BY report_date DESC').all(caseId);
    const c = db.prepare('SELECT preservation_locked, locked_at, locked_by FROM cases WHERE case_id = ?').get(caseId);

    res.json({
      caseId,
      preservationLock: c || { preservation_locked: 0 },
      trustedContacts: contacts,
      platformReports: reports,
    });
  });

  app.post('/api/cases/:id/trusted-contacts', requireAuth, requireCaseAccess, (req, res) => {
    const { name, email, phone, accessLevel } = req.body;
    const caseId = req.params.id;

    const contactId = `contact_${crypto.randomUUID()}`;
    const token = crypto.randomBytes(16).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    db.prepare(`
      INSERT INTO trusted_contacts (
        contact_id, case_id, contact_name, contact_email, contact_phone,
        access_level, is_active, revocable_key_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
    `).run(contactId, caseId, name, email, phone || null, accessLevel || 'EMERGENCY_SUMMARY_ONLY', tokenHash);

    recordCustodyEvent({
      caseId,
      actor: req.user.username || 'User',
      action: 'TRUSTED_CONTACT_ADDED',
      metadata: { contactName: name, contactEmail: email, accessLevel },
    });

    res.status(201).json({ success: true, contactId, revocableKey: token });
  });

  app.post('/api/cases/:id/platform-reports', requireAuth, requireCaseAccess, (req, res) => {
    const { platform, reportDate, referenceNumber, incidentSummary, acknowledgementNotes } = req.body;
    const caseId = req.params.id;

    const reportId = `rep_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO platform_reports (
        report_id, case_id, platform, report_date, reference_number,
        incident_summary, outcome_status, acknowledgement_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_ACKNOWLEDGEMENT', ?, datetime('now'))
    `).run(reportId, caseId, platform, reportDate, referenceNumber, incidentSummary || null, acknowledgementNotes || null);

    res.status(201).json({ success: true, reportId });
  });

  // --- ENCRYPTED DISASTER RECOVERY BACKUP & RESTORATION API ---
  app.post('/api/backup', requireAuth, backupLimiter, (req, res) => {
    try {
      const backupDir = path.join(__dirname, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `veratrace_backup_${timestamp}.enc`;
      const backupPath = path.join(backupDir, backupFileName);

      // Prevent collision
      if (fs.existsSync(backupPath)) {
        return res.status(409).json({ error: 'Backup with this timestamp already exists.' });
      }

      // Query cases belonging strictly to authenticated tenant (or all if ADMIN)
      const casesQuery = req.user.role === 'ADMIN'
        ? db.prepare('SELECT * FROM cases').all()
        : db.prepare('SELECT * FROM cases WHERE owner_id = ?').all(req.user.userId);

      const caseIds = casesQuery.map((c) => c.case_id);
      let evidence = [];
      let evidenceFiles = [];
      let custody = [];
      let custodyCheckpoints = [];
      let timeline = [];
      let correlations = [];

      if (caseIds.length > 0) {
        const placeholders = caseIds.map(() => '?').join(',');
        evidence = db.prepare(`SELECT * FROM evidence_records WHERE case_id IN (${placeholders})`).all(...caseIds);

        const evidenceIds = evidence.map((e) => e.evidence_id);
        if (evidenceIds.length > 0) {
          const evPlaceholders = evidenceIds.map(() => '?').join(',');
          const rawFiles = db.prepare(`SELECT * FROM evidence_files WHERE evidence_id IN (${evPlaceholders})`).all(...evidenceIds);

          // Package encrypted binary payloads directly from disk without plaintext leaks
          evidenceFiles = rawFiles.map((f) => {
            let fileDataCiphertextBase64 = null;
            if (f.storage_path && fs.existsSync(f.storage_path)) {
              fileDataCiphertextBase64 = fs.readFileSync(f.storage_path).toString('base64');
            }
            return {
              ...f,
              fileDataCiphertextBase64,
            };
          });
        }

        custody = db.prepare(`SELECT * FROM chain_of_custody WHERE case_id IN (${placeholders}) ORDER BY rowid ASC`).all(...caseIds);
        custodyCheckpoints = db.prepare(`SELECT * FROM custody_checkpoints WHERE case_id IN (${placeholders})`).all(...caseIds);
        timeline = db.prepare(`SELECT * FROM timeline_events WHERE case_id IN (${placeholders})`).all(...caseIds);
        correlations = db.prepare(`SELECT * FROM incident_correlations WHERE case_id IN (${placeholders})`).all(...caseIds);
      }

      const dump = {
        meta: {
          version: '2.1.0-enterprise',
          createdUtc: new Date().toISOString(),
          ownerId: req.user.userId,
          casesCount: casesQuery.length,
          evidenceCount: evidence.length,
          filesCount: evidenceFiles.length,
          custodyCount: custody.length,
        },
        cases: casesQuery,
        evidence,
        evidence_files: evidenceFiles,
        custody,
        custody_checkpoints: custodyCheckpoints,
        timeline,
        correlations,
      };

      const dumpJson = JSON.stringify(dump, null, 2);

      // Authenticated AES-256-GCM Encryption (authenticated ciphertext envelope)
      const encryptedEnvelope = encryptBackup(dumpJson);
      fs.writeFileSync(backupPath, JSON.stringify(encryptedEnvelope, null, 2), { mode: 0o600 });

      res.json({
        success: true,
        backupFileName,
        sha256: encryptedEnvelope.sha256,
        cipher: encryptedEnvelope.cipher,
        createdUtc: encryptedEnvelope.createdUtc,
        casesCount: casesQuery.length,
        evidenceCount: evidence.length,
        filesCount: evidenceFiles.length,
        custodyCount: custody.length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Authenticated Transactional Backup Restoration Endpoint
  app.post('/api/backup/restore', requireAuth, (req, res) => {
    try {
      const { backupFileName, backupEnvelope } = req.body;
      let envelope = backupEnvelope;

      if (!envelope && backupFileName) {
        const backupDir = path.join(__dirname, 'backups');
        // Prevent path traversal on backup filename
        const safeName = path.basename(backupFileName);
        const backupPath = path.join(backupDir, safeName);
        if (!fs.existsSync(backupPath)) {
          return res.status(404).json({ error: `Backup file ${safeName} not found on disk.` });
        }
        envelope = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      }

      if (!envelope) {
        return res.status(400).json({ error: 'Either backupFileName or backupEnvelope object must be provided.' });
      }

      // Decrypt with AES-256-GCM authentication verification
      const restoredData = decryptBackup(envelope);

      if (!restoredData.cases || !Array.isArray(restoredData.cases)) {
        return res.status(400).json({ error: 'Corrupted backup: Missing cases array.' });
      }

      let restoredCases = 0;
      let restoredEvidence = 0;
      let restoredFiles = 0;
      let restoredCustody = 0;

      // Prepare temporary staging directory for restored files so failed restores leave ZERO orphan files on disk
      const stagingDir = path.join(VAULT_DIR, `.restore_staging_${crypto.randomUUID()}`);
      fs.mkdirSync(stagingDir, { recursive: true });
      const stagedFiles = [];

      // Execute restoration within a single ACID transaction
      db.exec('BEGIN IMMEDIATE;');
      try {
        // 1. Cross-tenant isolation verification:
        // Ensure no restored case hijacks or overwrites an existing case owned by another tenant
        for (const c of restoredData.cases) {
          const existing = db.prepare('SELECT owner_id FROM cases WHERE case_id = ?').get(c.case_id);
          if (existing && existing.owner_id && existing.owner_id !== req.user.userId && req.user.role !== 'ADMIN') {
            throw new Error(`Cannot restore case ${c.case_id}: belongs to another tenant (Unauthorized cross-tenant overwrite rejected).`);
          }
        }

        // 2. Restore cases (assign to authenticated tenant unless restoring as ADMIN)
        for (const c of restoredData.cases) {
          const targetOwner = req.user.role === 'ADMIN' ? (c.owner_id || req.user.userId) : req.user.userId;
          db.prepare(`
            INSERT INTO cases (case_id, owner_id, title, summary, status, preservation_locked, locked_at, locked_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(case_id) DO UPDATE SET
              owner_id = excluded.owner_id,
              title = excluded.title,
              summary = excluded.summary,
              status = excluded.status,
              preservation_locked = excluded.preservation_locked,
              locked_at = excluded.locked_at,
              locked_by = excluded.locked_by,
              updated_at = excluded.updated_at
          `).run(c.case_id, targetOwner, c.title, c.summary, c.status, c.preservation_locked || 0, c.locked_at || null, c.locked_by || null, c.created_at, c.updated_at);
          restoredCases++;
        }

        // 3. Restore evidence records
        if (restoredData.evidence && Array.isArray(restoredData.evidence)) {
          for (const e of restoredData.evidence) {
            db.prepare(`
              INSERT INTO evidence_records (
                evidence_id, case_id, original_filename, file_type, file_size,
                sha256_hash, source_url, submission_source, submission_method,
                capture_timestamp, upload_timestamp, classification, preservation_locked,
                active_version, integrity_status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(evidence_id) DO UPDATE SET
                original_filename = excluded.original_filename,
                file_type = excluded.file_type,
                file_size = excluded.file_size,
                sha256_hash = excluded.sha256_hash,
                active_version = excluded.active_version,
                preservation_locked = excluded.preservation_locked,
                integrity_status = excluded.integrity_status,
                updated_at = excluded.updated_at
            `).run(
              e.evidence_id, e.case_id, e.original_filename, e.file_type, e.file_size,
              e.sha256_hash, e.source_url, e.submission_source, e.submission_method,
              e.capture_timestamp, e.upload_timestamp, e.classification, e.preservation_locked || 0,
              e.active_version || 1, e.integrity_status || 'PENDING', e.created_at, e.updated_at
            );
            restoredEvidence++;
          }
        }

        // 4. Restore evidence files & disk vault storage (staged)
        if (restoredData.evidence_files && Array.isArray(restoredData.evidence_files)) {
          for (const ef of restoredData.evidence_files) {
            const fileName = `${ef.evidence_id}_v${ef.version_num}.enc`;
            const targetStoragePath = path.join(VAULT_DIR, fileName);
            const stagedFilePath = path.join(stagingDir, fileName);

            if (ef.fileDataCiphertextBase64) {
              const fileCiphertext = Buffer.from(ef.fileDataCiphertextBase64, 'base64');
              fs.writeFileSync(stagedFilePath, fileCiphertext);

              // Decrypt and verify hash against original sha256_hash
              const decrypted = decryptBuffer(fileCiphertext, ef.encryption_iv, ef.encryption_tag);
              const verifyHash = calculateSha256(decrypted);
              if (verifyHash !== ef.sha256_hash) {
                throw new Error(`Restoration Integrity Error: Hash mismatch for evidence file ${ef.file_id} (Expected ${ef.sha256_hash}, Got ${verifyHash})`);
              }
              stagedFiles.push({ stagedFilePath, targetStoragePath });
            }

            db.prepare(`
              INSERT INTO evidence_files (
                file_id, evidence_id, version_num, file_type, file_size,
                sha256_hash, storage_path, is_original, is_redacted, is_annotated,
                annotation_notes, encryption_iv, encryption_tag, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(evidence_id, version_num) DO UPDATE SET
                file_size = excluded.file_size,
                sha256_hash = excluded.sha256_hash,
                storage_path = excluded.storage_path,
                is_original = excluded.is_original,
                is_redacted = excluded.is_redacted,
                is_annotated = excluded.is_annotated,
                annotation_notes = excluded.annotation_notes,
                encryption_iv = excluded.encryption_iv,
                encryption_tag = excluded.encryption_tag
            `).run(
              ef.file_id, ef.evidence_id, ef.version_num, ef.file_type, ef.file_size,
              ef.sha256_hash, targetStoragePath, ef.is_original || 0, ef.is_redacted || 0,
              ef.is_annotated || 0, ef.annotation_notes || null, ef.encryption_iv,
              ef.encryption_tag, ef.created_at
            );
            restoredFiles++;
          }
        }

        // 5. Restore chain of custody events
        if (restoredData.custody && Array.isArray(restoredData.custody)) {
          for (const c of restoredData.custody) {
            db.prepare(`
              INSERT INTO chain_of_custody (
                event_id, evidence_id, case_id, actor, action, timestamp,
                event_metadata, previous_event_hash, current_event_hash
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(event_id) DO NOTHING
            `).run(
              c.event_id, c.evidence_id, c.case_id, c.actor, c.action, c.timestamp,
              c.event_metadata, c.previous_event_hash, c.current_event_hash
            );
            restoredCustody++;
          }
        }

        // 6. Restore custody checkpoints
        if (restoredData.custody_checkpoints && Array.isArray(restoredData.custody_checkpoints)) {
          for (const chk of restoredData.custody_checkpoints) {
            db.prepare(`
              INSERT INTO custody_checkpoints (
                checkpoint_id, case_id, head_event_hash, event_count,
                ed25519_public_key, ed25519_signature, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(checkpoint_id) DO NOTHING
            `).run(
              chk.checkpoint_id, chk.case_id, chk.head_event_hash, chk.event_count,
              chk.ed25519_public_key, chk.ed25519_signature, chk.created_at
            );
          }
        }

        // 7. Restore timeline events
        if (restoredData.timeline && Array.isArray(restoredData.timeline)) {
          for (const t of restoredData.timeline) {
            db.prepare(`
              INSERT INTO timeline_events (
                event_id, case_id, occurred_at, time_confidence, label,
                related_evidence_id, platform, sender_handle, blocked_prior, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(event_id) DO NOTHING
            `).run(
              t.event_id, t.case_id, t.occurred_at, t.time_confidence || 'confirmed',
              t.label, t.related_evidence_id || null, t.platform || null,
              t.sender_handle || null, t.blocked_prior || 0, t.created_at
            );
          }
        }

        // 8. Restore incident correlations
        if (restoredData.correlations && Array.isArray(restoredData.correlations)) {
          for (const r of restoredData.correlations) {
            db.prepare(`
              INSERT INTO incident_correlations (
                correlation_id, case_id, source_id, target_id, relation_type,
                confidence_level, explanation, supporting_evidence_ids, status,
                reviewed_by, reviewed_at, review_notes, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(correlation_id) DO NOTHING
            `).run(
              r.correlation_id, r.case_id, r.source_id, r.target_id, r.relation_type,
              r.confidence_level, r.explanation, r.supporting_evidence_ids || '[]',
              r.status || 'SUGGESTED', r.reviewed_by || null, r.reviewed_at || null,
              r.review_notes || null, r.created_at
            );
          }
        }

        // 9. Cryptographically verify chain of custody for all restored cases
        for (const c of restoredData.cases) {
          const chainVerification = verifyCaseAuditChain(c.case_id);
          if (!chainVerification.verified) {
            throw new Error(`Custody Chain Verification Failed during restore for Case ${c.case_id}: ${chainVerification.breakages?.[0]?.error || 'Chain corrupted or tampered'}`);
          }
        }

        db.exec('COMMIT;');

        // Transaction committed successfully: promote staged files to permanent vault storage
        for (const { stagedFilePath, targetStoragePath } of stagedFiles) {
          fs.copyFileSync(stagedFilePath, targetStoragePath);
        }
        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch {}
      } catch (err) {
        db.exec('ROLLBACK;');
        // Clean up temporary staging directory on rollback so zero orphan files remain
        try {
          if (fs.existsSync(stagingDir)) {
            fs.rmSync(stagingDir, { recursive: true, force: true });
          }
        } catch {}
        throw err;
      }

      res.json({
        success: true,
        message: 'Disaster recovery backup restored successfully with full transactional integrity and chain verification.',
        restored: {
          casesCount: restoredCases,
          evidenceCount: restoredEvidence,
          filesCount: restoredFiles,
          custodyCount: restoredCustody,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return app;
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const PORT = process.env.PORT || 4000;
  const app = createServer();
  app.listen(PORT, () => {
    console.log(`[VeraTrace Vault Server] Running on http://localhost:${PORT}`);
  });
}
