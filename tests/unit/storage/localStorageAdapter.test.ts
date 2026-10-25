import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  LocalStorageAdapter,
  getStagedKey,
  getRawKey,
  parseStorageKey,
} from '../../../src/lib/storage/index.js';
import {
  StorageFileNotFoundError,
  PathTraversalError,
  StorageIntegrityMismatchError,
  QuotaExceededError,
  EmptyStreamError,
} from '../../../src/lib/forensics/forensicsTypes.js';

describe('Storage: LocalForensicsStorageAdapter', () => {
  let tempStorageDir: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    tempStorageDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veratrace-storage-test-'));
    adapter = new LocalStorageAdapter(tempStorageDir);
  });

  afterEach(async () => {
    await fsp.rm(tempStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('Key Utilities & Safe Path Resolution', () => {
    it('generates deterministic staged and raw keys for given caseId and evidenceId', () => {
      const caseId = 'case-01JG8X9Z111111111111111111';
      const evidenceId = 'ev-01JG8X9Z222222222222222222';

      const stagedKey = getStagedKey(caseId, evidenceId);
      const rawKey = getRawKey(caseId, evidenceId);

      expect(stagedKey).toBe(`staged/${caseId}/${evidenceId}.tmp`);
      expect(rawKey).toBe(`raw/${caseId}/${evidenceId}.raw`);
    });

    it('parses structured storage keys correctly', () => {
      const parsed = parseStorageKey('staged/case-123/ev-456.tmp');
      expect(parsed).toEqual({
        prefix: 'staged',
        caseId: 'case-123',
        evidenceId: 'ev-456',
        extension: 'tmp',
      });

      const parsedRaw = parseStorageKey('raw/case-123/ev-456.raw');
      expect(parsedRaw).toEqual({
        prefix: 'raw',
        caseId: 'case-123',
        evidenceId: 'ev-456',
        extension: 'raw',
      });

      expect(parseStorageKey('invalid/path.txt')).toBeNull();
    });

    it('rejects path traversal attempts with PathTraversalError and does not leak physical path', () => {
      const traversalAttempts = [
        '../../etc/passwd',
        'staged/../../secrets.txt',
        'staged/./relative.tmp',
        'staged/subdir/../../../escape.txt',
        '/absolute/unix/path',
        'C:/Windows/System32',
        'staged/null\0byte.tmp',
      ];

      for (const attempt of traversalAttempts) {
        expect(() => adapter.resolveSecurePath(attempt)).toThrow(PathTraversalError);
        try {
          adapter.resolveSecurePath(attempt);
        } catch (err: unknown) {
          const travErr = err as PathTraversalError;
          expect(travErr.code).toBe('ERR_PATH_TRAVERSAL_DETECTED');
          expect(travErr.message).not.toContain(tempStorageDir);
        }
      }
    });
  });

  describe('Streaming Staging & Single-Pass Hashing', () => {
    it('successfully streams incoming bytes to staged storage and returns calculated SHA-256', async () => {
      const caseId = 'case-100';
      const evidenceId = 'ev-200';
      const stagedKey = getStagedKey(caseId, evidenceId);

      const content = Buffer.from('VeraTrace evidence payload: Harassing message screenshot bytes');
      const stream = Readable.from([content]);

      const result = await adapter.writeStagedStream(stagedKey, stream);

      expect(result.byteCount).toBe(content.length);
      expect(result.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
      expect(await adapter.exists(stagedKey)).toBe(true);

      const readBack = await adapter.readBuffer(stagedKey);
      expect(readBack.equals(content)).toBe(true);
    });

    it('aborts and unlinks partial staged file when upload quota is exceeded', async () => {
      const stagedKey = 'staged/case-quota/ev-quota.tmp';
      const limit = 50;
      const oversized = Buffer.alloc(100, 0x41);

      await expect(
        adapter.writeStagedStream(stagedKey, Readable.from([oversized]), limit)
      ).rejects.toThrow(QuotaExceededError);

      // Verify compensating cleanup: partial file must be unlinked
      expect(await adapter.exists(stagedKey)).toBe(false);
    });

    it('rejects empty streams during staging and cleans up', async () => {
      const stagedKey = 'staged/case-empty/ev-empty.tmp';
      await expect(
        adapter.writeStagedStream(stagedKey, Readable.from([]))
      ).rejects.toThrow(EmptyStreamError);

      expect(await adapter.exists(stagedKey)).toBe(false);
    });
  });

  describe('Staged-to-Raw Promotion Lifecycle & Fingerprint Verification', () => {
    it('promotes staged evidence to permanent raw storage when SHA-256 matches', async () => {
      const caseId = 'case-300';
      const evidenceId = 'ev-400';
      const stagedKey = getStagedKey(caseId, evidenceId);
      const rawKey = getRawKey(caseId, evidenceId);

      const data = Buffer.from('Legitimate forensic capture payload');
      const { sha256Hex, byteCount } = await adapter.writeStagedStream(
        stagedKey,
        Readable.from([data])
      );

      const promoResult = await adapter.promoteStaged(stagedKey, rawKey, sha256Hex);

      expect(promoResult.status).toBe('PROMOTED');
      expect(promoResult.rawKey).toBe(rawKey);
      expect(promoResult.stagedKey).toBe(stagedKey);
      expect(promoResult.sha256Hex).toBe(sha256Hex);
      expect(promoResult.sizeBytes).toBe(byteCount);

      // Raw exists, staged is cleanly removed
      expect(await adapter.exists(rawKey)).toBe(true);
      expect(await adapter.exists(stagedKey)).toBe(false);

      // Read back raw buffer
      const rawBuffer = await adapter.readBuffer(rawKey);
      expect(rawBuffer.equals(data)).toBe(true);
    });

    it('strictly rejects promotion on SHA-256 mismatch and preserves staged file for investigation', async () => {
      const caseId = 'case-tamper';
      const evidenceId = 'ev-tamper';
      const stagedKey = getStagedKey(caseId, evidenceId);
      const rawKey = getRawKey(caseId, evidenceId);

      const originalData = Buffer.from('Original authentic data');
      await adapter.writeStagedBuffer(stagedKey, originalData);

      const expectedDifferentHash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

      await expect(
        adapter.promoteStaged(stagedKey, rawKey, expectedDifferentHash)
      ).rejects.toThrow(StorageIntegrityMismatchError);

      try {
        await adapter.promoteStaged(stagedKey, rawKey, expectedDifferentHash);
      } catch (err: unknown) {
        const mismatchErr = err as StorageIntegrityMismatchError;
        expect(mismatchErr.code).toBe('ERR_FORENSIC_INTEGRITY_MISMATCH');
        expect(mismatchErr.expectedSha256).toBe(expectedDifferentHash);
      }

      // CRITICAL FORENSIC INVARIANT: Staged file MUST NOT be deleted
      expect(await adapter.exists(stagedKey)).toBe(true);
      // Raw file must not exist
      expect(await adapter.exists(rawKey)).toBe(false);
    });

    it('throws StorageFileNotFoundError when attempting to promote non-existent staged file', async () => {
      const stagedKey = 'staged/case-missing/ev-missing.tmp';
      const rawKey = 'raw/case-missing/ev-missing.raw';
      const dummyHash = '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1';

      await expect(
        adapter.promoteStaged(stagedKey, rawKey, dummyHash)
      ).rejects.toThrow(StorageFileNotFoundError);
    });

    it('rejects promotion when destination raw file already exists with different hash', async () => {
      const caseId = 'case-dest-exists';
      const evidenceId = 'ev-dest-exists';
      const stagedKey = getStagedKey(caseId, evidenceId);
      const rawKey = getRawKey(caseId, evidenceId);

      // Destination already has a conflicting file
      await adapter.writeStagedBuffer(rawKey, Buffer.from('Conflicting file already in raw'));
      // Staged has evidence
      await adapter.writeStagedBuffer(stagedKey, Buffer.from('New evidence trying to promote'));

      const newEvidenceHash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

      await expect(
        adapter.promoteStaged(stagedKey, rawKey, newEvidenceHash)
      ).rejects.toThrow(StorageIntegrityMismatchError);
    });
  });

  describe('Crash Recovery & Idempotent Promotion Replay', () => {
    it('handles idempotent duplicate promotion safely without error', async () => {
      const caseId = 'case-replay';
      const evidenceId = 'ev-replay';
      const stagedKey = getStagedKey(caseId, evidenceId);
      const rawKey = getRawKey(caseId, evidenceId);

      const content = Buffer.from('Evidence payload for idempotent replay test');
      const { sha256Hex } = await adapter.writeStagedStream(stagedKey, Readable.from([content]));

      // 1. Initial promotion
      const firstResult = await adapter.promoteStaged(stagedKey, rawKey, sha256Hex);
      expect(firstResult.status).toBe('PROMOTED');

      // 2. Re-trigger promotion (simulating crash retry or network duplicate)
      const secondResult = await adapter.promoteStaged(stagedKey, rawKey, sha256Hex);
      expect(secondResult.status).toBe('ALREADY_EXISTS');
      expect(secondResult.sha256Hex).toBe(sha256Hex);

      // Verify raw file remains perfectly readable and intact
      const rawBuffer = await adapter.readBuffer(rawKey);
      expect(rawBuffer.equals(content)).toBe(true);
    });

    it('cleans up lingering staged file if destination was promoted before server crash', async () => {
      const caseId = 'case-crash-linger';
      const evidenceId = 'ev-crash-linger';
      const stagedKey = getStagedKey(caseId, evidenceId);
      const rawKey = getRawKey(caseId, evidenceId);

      const content = Buffer.from('Crash recovery lingering file test');
      const { sha256Hex } = await adapter.writeStagedStream(stagedKey, Readable.from([content]));

      // Simulate crash where raw file was written but staged file was not unlinked
      await adapter.writeStagedBuffer(rawKey, content);
      expect(await adapter.exists(stagedKey)).toBe(true);
      expect(await adapter.exists(rawKey)).toBe(true);

      // Run promotion recovery
      const result = await adapter.promoteStaged(stagedKey, rawKey, sha256Hex);
      expect(result.status).toBe('ALREADY_EXISTS');

      // Lingering staged file must now be cleaned up
      expect(await adapter.exists(stagedKey)).toBe(false);
      expect(await adapter.exists(rawKey)).toBe(true);
    });
  });

  describe('Integrity Verification & Metadata', () => {
    it('verifies stored file integrity correctly via verifyIntegrity', async () => {
      const rawKey = 'raw/case-audit/evidence-audit.raw';
      const content = Buffer.from('Audit trail evidence bytes');
      await adapter.writeStagedBuffer(rawKey, content);

      const metadata = await adapter.getMetadata(rawKey);
      expect(metadata.sizeBytes).toBe(content.length);

      // Compute actual expected hash using standard crypto
      const expectedValidHash = createHash('sha256').update(content).digest('hex').toLowerCase();

      const checkValid = await adapter.verifyIntegrity(rawKey, expectedValidHash);
      expect(checkValid.matches).toBe(true);
      expect(checkValid.calculatedSha256).toBe(expectedValidHash);

      const checkInvalid = await adapter.verifyIntegrity(
        rawKey,
        '0000000000000000000000000000000000000000000000000000000000000000'
      );
      expect(checkInvalid.matches).toBe(false);
    });
  });

  describe('Safe Staged Sweeper & Zero-Data-Loss Cleanup', () => {
    it('lists lingering staged files with parsed metadata and age', async () => {
      const key1 = getStagedKey('case-A', 'ev-1');
      const key2 = getStagedKey('case-B', 'ev-2');

      await adapter.writeStagedBuffer(key1, Buffer.from('Payload 1'));
      await adapter.writeStagedBuffer(key2, Buffer.from('Payload 2'));

      const files = await adapter.listStagedFiles();
      expect(files.length).toBe(2);

      const found1 = files.find((f) => f.caseId === 'case-A');
      expect(found1).toBeDefined();
      expect(found1?.evidenceId).toBe('ev-1');
      expect(found1?.sizeBytes).toBe(9);
    });

    it('cleans up only abandoned staged files when predicate confirms no pending DB record exists', async () => {
      const activePendingKey = getStagedKey('case-active', 'ev-pending');
      const abandonedKey = getStagedKey('case-abandoned', 'ev-abandoned');

      await adapter.writeStagedBuffer(activePendingKey, Buffer.from('Active Pending Upload'));
      await adapter.writeStagedBuffer(abandonedKey, Buffer.from('Abandoned Upload'));

      // Simulate mtime in the past (3 hours ago)
      const physicalPending = adapter.resolveSecurePath(activePendingKey);
      const physicalAbandoned = adapter.resolveSecurePath(abandonedKey);
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
      await fsp.utimes(physicalPending, threeHoursAgo, threeHoursAgo);
      await fsp.utimes(physicalAbandoned, threeHoursAgo, threeHoursAgo);

      // Predicate coordinates with DB state:
      // case-active / ev-pending is in DB with PENDING_PROMOTION -> return false (DO NOT DELETE)
      // case-abandoned has NO DB record -> return true (SAFE TO DELETE)
      const mockDbPredicate = async (file: { caseId?: string; evidenceId?: string }) => {
        if (file.evidenceId === 'ev-pending') {
          return false; // Active DB record exists!
        }
        return true; // Abandoned
      };

      const summary = await adapter.cleanupStagedOlderThan(2 * 3600 * 1000, mockDbPredicate);

      expect(summary.inspectedCount).toBe(2);
      expect(summary.deletedCount).toBe(1);
      expect(summary.retainedCount).toBe(1);

      // CRITICAL ZERO-DATA-LOSS CHECK:
      // Active pending file MUST be retained!
      expect(await adapter.exists(activePendingKey)).toBe(true);
      // Abandoned file is deleted
      expect(await adapter.exists(abandonedKey)).toBe(false);
    });

    it('does not touch young staged files under maxAgeMs', async () => {
      const youngKey = getStagedKey('case-young', 'ev-young');
      await adapter.writeStagedBuffer(youngKey, Buffer.from('Fresh in-flight upload'));

      const summary = await adapter.cleanupStagedOlderThan(3600 * 1000, async () => true);

      expect(summary.deletedCount).toBe(0);
      expect(summary.retainedCount).toBe(1);
      expect(await adapter.exists(youngKey)).toBe(true);
    });
  });

  describe('readRange Slice & Streaming Capabilities', () => {
    it('reads byte slices correctly using positive and negative offsets without loading full file', async () => {
      const testKey = 'staged/case-range/ev-range.tmp';
      const sample = Buffer.from('ABCDEFGH0123456789WXYZ'); // 22 bytes
      await adapter.writeStagedBuffer(testKey, sample);

      // Read from offset 0
      const head = await adapter.readRange(testKey, 0, 8);
      expect(head.toString('utf8')).toBe('ABCDEFGH');

      // Read middle slice
      const middle = await adapter.readRange(testKey, 8, 10);
      expect(middle.toString('utf8')).toBe('0123456789');

      // Read from negative offset (last 4 bytes)
      const tail = await adapter.readRange(testKey, -4, 4);
      expect(tail.toString('utf8')).toBe('WXYZ');

      // Negative offset larger than file clamps to start
      const fullNegative = await adapter.readRange(testKey, -100, 100);
      expect(fullNegative.toString('utf8')).toBe('ABCDEFGH0123456789WXYZ');

      // Beyond EOF returns empty buffer
      const beyond = await adapter.readRange(testKey, 100, 10);
      expect(beyond.length).toBe(0);
    });
  });
});
