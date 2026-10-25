/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: RFC 8785 JSON Canonicalization Scheme (JCS)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 5.3 & Manifest Signing)
 * Person 2 Responsibility: Evidence Collection & Forensics
 *
 * Produces deterministic, canonical JSON representations across heterogeneous runtimes,
 * ensuring byte-for-byte identical SHA-256 digests for cryptographic signing and verification.
 */

import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { CanonicalizationError } from './forensicsTypes.js';

/**
 * Serializes any valid JSON-serializable value into a canonical RFC 8785 string.
 *
 * RFC 8785 Rules:
 * - Deterministic lexicographic key ordering for JSON objects (UTF-16 code unit order)
 * - Strict whitespace removal (no spaces between tokens, commas, or colons)
 * - Standardized IEEE 754 number representation
 * - Preservation of array element order
 *
 * @param value The value, object, or array to canonicalize.
 * @returns RFC 8785 canonical JSON string.
 * @throws CanonicalizationError if input is undefined, symbol, function, contains circular references, or cannot be serialized.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === undefined) {
    throw new CanonicalizationError('Cannot canonicalize undefined value: not valid JSON.');
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new CanonicalizationError(
      `Cannot canonicalize type '${typeof value}': functions and symbols are not JSON-serializable.`
    );
  }

  try {
    const result = canonicalize(value);
    if (result === undefined) {
      throw new CanonicalizationError('Canonicalization yielded undefined for input.');
    }
    return result;
  } catch (err: unknown) {
    if (err instanceof CanonicalizationError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new CanonicalizationError(`Canonicalization failed: ${message}`);
  }
}

/**
 * Computes the SHA-256 hash of the canonical RFC 8785 representation of a value.
 * Used for deterministic manifest hashing and offline verification.
 *
 * @param value The value or manifest object to canonicalize and hash.
 * @returns 64-character lowercase hexadecimal SHA-256 digest of the canonical JSON bytes.
 */
export function hashCanonicalJson(value: unknown): string {
  const canonicalString = canonicalizeJson(value);
  const hash = createHash('sha256');
  hash.update(Buffer.from(canonicalString, 'utf8'));
  return hash.digest('hex').toLowerCase();
}
