/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Streaming SHA-256 Hasher
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 5.1 & 5.2)
 * Person 2 Responsibility: Evidence Collection & Forensics
 *
 * Implements O(1) memory streaming SHA-256 calculation with strict byte counting,
 * 50 MiB quota enforcement, and empty-stream rejection.
 */

import { Transform, TransformCallback, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import {
  MAX_UPLOAD_BYTES,
  HashStreamResult,
  QuotaExceededError,
  EmptyStreamError,
} from './forensicsTypes.js';

export interface StreamingHasher {
  /**
   * The Node.js Transform stream that computes the SHA-256 digest while passing
   * incoming chunks through to downstream consumers (e.g. disk or S3 writer).
   */
  hasherStream: Transform;
  /**
   * Promise that resolves with the final HashStreamResult upon stream completion,
   * or rejects if quota is exceeded, stream is empty, or a read error occurs.
   */
  done: Promise<HashStreamResult>;
}

/**
 * Creates a streaming SHA-256 transformer that processes chunks with O(1) memory.
 *
 * @param maxBytes Maximum allowable bytes before stream abort (default: 52,428,800 bytes / 50 MiB).
 * @returns Object containing the Transform stream and a completion Promise.
 */
export function createStreamingHasher(
  maxBytes: number = MAX_UPLOAD_BYTES
): StreamingHasher {
  const hash = createHash('sha256');
  let byteCount = 0;
  let settled = false;

  let resolvePromise!: (result: HashStreamResult) => void;
  let rejectPromise!: (error: Error) => void;

  const done = new Promise<HashStreamResult>((resolve, reject) => {
    resolvePromise = (res) => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };
    rejectPromise = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
  });

  const hasherStream = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      byteCount += chunk.length;

      // Strict quota check: abort immediately on quota violation
      if (byteCount > maxBytes) {
        const quotaErr = new QuotaExceededError(byteCount, maxBytes);
        rejectPromise(quotaErr);
        this.destroy(quotaErr);
        return callback(quotaErr);
      }

      hash.update(chunk);
      this.push(chunk);
      callback();
    },

    flush(callback: TransformCallback) {
      // Rejection of zero-byte / empty streams
      if (byteCount === 0) {
        const emptyErr = new EmptyStreamError();
        rejectPromise(emptyErr);
        return callback(emptyErr);
      }

      const sha256Hex = hash.digest('hex').toLowerCase();
      const result: HashStreamResult = {
        sha256Hex,
        byteCount,
      };

      resolvePromise(result);
      callback();
    },
  });

  hasherStream.on('error', (err) => {
    rejectPromise(err);
  });

  hasherStream.on('close', () => {
    if (!settled) {
      rejectPromise(new Error('Stream closed prematurely before completion.'));
    }
  });

  return { hasherStream, done };
}

/**
 * Convenience utility to hash an entire readable stream in memory-efficient fashion.
 *
 * @param readable A readable stream of binary data.
 * @param maxBytes Maximum permitted bytes.
 * @returns HashStreamResult with sha256Hex and byteCount.
 */
export async function hashStream(
  readable: NodeJS.ReadableStream,
  maxBytes: number = MAX_UPLOAD_BYTES
): Promise<HashStreamResult> {
  const { hasherStream, done } = createStreamingHasher(maxBytes);

  // Consume stream output without buffering
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  // Attach catch handler to done promise to avoid unhandled rejection if pipeline rejects first
  const doneCatchHandled = done.catch((err) => {
    throw err;
  });

  const [result] = await Promise.all([
    doneCatchHandled,
    pipeline(readable, hasherStream, sink),
  ]);

  return result;
}

/**
 * Synchronous forensic hashing of an in-memory buffer with quota and empty checks.
 *
 * @param buffer In-memory buffer to hash.
 * @param maxBytes Maximum permitted bytes.
 * @returns HashStreamResult with sha256Hex and byteCount.
 */
export function hashBuffer(
  buffer: Buffer | Uint8Array,
  maxBytes: number = MAX_UPLOAD_BYTES
): HashStreamResult {
  const byteCount = buffer.length;

  if (byteCount === 0) {
    throw new EmptyStreamError();
  }

  if (byteCount > maxBytes) {
    throw new QuotaExceededError(byteCount, maxBytes);
  }

  const hash = createHash('sha256');
  hash.update(buffer);
  const sha256Hex = hash.digest('hex').toLowerCase();

  return {
    sha256Hex,
    byteCount,
  };
}
