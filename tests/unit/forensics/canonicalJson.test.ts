import { describe, it, expect } from 'vitest';
import {
  canonicalizeJson,
  hashCanonicalJson,
} from '../../../src/lib/forensics/canonicalJson.js';
import { CanonicalizationError } from '../../../src/lib/forensics/forensicsTypes.js';

describe('Forensics: Canonical JSON (RFC 8785 JCS)', () => {
  describe('Deterministic Key Ordering (Lexicographical by UTF-16 Code Unit)', () => {
    it('orders keys lexicographically regardless of object definition order', () => {
      const obj1 = { z: 1, a: 2, m: 3 };
      const obj2 = { a: 2, m: 3, z: 1 };
      const obj3 = { m: 3, z: 1, a: 2 };

      const canon1 = canonicalizeJson(obj1);
      const canon2 = canonicalizeJson(obj2);
      const canon3 = canonicalizeJson(obj3);

      expect(canon1).toBe('{"a":2,"m":3,"z":1}');
      expect(canon1).toBe(canon2);
      expect(canon2).toBe(canon3);
    });

    it('orders nested object keys deterministically at all depths', () => {
      const nested = {
        outer_b: { inner_z: 10, inner_a: 20 },
        outer_a: { inner_x: 30, inner_d: 40 },
      };

      const result = canonicalizeJson(nested);
      expect(result).toBe('{"outer_a":{"inner_d":40,"inner_x":30},"outer_b":{"inner_a":20,"inner_z":10}}');
    });

    it('sorts keys by UTF-16 code units according to RFC 8785 Section 3.2.3', () => {
      // 'a' = 0x0061 (97), '\u0080' = 0x0080 (128), '\u0100' = 0x0100 (256)
      const obj = {
        '\u0100': 3,
        'a': 1,
        '\u0080': 2,
      };

      const result = canonicalizeJson(obj);
      expect(result).toBe('{"a":1,"\u0080":2,"\u0100":3}');
    });
  });

  describe('Whitespace Removal & Array Preservation', () => {
    it('strips all unessential whitespace around colons and commas', () => {
      const complex = {
        title: 'Evidence Item',
        tags: ['harassment', 'cyberstalking', 'evidence'],
        count: 42,
      };

      const result = canonicalizeJson(complex);
      expect(result).toBe('{"count":42,"tags":["harassment","cyberstalking","evidence"],"title":"Evidence Item"}');
      expect(result).not.toMatch(/:\s|\s:|\s,|,\s/);
      expect(result).not.toContain('\n');
    });

    it('preserves array element sequence strictly without reordering elements', () => {
      const arr = [10, 5, 20, 1];
      const result = canonicalizeJson(arr);
      expect(result).toBe('[10,5,20,1]');
    });

    it('correctly canonicalizes empty objects and empty arrays', () => {
      expect(canonicalizeJson({})).toBe('{}');
      expect(canonicalizeJson([])).toBe('[]');
      expect(canonicalizeJson({ emptyObj: {}, emptyArr: [] })).toBe('{"emptyArr":[],"emptyObj":{}}');
    });
  });

  describe('Number Representation & Primitives (IEEE 754)', () => {
    it('serializes numbers according to RFC 8785 rules', () => {
      expect(canonicalizeJson(1e6)).toBe('1000000');
      expect(canonicalizeJson(0)).toBe('0');
      expect(canonicalizeJson(-0)).toBe('0');
      expect(canonicalizeJson(123.456)).toBe('123.456');
    });

    it('serializes top-level primitives and literals correctly', () => {
      expect(canonicalizeJson(null)).toBe('null');
      expect(canonicalizeJson(true)).toBe('true');
      expect(canonicalizeJson(false)).toBe('false');
      expect(canonicalizeJson('simple string')).toBe('"simple string"');
    });
  });

  describe('Unicode & String Escape Handling (RFC 8785 Section 3.2.2.2)', () => {
    it('preserves UTF-8 characters without converting to \\uXXXX escapes', () => {
      const unicodeObj = {
        currency: '₹',
        greek: 'λ',
        hindi: 'साक्ष्य',
      };
      const result = canonicalizeJson(unicodeObj);

      // Must be literal UTF-8, not \uXXXX
      expect(result).toContain('₹');
      expect(result).toContain('λ');
      expect(result).toContain('साक्ष्य');
      expect(result).not.toContain('\\u');
    });

    it('properly escapes mandatory JSON control characters (quotes, slashes, newlines)', () => {
      const obj = {
        escapes: 'line1\nline2\ttab\rreturn"quote\\backslash',
      };
      const result = canonicalizeJson(obj);
      expect(result).toBe('{"escapes":"line1\\nline2\\ttab\\rreturn\\"quote\\\\backslash"}');
    });
  });

  describe('Deterministic Hashing (hashCanonicalJson)', () => {
    it('generates identical SHA-256 hashes for objects with identical data in different key orders', () => {
      const manifestA = {
        version: '1.1.1',
        evidence_id: 'ev_01JG8X9Z111111111111111111',
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        timestamp: '2026-10-24T23:00:00.000Z',
      };

      const manifestB = {
        timestamp: '2026-10-24T23:00:00.000Z',
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        evidence_id: 'ev_01JG8X9Z111111111111111111',
        version: '1.1.1',
      };

      const hashA = hashCanonicalJson(manifestA);
      const hashB = hashCanonicalJson(manifestB);

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Rejection of Non-Serializable / Invalid Inputs', () => {
    it('throws CanonicalizationError on undefined input', () => {
      expect(() => canonicalizeJson(undefined)).toThrow(CanonicalizationError);
      try {
        canonicalizeJson(undefined);
      } catch (err: unknown) {
        expect((err as CanonicalizationError).code).toBe('ERR_CANONICALIZATION_FAILED');
      }
    });

    it('throws CanonicalizationError on function and symbol inputs', () => {
      expect(() => canonicalizeJson(() => {})).toThrow(CanonicalizationError);
      expect(() => canonicalizeJson(Symbol('test'))).toThrow(CanonicalizationError);
    });

    it('throws CanonicalizationError on circular object structures', () => {
      const circularObj: Record<string, unknown> = { name: 'circular' };
      circularObj.self = circularObj;

      expect(() => canonicalizeJson(circularObj)).toThrow(CanonicalizationError);
      try {
        canonicalizeJson(circularObj);
      } catch (err: unknown) {
        expect((err as CanonicalizationError).code).toBe('ERR_CANONICALIZATION_FAILED');
      }
    });
  });
});
