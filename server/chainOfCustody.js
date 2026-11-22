/**
 * VeraTrace — Tamper-Evident Hash-Linked Chain of Custody
 *
 * Implements a verifiable, append-only cryptographic audit ledger.
 * Every audit log entry links cryptographically to the preceding entry's hash.
 * Any modification or truncation in the log is instantly detectable upon verification.
 */

import crypto from 'node:crypto';
import { getDatabase } from './db.js';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export const CUSTODY_ACTIONS = Object.freeze({
  EVIDENCE_CAPTURED: 'EVIDENCE_CAPTURED',
  EVIDENCE_UPLOADED: 'EVIDENCE_UPLOADED',
  HASH_GENERATED: 'HASH_GENERATED',
  EVIDENCE_ACCESSED: 'EVIDENCE_ACCESSED',
  EVIDENCE_DOWNLOADED: 'EVIDENCE_DOWNLOADED',
  EVIDENCE_EXPORTED: 'EVIDENCE_EXPORTED',
  EVIDENCE_ANNOTATED: 'EVIDENCE_ANNOTATED',
  EVIDENCE_REDACTED: 'EVIDENCE_REDACTED',
  EVIDENCE_VERSION_CREATED: 'EVIDENCE_VERSION_CREATED',
  PRESERVATION_LOCK_ACTIVATED: 'PRESERVATION_LOCK_ACTIVATED',
  PRESERVATION_LOCK_DEACTIVATED: 'PRESERVATION_LOCK_DEACTIVATED',
  INTEGRITY_ASSESSMENT_RUN: 'INTEGRITY_ASSESSMENT_RUN',
  DELETION_REQUESTED_REJECTED: 'DELETION_REQUESTED_REJECTED',
  DISAPPEARANCE_REPORT_LOGGED: 'DISAPPEARANCE_REPORT_LOGGED',
  BACKUP_CREATED: 'BACKUP_CREATED',
});

/**
 * Computes deterministic SHA-256 hash for a chain-of-custody node.
 */
export function computeNodeHash({ eventId, evidenceId, caseId, actor, action, timestamp, eventMetadata, previousEventHash }) {
  const payload = [
    eventId,
    evidenceId || '',
    caseId,
    actor,
    action,
    timestamp,
    typeof eventMetadata === 'string' ? eventMetadata : JSON.stringify(eventMetadata),
    previousEventHash,
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Appends a verified event to the case's chain of custody.
 */
export function recordCustodyEvent({ caseId, evidenceId = null, actor = 'System', action, metadata = {} }) {
  const db = getDatabase();

  // Find previous event for this case
  const prevStmt = db.prepare(`
    SELECT current_event_hash 
    FROM chain_of_custody 
    WHERE case_id = ? 
    ORDER BY rowid DESC 
    LIMIT 1
  `);
  const prevRow = prevStmt.get(caseId);
  const previousEventHash = prevRow ? prevRow.current_event_hash : GENESIS_HASH;

  const eventId = `custody_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const eventMetadataStr = JSON.stringify(metadata);

  const currentEventHash = computeNodeHash({
    eventId,
    evidenceId,
    caseId,
    actor,
    action,
    timestamp,
    eventMetadata: eventMetadataStr,
    previousEventHash,
  });

  const insertStmt = db.prepare(`
    INSERT INTO chain_of_custody (
      event_id, evidence_id, case_id, actor, action,
      timestamp, event_metadata, previous_event_hash, current_event_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    eventId,
    evidenceId,
    caseId,
    actor,
    action,
    timestamp,
    eventMetadataStr,
    previousEventHash,
    currentEventHash
  );

  return {
    eventId,
    evidenceId,
    caseId,
    actor,
    action,
    timestamp,
    eventMetadata: metadata,
    previousEventHash,
    currentEventHash,
  };
}

/**
 * Verifies the mathematical integrity of the entire audit chain for a case.
 */
export function verifyCaseAuditChain(caseId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM chain_of_custody 
    WHERE case_id = ? 
    ORDER BY rowid ASC
  `);
  const rows = stmt.all(caseId);

  if (rows.length === 0) {
    return {
      verified: true,
      count: 0,
      message: 'No audit records for this case yet.',
      breakages: [],
    };
  }

  let expectedPrevHash = GENESIS_HASH;
  const breakages = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check link to previous
    if (row.previous_event_hash !== expectedPrevHash) {
      breakages.push({
        index: i,
        eventId: row.event_id,
        error: `Broken linkage: expected previous hash ${expectedPrevHash}, found ${row.previous_event_hash}`,
      });
    }

    // Check node hash computation
    const computedCurrentHash = computeNodeHash({
      eventId: row.event_id,
      evidenceId: row.evidence_id,
      caseId: row.case_id,
      actor: row.actor,
      action: row.action,
      timestamp: row.timestamp,
      eventMetadata: row.event_metadata,
      previousEventHash: row.previous_event_hash,
    });

    if (computedCurrentHash !== row.current_event_hash) {
      breakages.push({
        index: i,
        eventId: row.event_id,
        error: `Payload tampering: stored current hash ${row.current_event_hash} does not match computed ${computedCurrentHash}`,
      });
    }

    expectedPrevHash = row.current_event_hash;
  }

  return {
    verified: breakages.length === 0,
    count: rows.length,
    latestHash: expectedPrevHash,
    breakages,
    verifiedAtUtc: new Date().toISOString(),
  };
}
