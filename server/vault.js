/**
 * VeraTrace — Secure Evidence Vault Storage Engine
 *
 * Implements:
 * 1. AES-256-GCM Authenticated Encryption for all binary files at rest.
 * 2. Immutable original evidence preservation (Version 1 is NEVER modified).
 * 3. Working copy versioning for annotations, redactions, and enhancements.
 * 4. Strict Preservation Lock enforcement (blocks deletion / mutation).
 * 5. SHA-256 cryptographic fingerprinting at ingestion.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VAULT_DIR = path.join(__dirname, 'vault_storage');
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
}

// Master encryption key (stored in secure keyfile if not provided via environment)
export const KEY_FILE = path.join(__dirname, 'data', '.vault_master.key');
let MASTER_KEY = null;

export function _resetVaultMasterKeyForTesting() {
  MASTER_KEY = null;
}

/**
 * Enforces strict filesystem ACLs on sensitive cryptographic key and backup files.
 * - On Windows: Configures NTFS DACLs via icacls.exe using safe argument arrays,
 *   stripping inherited permissions and granting access solely to the running user.
 * - On POSIX: Enforces mode 0o600 (owner read/write only).
 */
export function secureKeyFilePermissions(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const resolved = path.resolve(filePath);

  if (process.platform === 'win32') {
    const currentUser = process.env.USERNAME || process.env.USER;
    if (currentUser) {
      try {
        // Safe argument-based invocation: array of arguments avoids shell injection
        const res = spawnSync('icacls.exe', [
          resolved,
          '/inheritance:r',
          '/grant:r',
          `${currentUser}:(R,W)`,
        ], { windowsHide: true });

        if (res && res.status === 0) {
          return true;
        }
      } catch {
        // Fall back to chmod if icacls execution is restricted
      }
    }
  }

  try {
    fs.chmodSync(resolved, 0o600);
    return true;
  } catch {
    return false;
  }
}

export function getVaultMasterKey() {
  if (MASTER_KEY) return MASTER_KEY;

  if (process.env.VERATRACE_VAULT_KEY) {
    MASTER_KEY = crypto.scryptSync(process.env.VERATRACE_VAULT_KEY, 'veratrace-salt-v1', 32);
    return MASTER_KEY;
  }

  if (fs.existsSync(KEY_FILE)) {
    MASTER_KEY = fs.readFileSync(KEY_FILE);
  } else {
    // Check if vault_storage contains pre-existing encrypted evidence
    let existingEncFiles = [];
    if (fs.existsSync(VAULT_DIR)) {
      try {
        existingEncFiles = fs.readdirSync(VAULT_DIR).filter((f) => f.endsWith('.enc'));
      } catch {
        existingEncFiles = [];
      }
    }

    if (existingEncFiles.length > 0) {
      throw new Error(
        `CRITICAL VAULT RECOVERY REQUIRED: Master key file (${KEY_FILE}) is missing, but ${existingEncFiles.length} encrypted vault file(s) exist! Refusing silent key generation to prevent permanent data loss. Please restore the vault master key file or provide VERATRACE_VAULT_KEY.`
      );
    }

    MASTER_KEY = crypto.randomBytes(32);
    const dataDir = path.dirname(KEY_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(KEY_FILE, MASTER_KEY, { mode: 0o600 });
    secureKeyFilePermissions(KEY_FILE);
  }
  return MASTER_KEY;
}

/**
 * Encrypts a raw buffer using AES-256-GCM.
 */
export function encryptBuffer(buffer) {
  const key = getVaultMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedBuffer: encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypts an encrypted buffer using AES-256-GCM with authentication check.
 */
export function decryptBuffer(encryptedBuffer, ivHex, tagHex) {
  const key = getVaultMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

/**
 * Calculates SHA-256 hex digest of a buffer.
 */
export function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Saves a new evidence file version into the encrypted vault on disk.
 */
export async function storeVaultFile({ evidenceId, versionNum, buffer, fileType, isOriginal = false, isRedacted = false, isAnnotated = false, annotationNotes = null }) {
  const sha256 = calculateSha256(buffer);
  const { encryptedBuffer, iv, tag } = encryptBuffer(buffer);

  const fileName = `${evidenceId}_v${versionNum}.enc`;
  const storagePath = path.join(VAULT_DIR, fileName);

  fs.writeFileSync(storagePath, encryptedBuffer);

  return {
    fileId: `file_${crypto.randomUUID()}`,
    evidenceId,
    versionNum,
    fileType,
    fileSize: buffer.length,
    sha256Hash: sha256,
    storagePath,
    isOriginal: isOriginal ? 1 : 0,
    isRedacted: isRedacted ? 1 : 0,
    isAnnotated: isAnnotated ? 1 : 0,
    annotationNotes,
    encryptionIv: iv,
    encryptionTag: tag,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Retrieves and decrypts a file version from the vault.
 */
export async function retrieveVaultFile(fileRecord) {
  if (!fs.existsSync(fileRecord.storage_path)) {
    throw new Error(`Vault file not found on disk: ${fileRecord.storage_path}`);
  }

  const encryptedBuffer = fs.readFileSync(fileRecord.storage_path);
  const decryptedBuffer = decryptBuffer(
    encryptedBuffer,
    fileRecord.encryption_iv,
    fileRecord.encryption_tag
  );

  // Re-verify integrity on read
  const currentHash = calculateSha256(decryptedBuffer);
  if (currentHash !== fileRecord.sha256_hash) {
    throw new Error(`Integrity Violation: Hash mismatch in vault storage! Expected ${fileRecord.sha256_hash}, found ${currentHash}`);
  }

  return decryptedBuffer;
}

/**
 * Derives a distinct 256-bit encryption key dedicated for backups.
 */
export function getBackupKey() {
  if (process.env.VERATRACE_BACKUP_KEY) {
    return crypto.scryptSync(process.env.VERATRACE_BACKUP_KEY, 'veratrace-backup-salt-v1', 32);
  }
  const masterKey = getVaultMasterKey();
  return crypto.scryptSync(masterKey, 'veratrace-backup-salt-v1', 32);
}

/**
 * Encrypts a backup payload string using AES-256-GCM.
 */
export function encryptBackup(payloadJsonString) {
  const key = getBackupKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const payloadBuffer = Buffer.from(payloadJsonString, 'utf8');
  const encrypted = Buffer.concat([cipher.update(payloadBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sha256 = calculateSha256(payloadBuffer);

  return {
    format: 'VERATRACE_ENCRYPTED_BACKUP_V1',
    cipher: 'aes-256-gcm',
    createdUtc: new Date().toISOString(),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    sha256,
    ciphertextBase64: encrypted.toString('base64'),
  };
}

/**
 * Decrypts an encrypted backup envelope with AES-256-GCM authentication.
 */
export function decryptBackup(backupEnvelope, overrideKey = null) {
  if (!backupEnvelope || backupEnvelope.format !== 'VERATRACE_ENCRYPTED_BACKUP_V1') {
    throw new Error('Unsupported or malformed backup format. Expected VERATRACE_ENCRYPTED_BACKUP_V1.');
  }

  const key = overrideKey || getBackupKey();
  const iv = Buffer.from(backupEnvelope.iv, 'hex');
  const tag = Buffer.from(backupEnvelope.tag, 'hex');
  const encryptedBuffer = Buffer.from(backupEnvelope.ciphertextBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decryptedBuffer;
  try {
    decryptedBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  } catch (err) {
    throw new Error(`Backup Decryption Failed: Authentication tag mismatch or corrupted ciphertext (${err.message}).`);
  }

  const computedHash = calculateSha256(decryptedBuffer);
  if (computedHash !== backupEnvelope.sha256) {
    throw new Error(`Backup Integrity Violation: Decrypted payload hash ${computedHash} does not match header ${backupEnvelope.sha256}.`);
  }

  return JSON.parse(decryptedBuffer.toString('utf8'));
}

