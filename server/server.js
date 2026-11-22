/**
 * VeraTrace — Backend REST API Server
 *
 * Implements:
 * 1. Evidence Ingestion & Vault Encryption (AES-256-GCM)
 * 2. Hash-Linked Tamper-Evident Chain of Custody
 * 3. 5-Tier Integrity & Credibility Assessment Engine
 * 4. Cross-Platform Multi-Signal Intelligence & Relationship Graph
 * 5. Preservation Lock & Disappearance Monitoring
 * 6. Trusted Contacts & Platform Reporting Tracker
 * 7. Backup & Recovery System
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
} from './vault.js';
import {
  recordCustodyEvent,
  verifyCaseAuditChain,
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
  });

  const db = getDatabase();

  // --- HEALTH CHECK ---
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'VeraTrace Evidence Vault & Intelligence Engine',
      version: '2.0.0-enterprise',
      vaultStorage: 'AES-256-GCM Encrypted',
      timestamp: new Date().toISOString(),
    });
  });

  // --- CASES API ---
  app.get('/api/cases', (req, res) => {
    const rows = db.prepare('SELECT * FROM cases ORDER BY updated_at DESC').all();
    res.json({ cases: rows });
  });

  app.post('/api/cases', (req, res) => {
    const { title, summary, caseId } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Case title is required' });
    }

    const newId = caseId || `case_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO cases (case_id, title, summary, status, preservation_locked, created_at, updated_at)
      VALUES (?, ?, ?, 'OPEN', 0, ?, ?)
    `);
    stmt.run(newId, title.trim(), (summary || '').trim(), now, now);

    recordCustodyEvent({
      caseId: newId,
      actor: req.headers['x-actor'] || 'User',
      action: 'CASE_CREATED',
      metadata: { title, summary },
    });

    const created = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(newId);
    res.status(201).json({ case: created });
  });

  app.get('/api/cases/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json({ case: c });
  });

  // Preservation Lock Activation / Deactivation
  app.patch('/api/cases/:id/preservation-lock', (req, res) => {
    const { locked, reason, lockedBy } = req.body;
    const caseId = req.params.id;

    const c = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(caseId);
    if (!c) return res.status(404).json({ error: 'Case not found' });

    const now = new Date().toISOString();
    const isLocked = locked ? 1 : 0;

    db.prepare(`
      UPDATE cases 
      SET preservation_locked = ?, locked_at = ?, locked_by = ?, updated_at = ?
      WHERE case_id = ?
    `).run(isLocked, isLocked ? now : null, isLocked ? (lockedBy || 'Authorized Investigator') : null, now, caseId);

    // Also update all evidence records in case
    db.prepare(`
      UPDATE evidence_records
      SET preservation_locked = ?, updated_at = ?
      WHERE case_id = ?
    `).run(isLocked, now, caseId);

    recordCustodyEvent({
      caseId,
      actor: lockedBy || 'Authorized Investigator',
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

  // --- EVIDENCE INGESTION & VAULT STORAGE ---
  app.post('/api/cases/:id/evidence', upload.single('file'), async (req, res) => {
    try {
      const caseId = req.params.id;
      const file = req.file;

      if (!file || !file.buffer) {
        return res.status(400).json({ error: 'Evidence file binary payload is required' });
      }

      const caseRecord = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(caseId);
      if (!caseRecord) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const evidenceId = req.body.evidenceId || `ev_${crypto.randomUUID()}`;
      const originalFilename = file.originalname || 'evidence_capture.png';
      const fileType = file.mimetype || 'application/octet-stream';
      const fileSize = file.buffer.length;
      const sha256 = calculateSha256(file.buffer);

      const submissionSource = req.body.submissionSource || (req.body.isExtensionCapture ? 'EXTENSION_CAPTURE' : 'USER_SUBMITTED');
      const submissionMethod = req.body.submissionMethod || 'BROWSER_INTAKE';
      const captureTimestamp = req.body.captureTimestamp || null;
      const sourceUrl = req.body.sourceUrl || null;
      const now = new Date().toISOString();

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
        originalFilename,
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
        actor: req.headers['x-actor'] || (submissionSource === 'EXTENSION_CAPTURE' ? 'Chrome Extension MV3' : 'User'),
        action: CUSTODY_ACTIONS.EVIDENCE_UPLOADED,
        metadata: {
          originalFilename,
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
      console.error('Evidence upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cases/:id/evidence', (req, res) => {
    const caseId = req.params.id;
    const records = db.prepare('SELECT * FROM evidence_records WHERE case_id = ? ORDER BY created_at DESC').all(caseId);

    // Join active versions and assessments
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

  // Decrypt and stream an evidence file (by evidenceId and optional version)
  app.get('/api/evidence/:id/file', async (req, res) => {
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
      const master = db.prepare('SELECT case_id FROM evidence_records WHERE evidence_id = ?').get(evidenceId);
      if (master) {
        recordCustodyEvent({
          caseId: master.case_id,
          evidenceId,
          actor: req.headers['x-actor'] || 'User',
          action: CUSTODY_ACTIONS.EVIDENCE_ACCESSED,
          metadata: { versionNum, sha256: fileRecord.sha256_hash },
        });
      }

      res.setHeader('Content-Type', fileRecord.file_type || 'application/octet-stream');
      res.setHeader('X-VeraTrace-Hash', fileRecord.sha256_hash);
      res.setHeader('X-VeraTrace-Version', versionNum);
      res.send(decrypted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Redact or Annotate Evidence (Creates a new Working Version, Original stays untouched)
  app.post('/api/evidence/:id/versions', upload.single('file'), async (req, res) => {
    try {
      const evidenceId = req.params.id;
      const file = req.file;
      const { isRedacted, isAnnotated, notes } = req.body;

      if (!file || !file.buffer) {
        return res.status(400).json({ error: 'Working copy file payload is required' });
      }

      const master = db.prepare('SELECT * FROM evidence_records WHERE evidence_id = ?').get(evidenceId);
      if (!master) return res.status(404).json({ error: 'Evidence record not found' });

      // Determine next version number
      const maxVersionRow = db.prepare('SELECT MAX(version_num) as max_v FROM evidence_files WHERE evidence_id = ?').get(evidenceId);
      const nextVersion = (maxVersionRow?.max_v || 1) + 1;

      const fileVersion = await storeVaultFile({
        evidenceId,
        versionNum: nextVersion,
        buffer: file.buffer,
        fileType: file.mimetype || master.file_type,
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
        actor: req.headers['x-actor'] || 'User',
        action: isRedacted ? CUSTODY_ACTIONS.EVIDENCE_REDACTED : CUSTODY_ACTIONS.EVIDENCE_ANNOTATED,
        metadata: {
          newVersionNum: nextVersion,
          notes,
          newHash: fileVersion.sha256Hash,
        },
      });

      res.status(201).json({ success: true, version: fileVersion });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Deletion Request (Enforces Preservation Lock)
  app.delete('/api/evidence/:id', (req, res) => {
    const evidenceId = req.params.id;
    const record = db.prepare('SELECT * FROM evidence_records WHERE evidence_id = ?').get(evidenceId);
    if (!record) return res.status(404).json({ error: 'Evidence record not found' });

    const caseRecord = db.prepare('SELECT * FROM cases WHERE case_id = ?').get(record.case_id);

    // Enforce Preservation Lock!
    if (record.preservation_locked === 1 || caseRecord?.preservation_locked === 1) {
      recordCustodyEvent({
        caseId: record.case_id,
        evidenceId,
        actor: req.headers['x-actor'] || 'User',
        action: CUSTODY_ACTIONS.DELETION_REQUESTED_REJECTED,
        metadata: { reason: 'Evidence Preservation Lock is active. Deletion is prohibited by legal hold.' },
      });

      return res.status(403).json({
        error: 'Deletion Prohibited: Evidence Preservation Lock is active on this case. Original evidence cannot be deleted.',
      });
    }

    db.prepare('DELETE FROM evidence_records WHERE evidence_id = ?').run(evidenceId);

    recordCustodyEvent({
      caseId: record.case_id,
      evidenceId,
      actor: req.headers['x-actor'] || 'User',
      action: 'EVIDENCE_DELETED',
      metadata: { originalFilename: record.original_filename },
    });

    res.json({ success: true, message: 'Evidence record removed.' });
  });

  // --- CHAIN OF CUSTODY API ---
  app.get('/api/cases/:id/chain-of-custody', (req, res) => {
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

  app.post('/api/cases/:id/chain-of-custody/verify', (req, res) => {
    const caseId = req.params.id;
    const verification = verifyCaseAuditChain(caseId);
    res.json(verification);
  });

  // --- INTEGRITY ASSESSMENT API ---
  app.get('/api/cases/:id/integrity-assessment', (req, res) => {
    const caseId = req.params.id;
    const records = db.prepare('SELECT evidence_id FROM evidence_records WHERE case_id = ?').all(caseId);
    const assessments = records.map((r) => assessEvidenceIntegrity(r.evidence_id));
    res.json({ caseId, assessments });
  });

  app.post('/api/evidence/:id/assess', (req, res) => {
    try {
      const assessment = assessEvidenceIntegrity(req.params.id);
      res.json(assessment);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- CROSS-PLATFORM INTELLIGENCE API ---
  app.get('/api/cases/:id/intelligence', (req, res) => {
    try {
      const intelligence = analyzeCaseIntelligence(req.params.id);
      res.json(intelligence);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cases/:id/correlations/:corrId/review', (req, res) => {
    const { status, reviewedBy, notes } = req.body;
    const result = recordCorrelationReview({
      correlationId: req.params.corrId,
      status,
      reviewedBy: reviewedBy || 'Investigator',
      reviewNotes: notes,
    });
    res.json(result);
  });

  // --- DISAPPEARANCE & DELETION MONITORING ---
  app.post('/api/cases/:id/disappearance-report', (req, res) => {
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
      actor: req.headers['x-actor'] || 'Victim',
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

  app.get('/api/cases/:id/disappearance-reports', (req, res) => {
    const reports = db.prepare('SELECT * FROM disappearance_reports WHERE case_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ reports });
  });

  // --- TRUSTED CONTACTS & PLATFORM REPORTING TRACKER ---
  app.get('/api/cases/:id/safety', (req, res) => {
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

  app.post('/api/cases/:id/trusted-contacts', (req, res) => {
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
      actor: 'User',
      action: 'TRUSTED_CONTACT_ADDED',
      metadata: { contactName: name, contactEmail: email, accessLevel },
    });

    res.status(201).json({ success: true, contactId, revocableKey: token });
  });

  app.post('/api/cases/:id/platform-reports', (req, res) => {
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

  // --- BACKUP & RECOVERY API ---
  app.post('/api/backup', (req, res) => {
    try {
      const backupDir = path.join(__dirname, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `veratrace_backup_${timestamp}.json`;
      const backupPath = path.join(backupDir, backupFileName);

      const cases = db.prepare('SELECT * FROM cases').all();
      const evidence = db.prepare('SELECT * FROM evidence_records').all();
      const custody = db.prepare('SELECT * FROM chain_of_custody').all();
      const timeline = db.prepare('SELECT * FROM timeline_events').all();
      const correlations = db.prepare('SELECT * FROM incident_correlations').all();

      const dump = {
        meta: {
          version: '2.0.0-enterprise',
          createdUtc: new Date().toISOString(),
          casesCount: cases.length,
          evidenceCount: evidence.length,
        },
        cases,
        evidence,
        custody,
        timeline,
        correlations,
      };

      const dumpJson = JSON.stringify(dump, null, 2);
      const sha256 = calculateSha256(Buffer.from(dumpJson));

      fs.writeFileSync(backupPath, dumpJson);

      res.json({
        success: true,
        backupFileName,
        sha256,
        size: dumpJson.length,
        createdUtc: dump.meta.createdUtc,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
