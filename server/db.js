/**
 * VeraTrace — Backend Database Engine (node:sqlite)
 * Provides ACID-compliant, persistent relational storage for cases,
 * evidence records, audit trails, and intelligence links.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'veratrace.db');
let dbInstance = null;

export function getDatabase() {
  if (dbInstance) return dbInstance;

  dbInstance = new DatabaseSync(DB_PATH);
  try {
    dbInstance.exec('PRAGMA busy_timeout = 10000;');
  } catch {}
  try {
    dbInstance.exec('PRAGMA foreign_keys = ON;');
  } catch {}
  try {
    dbInstance.exec('PRAGMA journal_mode = WAL;');
  } catch {}

  initSchema(dbInstance);
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    -- Users & Authentication Table
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER', -- USER, INVESTIGATOR, ADMIN
      created_at TEXT NOT NULL
    );

    -- Cases Table
    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      preservation_locked INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      locked_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Evidence Records Table (Master Metadata)
    CREATE TABLE IF NOT EXISTS evidence_records (
      evidence_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256_hash TEXT NOT NULL,
      source_url TEXT,
      platform TEXT,
      sender_handle TEXT,
      notes TEXT,
      submission_source TEXT NOT NULL DEFAULT 'USER_SUBMITTED', -- USER_SUBMITTED, EXTENSION_CAPTURE, API
      submission_method TEXT NOT NULL DEFAULT 'MANUAL_DROPZONE',
      capture_timestamp TEXT,
      upload_timestamp TEXT NOT NULL,
      classification TEXT NOT NULL DEFAULT 'USER_SUBMITTED', -- CAPTURED, USER_SUBMITTED, INTEGRITY_VERIFIED, REVIEW_REQUIRED, INTEGRITY_COMPROMISED
      preservation_locked INTEGER NOT NULL DEFAULT 0,
      active_version INTEGER NOT NULL DEFAULT 1,
      integrity_status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Evidence Files Table (Versioned Working & Original Blobs)
    CREATE TABLE IF NOT EXISTS evidence_files (
      file_id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES evidence_records(evidence_id) ON DELETE CASCADE,
      version_num INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256_hash TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      is_original INTEGER NOT NULL DEFAULT 0,
      is_redacted INTEGER NOT NULL DEFAULT 0,
      is_annotated INTEGER NOT NULL DEFAULT 0,
      annotation_notes TEXT,
      encryption_iv TEXT NOT NULL,
      encryption_tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(evidence_id, version_num)
    );

    -- Hash-Linked Tamper-Evident Chain of Custody Table
    CREATE TABLE IF NOT EXISTS chain_of_custody (
      event_id TEXT PRIMARY KEY,
      evidence_id TEXT REFERENCES evidence_records(evidence_id) ON DELETE SET NULL,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      event_metadata TEXT NOT NULL, -- JSON string
      previous_event_hash TEXT NOT NULL,
      current_event_hash TEXT NOT NULL
    );

    -- Timeline Events Table
    CREATE TABLE IF NOT EXISTS timeline_events (
      event_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      occurred_at TEXT,
      time_confidence TEXT NOT NULL DEFAULT 'confirmed', -- confirmed, uncertain
      label TEXT NOT NULL,
      related_evidence_id TEXT REFERENCES evidence_records(evidence_id) ON DELETE SET NULL,
      platform TEXT,
      sender_handle TEXT,
      blocked_prior INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Cross-Platform Intelligence Correlations Table
    CREATE TABLE IF NOT EXISTS incident_correlations (
      correlation_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL, -- ACCOUNT_LINK, SHARED_IDENTIFIER, TEMPORAL_ESCALATION, MEDIA_HASH_MATCH, CONTENT_REF
      confidence_level TEXT NOT NULL, -- FACTUAL_OBSERVATION, STRONG_IDENTIFIER_MATCH, PROBABLE_CLUE, POSSIBLE_COINCIDENCE, BEHAVIORAL_BYPASS
      explanation TEXT NOT NULL,
      supporting_evidence_ids TEXT NOT NULL, -- JSON array
      status TEXT NOT NULL DEFAULT 'SUGGESTED', -- SUGGESTED, VERIFIED_RELATIONSHIP, POSSIBLE_RELATIONSHIP, INSUFFICIENT_EVIDENCE, REQUIRES_HUMAN_REVIEW, DISMISSED
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      created_at TEXT NOT NULL
    );

    -- Integrity & Credibility Assessments Table
    CREATE TABLE IF NOT EXISTS integrity_assessments (
      assessment_id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence_records(evidence_id) ON DELETE CASCADE,
      sha256_verified INTEGER NOT NULL DEFAULT 1,
      metadata_analysis TEXT NOT NULL, -- JSON
      contextual_analysis TEXT NOT NULL, -- JSON
      classification TEXT NOT NULL,
      flags TEXT NOT NULL, -- JSON array
      recommended_steps TEXT NOT NULL, -- JSON array
      reviewer_findings TEXT,
      reviewed_by TEXT,
      evaluated_at TEXT NOT NULL
    );

    -- Disappearance & Deletion Monitoring Table
    CREATE TABLE IF NOT EXISTS disappearance_reports (
      report_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL REFERENCES evidence_records(evidence_id) ON DELETE CASCADE,
      reported_at TEXT NOT NULL,
      victim_statement TEXT NOT NULL,
      external_url TEXT,
      verified_status TEXT NOT NULL DEFAULT 'USER_REPORTED', -- USER_REPORTED, INDEPENDENTLY_VERIFIED, UNCONFIRMED
      verification_notes TEXT,
      created_at TEXT NOT NULL
    );

    -- Trusted Contacts Table
    CREATE TABLE IF NOT EXISTS trusted_contacts (
      contact_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      contact_name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT,
      access_level TEXT NOT NULL DEFAULT 'EMERGENCY_SUMMARY_ONLY', -- EMERGENCY_SUMMARY_ONLY, REVIEW_ONLY, FULL_EXPORT
      is_active INTEGER NOT NULL DEFAULT 1,
      revocable_key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Platform Reporting Tracker Table
    CREATE TABLE IF NOT EXISTS platform_reports (
      report_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      report_date TEXT NOT NULL,
      reference_number TEXT NOT NULL,
      incident_summary TEXT,
      outcome_status TEXT NOT NULL DEFAULT 'PENDING_ACKNOWLEDGEMENT', -- PENDING_ACKNOWLEDGEMENT, UNDER_INVESTIGATION, ACTION_TAKEN, CLOSED_NO_ACTION
      acknowledgement_notes TEXT,
      created_at TEXT NOT NULL
    );

    -- Ed25519-Signed Custody Checkpoints Table
    CREATE TABLE IF NOT EXISTS custody_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      head_event_hash TEXT NOT NULL,
      event_count INTEGER NOT NULL,
      ed25519_public_key TEXT NOT NULL,
      ed25519_signature TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Scoped Extension Credentials Table
    CREATE TABLE IF NOT EXISTS extension_credentials (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Revoked Tokens Blacklist Table (Session Logout / Invalidation)
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      token_id TEXT PRIMARY KEY,
      revoked_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    -- Disaster Recovery Restore Journal (Crash-Safe Staging & Atomic Promotion)
    CREATE TABLE IF NOT EXISTS pending_restores (
      restore_id TEXT PRIMARY KEY,
      staging_dir TEXT NOT NULL,
      status TEXT NOT NULL, -- PENDING_PROMOTION, COMPLETED, FAILED
      created_at TEXT NOT NULL
    );

    -- Password Reset Tokens Table (Zero Enumeration, Single-Use, Short Expiry)
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      reset_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens(token_hash);

    -- Short-lived, Single-Use Extension Pairing Tokens
    CREATE TABLE IF NOT EXISTS extension_pairing_tokens (
      pairing_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      device_name TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pairing_token_hash ON extension_pairing_tokens(token_hash);
  `);

  // Ensure owner_id column exists in pre-existing cases table
  try {
    const pragmaCases = db.prepare(`PRAGMA table_info(cases)`).all();
    if (pragmaCases && !pragmaCases.some((c) => c.name === 'owner_id')) {
      db.exec(`ALTER TABLE cases ADD COLUMN owner_id TEXT REFERENCES users(user_id) ON DELETE SET NULL;`);
    }
  } catch (err) {
    // Column might already exist
  }

  // Ensure password_changed_at and session_epoch columns exist in users table for session invalidation
  try {
    const pragmaUsers = db.prepare(`PRAGMA table_info(users)`).all();
    if (pragmaUsers && !pragmaUsers.some((c) => c.name === 'password_changed_at')) {
      db.exec(`ALTER TABLE users ADD COLUMN password_changed_at TEXT;`);
    }
    if (pragmaUsers && !pragmaUsers.some((c) => c.name === 'session_epoch')) {
      db.exec(`ALTER TABLE users ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 1;`);
    }
  } catch (err) {
    // Column might already exist
  }

  // Ensure platform, sender_handle, and notes columns exist in evidence_records table
  try {
    const pragmaEvidence = db.prepare(`PRAGMA table_info(evidence_records)`).all();
    if (pragmaEvidence && !pragmaEvidence.some((c) => c.name === 'platform')) {
      db.exec(`ALTER TABLE evidence_records ADD COLUMN platform TEXT;`);
    }
    if (pragmaEvidence && !pragmaEvidence.some((c) => c.name === 'sender_handle')) {
      db.exec(`ALTER TABLE evidence_records ADD COLUMN sender_handle TEXT;`);
    }
    if (pragmaEvidence && !pragmaEvidence.some((c) => c.name === 'notes')) {
      db.exec(`ALTER TABLE evidence_records ADD COLUMN notes TEXT;`);
    }
  } catch (err) {
    // Column might already exist
  }
}
