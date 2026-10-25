import { describe, it, expect } from 'vitest';
import { Readable, PassThrough } from 'node:stream';
import {
  createStreamingHasher,
  hashBuffer,
  hashStream,
} from '../../../src/lib/forensics/streamingHasher.js';
import {
  MAX_UPLOAD_BYTES,
  QuotaExceededError,
  EmptyStreamError,
} from '../../../src/lib/forensics/forensicsTypes.js';

describe('Forensics: Streaming SHA-256 Hasher', () => {
  // NIST FIPS 180-4 standard test vectors
  const NIST_ABC_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const NIST_56BYTE_VECTOR = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
  const NIST_56BYTE_HASH = '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1';
  const NIST_1MILLION_A_HASH = 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0';

  describe('NIST Test Vectors & Exact Hashing', () => {
    it('correctly hashes NIST "abc" vector using hashBuffer', () => {
      const buffer = Buffer.from('abc', 'utf8');
      const result = hashBuffer(buffer);

      expect(result.sha256Hex).toBe(NIST_ABC_HASH);
      expect(result.byteCount).toBe(3);
    });

    it('correctly hashes NIST "abc" vector using streaming hashStream', async () => {
      const readable = Readable.from([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
      const result = await hashStream(readable);

      expect(result.sha256Hex).toBe(NIST_ABC_HASH);
      expect(result.byteCount).toBe(3);
    });

    it('correctly hashes NIST 56-byte vector', () => {
      const buffer = Buffer.from(NIST_56BYTE_VECTOR, 'utf8');
      const result = hashBuffer(buffer);

      expect(result.sha256Hex).toBe(NIST_56BYTE_HASH);
      expect(result.byteCount).toBe(56);
    });

    it('correctly hashes NIST 1,000,000 "a" characters via chunked streaming', async () => {
      // 1,000,000 bytes = 16 chunks of 62,500 'a's
      const chunkSize = 62_500;
      const chunkCount = 16;
      const chunk = Buffer.alloc(chunkSize, 'a'.charCodeAt(0));

      async function* generateMillionAs() {
        for (let i = 0; i < chunkCount; i++) {
          yield chunk;
        }
      }

      const result = await hashStream(Readable.from(generateMillionAs()));
      expect(result.byteCount).toBe(1_000_000);
      expect(result.sha256Hex).toBe(NIST_1MILLION_A_HASH);
    });

    it('produces lowercase 64-character hexadecimal digests', () => {
      const result = hashBuffer(Buffer.from('VeraTrace evidence sample'));
      expect(result.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
      expect(result.sha256Hex).toBe(result.sha256Hex.toLowerCase());
    });
  });

  describe('Zero-Byte Empty Stream Rejection', () => {
    it('rejects 0-byte buffer with EmptyStreamError in hashBuffer', () => {
      expect(() => hashBuffer(Buffer.alloc(0))).toThrow(EmptyStreamError);
      try {
        hashBuffer(Buffer.alloc(0));
      } catch (err: unknown) {
        expect((err as EmptyStreamError).code).toBe('ERR_EMPTY_STREAM_REJECTED');
      }
    });

    it('rejects 0-byte stream with EmptyStreamError in hashStream', async () => {
      const emptyReadable = Readable.from([]);
      await expect(hashStream(emptyReadable)).rejects.toThrow(EmptyStreamError);

      try {
        await hashStream(Readable.from([]));
      } catch (err: unknown) {
        expect((err as EmptyStreamError).code).toBe('ERR_EMPTY_STREAM_REJECTED');
      }
    });

    it('rejects empty stream via createStreamingHasher directly', async () => {
      const { hasherStream, done } = createStreamingHasher();
      const emptyStream = new PassThrough();

      emptyStream.pipe(hasherStream);
      emptyStream.end();

      await expect(done).rejects.toThrow(EmptyStreamError);
    });
  });

  describe('Exact 50 MiB Upload Quota Boundary Enforcement', () => {
    it('succeeds when stream byte count exactly equals MAX_UPLOAD_BYTES (52,428,800 bytes / 50 MiB)', async () => {
      // 52,428,800 bytes = 800 chunks of 65,536 bytes (64 KiB)
      const chunkSize = 65_536;
      const chunkCount = 800; // 800 * 65,536 = 52,428,800
      const chunk = Buffer.alloc(chunkSize, 0x56); // 'V' for VeraTrace

      async function* generateExact50MiB() {
        for (let i = 0; i < chunkCount; i++) {
          yield chunk;
        }
      }

      const result = await hashStream(Readable.from(generateExact50MiB()), MAX_UPLOAD_BYTES);
      expect(result.byteCount).toBe(MAX_UPLOAD_BYTES);
      expect(result.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it('immediately aborts and rejects when stream exceeds MAX_UPLOAD_BYTES by exactly 1 byte (52,428,801 bytes)', async () => {
      const chunkSize = 65_536;
      const chunkCount = 800;
      const chunk = Buffer.alloc(chunkSize, 0x56);
      const extraByte = Buffer.from([0x01]);

      async function* generate50MiBPlusOne() {
        for (let i = 0; i < chunkCount; i++) {
          yield chunk;
        }
        yield extraByte;
      }

      await expect(
        hashStream(Readable.from(generate50MiBPlusOne()), MAX_UPLOAD_BYTES)
      ).rejects.toThrow(QuotaExceededError);

      try {
        await hashStream(Readable.from(generate50MiBPlusOne()), MAX_UPLOAD_BYTES);
      } catch (err: unknown) {
        const quotaErr = err as QuotaExceededError;
        expect(quotaErr.code).toBe('ERR_UPLOAD_QUOTA_EXCEEDED');
        expect(quotaErr.maxBytes).toBe(MAX_UPLOAD_BYTES);
        expect(quotaErr.bytesProcessed).toBe(MAX_UPLOAD_BYTES + 1);
      }
    });

    it('rejects multi-chunk streams immediately when chunk pushes total over custom limit', async () => {
      const limit = 100;
      const chunk1 = Buffer.alloc(60, 0x41);
      const chunk2 = Buffer.alloc(50, 0x42); // 60 + 50 = 110 > 100
      const readable = Readable.from([chunk1, chunk2]);

      await expect(hashStream(readable, limit)).rejects.toThrow(QuotaExceededError);
    });

    it('hashBuffer enforces quota synchronously', () => {
      const limit = 50;
      const oversized = Buffer.alloc(51, 0x41);
      expect(() => hashBuffer(oversized, limit)).toThrow(QuotaExceededError);
    });
  });

  describe('Upstream Stream Cancellation & Abort Propagation', () => {
    it('propagates upstream readable stream errors cleanly via hashStream / pipeline', async () => {
      const faultySource = new PassThrough();
      const hashPromise = hashStream(faultySource);

      faultySource.write(Buffer.from('Initial valid chunk'));

      // Simulate upstream network abort / read fault
      const simulatedError = new Error('E_SOCKET_DISCONNECTED: Upstream connection lost');
      faultySource.destroy(simulatedError);

      await expect(hashPromise).rejects.toThrow('E_SOCKET_DISCONNECTED: Upstream connection lost');
    });

    it('halts processing and destroys transformer when quota is exceeded mid-stream', async () => {
      const limit = 50;
      const { hasherStream, done } = createStreamingHasher(limit);
      const passThrough = new PassThrough();

      passThrough.pipe(hasherStream);
      passThrough.write(Buffer.alloc(30, 0x41)); // 30 bytes (ok)
      passThrough.write(Buffer.alloc(30, 0x42)); // 60 bytes (exceeds 50 limit)

      await expect(done).rejects.toThrow(QuotaExceededError);
      expect(hasherStream.destroyed).toBe(true);
    });
  });

  describe('Streaming Pass-Through & O(1) Memory Efficiency', () => {
    it('passes chunks through the Transform stream unchanged while hashing', async () => {
      const { hasherStream, done } = createStreamingHasher();
      const chunks: Buffer[] = [
        Buffer.from('Chunk 1: Case data, '),
        Buffer.from('Chunk 2: Evidence item, '),
        Buffer.from('Chunk 3: Timestamp 2026-10-24'),
      ];

      const collectedOutput: Buffer[] = [];
      hasherStream.on('data', (chunk) => {
        collectedOutput.push(chunk);
      });

      const source = Readable.from(chunks);
      source.pipe(hasherStream);

      const result = await done;
      const combinedOutput = Buffer.concat(collectedOutput);
      const expectedCombined = Buffer.concat(chunks);

      expect(combinedOutput.equals(expectedCombined)).toBe(true);
      expect(result.byteCount).toBe(expectedCombined.length);
      expect(result.sha256Hex).toBe(hashBuffer(expectedCombined).sha256Hex);
    });

    it('handles streaming large chunked payload without memory buffering', async () => {
      // Stream 50 chunks of 10,000 bytes = 500,000 bytes
      const chunkCount = 50;
      const chunkSize = 10_000;
      const totalBytes = chunkCount * chunkSize;

      async function* generateChunks() {
        for (let i = 0; i < chunkCount; i++) {
          yield Buffer.alloc(chunkSize, i % 256);
        }
      }

      const readable = Readable.from(generateChunks());
      const result = await hashStream(readable);

      expect(result.byteCount).toBe(totalBytes);
      expect(result.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
