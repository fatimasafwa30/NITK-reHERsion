/**
 * VeraTrace — Tamper-Evident Hash-Linked Chain of Custody
 *
 * Implements a verifiable, append-only cryptographic audit ledger.
 * Every audit log entry links cryptographically to the preceding entry's hash.
 * Any modification or truncation in the log is instantly detectable upon verification.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './db.js';
import { secureKeyFilePermissions } from './vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const PRIV_KEY_FILE = path.join(DATA_DIR, '.custody_ed25519.key');
const PUB_KEY_FILE = path.join(DATA_DIR, '.custody_ed25519.pub');

let ED25519_KEYPAIR = null;

export function getEd25519KeyPair() {
  if (ED25519_KEYPAIR) return ED25519_KEYPAIR;

  if (fs.existsSync(PRIV_KEY_FILE) && fs.existsSync(PUB_KEY_FILE)) {
    const privPem = fs.readFileSync(PRIV_KEY_FILE, 'utf8');
    const pubPem = fs.readFileSync(PUB_KEY_FILE, 'utf8');
    const privateKey = crypto.createPrivateKey(privPem);
    const publicKey = crypto.createPublicKey(pubPem);
    ED25519_KEYPAIR = { privateKey, publicKey, publicKeyPem: pubPem };
    return ED25519_KEYPAIR;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PRIV_KEY_FILE, privPem, { mode: 0o600 });
  secureKeyFilePermissions(PRIV_KEY_FILE);
  fs.writeFileSync(PUB_KEY_FILE, pubPem, { mode: 0o644 });

  ED25519_KEYPAIR = { privateKey, publicKey, publicKeyPem: pubPem };
  return ED25519_KEYPAIR;
}

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
      valid: true,
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
    valid: breakages.length === 0,
    count: rows.length,
    latestHash: expectedPrevHash,
    breakages,
    verifiedAtUtc: new Date().toISOString(),
  };
}

/**
 * Creates and signs an Ed25519 cryptographic checkpoint of the current chain head.
 * This establishes an external anchor that prevents an attacker with database write
 * access from rewriting history and sequentially recalculating hashes undetected.
 */
export function createCustodyCheckpoint(caseId) {
  const db = getDatabase();
  const { privateKey, publicKeyPem } = getEd25519KeyPair();

  // 1. Get latest chain node and event count for this case
  const headRow = db.prepare(`
    SELECT current_event_hash 
    FROM chain_of_custody 
    WHERE case_id = ? 
    ORDER BY rowid DESC 
    LIMIT 1
  `).get(caseId);

  const countRow = db.prepare(`
    SELECT COUNT(*) as cnt 
    FROM chain_of_custody 
    WHERE case_id = ?
  `).get(caseId);

  const headEventHash = headRow ? headRow.current_event_hash : GENESIS_HASH;
  const eventCount = countRow ? countRow.cnt : 0;
  const checkpointId = `chk_${crypto.randomUUID()}`;
  const timestampUtc = new Date().toISOString();

  // Canonical checkpoint message to sign
  const message = `checkpoint|${checkpointId}|${caseId}|${headEventHash}|${eventCount}|${timestampUtc}`;
  const signature = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey);
  const signatureHex = signature.toString('hex');

  db.prepare(`
    INSERT INTO custody_checkpoints (
      checkpoint_id, case_id, head_event_hash, event_count,
      ed25519_public_key, ed25519_signature, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    checkpointId,
    caseId,
    headEventHash,
    eventCount,
    publicKeyPem,
    signatureHex,
    timestampUtc
  );

  return {
    checkpointId,
    caseId,
    headEventHash,
    eventCount,
    ed25519PublicKey: publicKeyPem,
    ed25519Signature: signatureHex,
    timestampUtc,
    epistemicScope: 'Cryptographically binds the ledger head to an Ed25519 keypair separate from SQLite database tables. Protects against post-hoc historical rewriting; does not protect if the private key itself is compromised.',
  };
}

/**
 * Computes deterministic SHA-256 fingerprint of an Ed25519 public key PEM.
 */
export function computeKeyFingerprint(publicKeyPem) {
  if (!publicKeyPem) return null;
  return crypto.createHash('sha256').update(publicKeyPem.trim()).digest('hex');
}

/**
 * Verifies an Ed25519-signed custody checkpoint against a TRUSTED public key or pinned fingerprint.
 * Prevents Public Key Substitution attacks by refusing to trust keys embedded in unverified checkpoints.
 *
 * @param {object} checkpoint - Checkpoint object
 * @param {boolean} verifyAgainstDatabase - Check if SQLite chain matches checkpoint
 * @param {object|string} trustedKeyOptions - Trusted PEM string or options object { trustedPublicKeyPem, trustedFingerprints, allowUntrusted }
 */
export function verifyCustodyCheckpoint(checkpoint, verifyAgainstDatabase = true, trustedKeyOptions = null) {
  if (!checkpoint || (!checkpoint.checkpoint_id && !checkpoint.checkpointId)) {
    throw new Error('Invalid checkpoint record.');
  }

  const id = checkpoint.checkpoint_id || checkpoint.checkpointId;
  const cId = checkpoint.case_id || checkpoint.caseId;
  const headHash = checkpoint.head_event_hash || checkpoint.headEventHash;
  const count = checkpoint.event_count !== undefined ? checkpoint.event_count : checkpoint.eventCount;
  const ts = checkpoint.created_at || checkpoint.timestampUtc;
  const pubPem = checkpoint.ed25519_public_key || checkpoint.ed25519PublicKey;
  const sigHex = checkpoint.ed25519_signature || checkpoint.ed25519Signature;

  if (!pubPem || !sigHex) {
    throw new Error('Checkpoint is missing public key or cryptographic signature.');
  }

  // Determine trusted keys and fingerprints
  let trustedPem = null;
  let trustedFingerprints = [];
  let allowUntrusted = false;

  if (typeof trustedKeyOptions === 'string') {
    trustedPem = trustedKeyOptions;
  } else if (trustedKeyOptions && typeof trustedKeyOptions === 'object') {
    trustedPem = trustedKeyOptions.trustedPublicKeyPem || null;
    trustedFingerprints = trustedKeyOptions.trustedFingerprints || [];
    allowUntrusted = Boolean(trustedKeyOptions.allowUntrusted);
  }

  // If no trusted key specified, default to the official local VeraTrace custody public key
  if (!trustedPem && trustedFingerprints.length === 0) {
    try {
      const defaultPair = getEd25519KeyPair();
      trustedPem = defaultPair.publicKeyPem;
    } catch {
      // Keypair not yet generated
    }
  }

  const checkpointKeyFingerprint = computeKeyFingerprint(pubPem);
  let keyTrusted = false;
  let untrustedKeyWarning = null;

  if (trustedPem && pubPem.trim() === trustedPem.trim()) {
    keyTrusted = true;
  } else if (trustedFingerprints.length > 0 && trustedFingerprints.includes(checkpointKeyFingerprint)) {
    keyTrusted = true;
  } else if (allowUntrusted) {
    keyTrusted = false;
    untrustedKeyWarning = 'WARNING: Public key is untrusted but explicitly permitted by allowUntrusted flag.';
  } else {
    keyTrusted = false;
    untrustedKeyWarning = 'CRITICAL SECURITY ALERT: Checkpoint public key is UNTRUSTED or substituted! The key does not match the server authority or pinned fingerprint list. Verification rejected.';
  }

  const message = `checkpoint|${id}|${cId}|${headHash}|${count}|${ts}`;
  const sigBuffer = Buffer.from(sigHex, 'hex');

  let signatureValid = false;
  try {
    const publicKey = crypto.createPublicKey(pubPem);
    signatureValid = crypto.verify(null, Buffer.from(message, 'utf8'), publicKey, sigBuffer);
  } catch (err) {
    signatureValid = false;
  }

  let databaseChainMatches = true;
  let databaseMismatchReason = null;

  if (verifyAgainstDatabase && signatureValid && keyTrusted) {
    const db = getDatabase();
    // Verify that the event at that point in the database still has the same hash
    const rows = db.prepare(`
      SELECT current_event_hash 
      FROM chain_of_custody 
      WHERE case_id = ? 
      ORDER BY rowid ASC
    `).all(cId);

    if (rows.length < count) {
      databaseChainMatches = false;
      databaseMismatchReason = `Database has fewer events (${rows.length}) than checkpoint recorded (${count}). Chain truncation detected.`;
    } else if (count === 0) {
      if (headHash !== GENESIS_HASH) {
        databaseChainMatches = false;
        databaseMismatchReason = `Expected genesis hash for empty ledger, found ${headHash}.`;
      }
    } else {
      const recordedAtPoint = rows[count - 1]?.current_event_hash;
      if (recordedAtPoint !== headHash) {
        databaseChainMatches = false;
        databaseMismatchReason = `Hash rewrite detected: Checkpoint signed head ${headHash}, but database state at index ${count - 1} has ${recordedAtPoint}.`;
      }
    }
  }

  const overallVerified = signatureValid && keyTrusted && (!verifyAgainstDatabase || databaseChainMatches);

  return {
    verified: overallVerified,
    signatureValid,
    keyTrusted,
    keyFingerprint: checkpointKeyFingerprint,
    untrustedKeyWarning,
    databaseChainMatches: keyTrusted ? databaseChainMatches : false,
    databaseMismatchReason,
    checkpointId: id,
    caseId: cId,
    verifiedAtUtc: new Date().toISOString(),
  };
}

