/**
 * VeraTrace — Authentication & Session Management Engine
 *
 * Implements:
 * 1. Cryptographically secure token issuance and verification (HMAC-SHA256)
 * 2. Scrypt-based password hashing with unique 16-byte random salts
 * 3. Timing-safe signature comparisons to prevent timing attacks
 * 4. Express authentication middleware (requireAuth)
 * 5. Case-level authorization and IDOR prevention
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
const AUTH_KEY_FILE = path.join(DATA_DIR, '.auth_master.key');

let AUTH_SECRET = null;

export function getAuthSecret() {
  if (AUTH_SECRET) return AUTH_SECRET;

  if (process.env.VERATRACE_JWT_SECRET) {
    AUTH_SECRET = Buffer.from(process.env.VERATRACE_JWT_SECRET, 'utf8');
    return AUTH_SECRET;
  }

  if (fs.existsSync(AUTH_KEY_FILE)) {
    AUTH_SECRET = fs.readFileSync(AUTH_KEY_FILE);
    const secured = secureKeyFilePermissions(AUTH_KEY_FILE);
    if (!secured && process.env.NODE_ENV === 'production') {
      throw new Error(`CRITICAL SECURITY FAILURE: Unable to enforce secure NTFS/POSIX permissions on auth key file (${AUTH_KEY_FILE}).`);
    }
  } else {
    AUTH_SECRET = crypto.randomBytes(32);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(AUTH_KEY_FILE, AUTH_SECRET, { mode: 0o600 });
    const secured = secureKeyFilePermissions(AUTH_KEY_FILE);
    if (!secured && process.env.NODE_ENV === 'production') {
      throw new Error(`CRITICAL SECURITY FAILURE: Unable to enforce secure NTFS/POSIX permissions on newly generated auth key file (${AUTH_KEY_FILE}).`);
    }
  }
  return AUTH_SECRET;
}

function base64UrlEncode(strOrBuffer) {
  const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Hash a password using scrypt with random salt.
 */
export function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a plain password against stored salt:hash using timing-safe comparison.
 */
export function verifyPassword(plainPassword, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

/**
 * Issues a cryptographically signed HMAC-SHA256 JWT-compatible token.
 */
export function issueToken(payload, expiresInSeconds = 86400) {
  const secret = getAuthSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const jti = payload.jti || crypto.randomUUID();
  const fullPayload = {
    ...payload,
    jti,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createHmac('sha256', secret).update(signatureInput).digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Issues a scoped extension credential token (dedicated for Chrome MV3 extension).
 */
export function issueExtensionToken({ userId, username, credentialId, deviceName }, expiresInSeconds = 30 * 86400) {
  return issueToken(
    {
      userId,
      username,
      credentialId,
      deviceName,
      scope: 'EXTENSION_CAPTURE',
      role: 'USER',
    },
    expiresInSeconds
  );
}

/**
 * Revokes a session token by its JTI (or hash) by recording in the revoked_tokens blocklist.
 */
export function revokeToken(jti, expiresAtSec = Math.floor(Date.now() / 1000) + 86400) {
  if (!jti) return;
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO revoked_tokens (token_id, revoked_at, expires_at)
      VALUES (?, ?, ?)
    `).run(jti, new Date().toISOString(), expiresAtSec);
  } catch (err) {
    console.error('Failed to record token revocation:', err);
  }
}

/**
 * Checks whether a token JTI has been revoked.
 */
export function isTokenRevoked(jti) {
  if (!jti) return false;
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT token_id FROM revoked_tokens WHERE token_id = ?').get(jti);
    return Boolean(row);
  } catch (err) {
    return false;
  }
}

/**
 * Revokes a paired extension credential.
 */
export function revokeExtensionCredential(credentialId, userId = null) {
  const db = getDatabase();
  if (userId) {
    const res = db.prepare('UPDATE extension_credentials SET is_revoked = 1 WHERE credential_id = ? AND user_id = ?').run(credentialId, userId);
    return res.changes > 0;
  }
  const res = db.prepare('UPDATE extension_credentials SET is_revoked = 1 WHERE credential_id = ?').run(credentialId);
  return res.changes > 0;
}

/**
 * Verifies and decodes an HMAC-SHA256 token.
 */
export function verifyToken(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') {
    throw new Error('Token missing or invalid format');
  }

  const parts = tokenString.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token structure');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const secret = getAuthSecret();

  const expectedSignature = crypto.createHmac('sha256', secret).update(signatureInput).digest();
  const expectedSigEncoded = base64UrlEncode(expectedSignature);

  // Timing-safe comparison of signatures
  const sigBuf = Buffer.from(encodedSignature, 'utf8');
  const expectedBuf = Buffer.from(expectedSigEncoded, 'utf8');

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid token cryptographic signature');
  }

  const payloadJson = base64UrlDecode(encodedPayload);
  const payload = JSON.parse(payloadJson);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token has expired');
  }

  // Check token revocation blocklist
  if (payload.jti && isTokenRevoked(payload.jti)) {
    throw new Error('Token has been revoked (Session Terminated)');
  }

  // Scoped Extension Credentials validation
  if (payload.scope === 'EXTENSION_CAPTURE') {
    if (!payload.credentialId) {
      throw new Error('Malformed extension token: missing credentialId');
    }
    const db = getDatabase();
    const cred = db.prepare('SELECT is_revoked, expires_at FROM extension_credentials WHERE credential_id = ?').get(payload.credentialId);
    if (!cred) {
      throw new Error('Extension credential not found or unregistered');
    }
    if (cred.is_revoked === 1) {
      throw new Error('Extension credential has been revoked');
    }
    if (new Date(cred.expires_at).getTime() <= Date.now()) {
      throw new Error('Extension credential has expired');
    }
  }

  // Session Invalidation upon Password Change / Session Epoch Rotation (Dashboard user sessions)
  if (payload.userId && payload.scope !== 'EXTENSION_CAPTURE') {
    const db = getDatabase();
    const user = db.prepare('SELECT session_epoch, password_changed_at FROM users WHERE user_id = ?').get(payload.userId);
    if (user) {
      if (user.session_epoch && (payload.sessionEpoch || 0) < user.session_epoch) {
        throw new Error('Session invalidated due to password change. Please log in again.');
      }
      if (user.password_changed_at) {
        const changedSec = Math.floor(new Date(user.password_changed_at).getTime() / 1000);
        if (payload.iat && payload.iat < changedSec) {
          throw new Error('Session invalidated due to password change. Please log in again.');
        }
      }
    }
  }

  return payload;
}

/**
 * Validates password complexity:
 * Minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, and 1 number or special symbol.
 */
export function isPasswordStrong(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigitOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  return hasUpper && hasLower && hasDigitOrSpecial;
}

/**
 * Express middleware to enforce authentication.
 * Supports Dual Authentication:
 * 1. Bearer Header (Chrome Extension & API clients)
 * 2. HttpOnly Cookie (Dashboard Web sessions with CSRF protection)
 */
export function requireAuth(req, res, next) {
  let token = null;
  let isCookieAuth = false;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies && req.cookies.veratrace_session) {
    token = req.cookies.veratrace_session;
    isCookieAuth = true;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication Required: Missing or malformed Authorization header or session cookie.',
    });
  }

  // Enforce Double-Submit Cookie CSRF validation on state-changing requests using cookie sessions
  if (isCookieAuth && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    const csrfHeader = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies?.veratrace_csrf;
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return res.status(403).json({
        error: 'Forbidden: CSRF token validation failed (Missing or mismatched X-CSRF-Token).',
      });
    }
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: `Unauthorized: ${err.message}`,
    });
  }
}

/**
 * Express middleware for optional authentication (e.g. public verify routes).
 */
export function optionalAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies && req.cookies.veratrace_session) {
    token = req.cookies.veratrace_session;
  }

  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Ignore invalid token for optional auth
    }
  }
  next();
}
