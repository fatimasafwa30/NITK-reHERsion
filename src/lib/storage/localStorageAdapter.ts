/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Local Filesystem Storage Adapter (LocalStorageAdapter)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 2, 5.1 & 7)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Provides safe, private local filesystem storage with path traversal protection,
 * O(1) streaming writes, SHA-256 verification before promotion, idempotent crash recovery,
 * and zero-data-loss staged cleanup guardrails.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import {
  StorageAdapter,
  StorageObjectMetadata,
  PromotionResult,
  IntegrityVerificationResult,
  StagedFileInfo,
  CleanupSummary,
  parseStorageKey,
} from './storageTypes.js';
import {
  MAX_UPLOAD_BYTES,
  StorageFileNotFoundError,
  PathTraversalError,
  StorageIntegrityMismatchError,
  StorageIOError,
} from '../forensics/forensicsTypes.js';
import { createStreamingHasher } from '../forensics/streamingHasher.js';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly rootPath: string;

  /**
   * Initializes the Local Storage Adapter with a dedicated storage root.
   *
   * @param storageRoot Absolute or relative root path for evidence storage (e.g. './storage').
   */
  constructor(storageRoot: string) {
    if (!storageRoot || typeof storageRoot !== 'string') {
      throw new Error('LocalStorageAdapter requires a valid storageRoot directory path.');
    }
    this.rootPath = path.resolve(storageRoot);
  }

  /**
   * Returns the configured storage root path (for test/diagnostic inspection only).
   */
  public getRootPath(): string {
    return this.rootPath;
  }

  /**
   * Resolves a logical storage key (e.g. staged/c1/e1.tmp) into a physical filesystem path.
   * Strictly enforces path traversal protection and ensures no paths escape rootPath.
   *
   * Security Boundaries:
   * - Blocks null bytes and empty inputs.
   * - Blocks '..' and '.' relative path traversal tokens.
   * - Validates that path.relative(rootPath, resolved) stays inside rootPath.
   * - Never exposes physical paths in error messages.
   */
  public resolveSecurePath(logicalKey: string): string {
    if (!logicalKey || typeof logicalKey !== 'string') {
      throw new PathTraversalError('Invalid storage key: key must be a non-empty string.');
    }

    if (logicalKey.includes('\0')) {
      throw new PathTraversalError('Path traversal attempt: storage key contains forbidden null bytes.');
    }

    // Normalize slashes
    const normalized = logicalKey.replace(/\\/g, '/');

    // Check for explicit relative path traversal components
    const parts = normalized.split('/');
    for (const part of parts) {
      if (part === '..' || part === '.') {
        throw new PathTraversalError('Path traversal attempt: key contains relative directory navigation.');
      }
    }

    // Disallow absolute drive letters or rooted paths in the logical key
    if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
      throw new PathTraversalError('Path traversal attempt: logical key must not be an absolute path.');
    }

    const resolved = path.resolve(this.rootPath, normalized);

    // Verify resolved path stays strictly inside rootPath
    const relative = path.relative(this.rootPath, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new PathTraversalError('Path traversal attempt: resolved path escapes the storage root directory.');
    }

    return resolved;
  }

  /**
   * Streams uncompressed evidence bytes into a private staged location while
   * simultaneously computing the SHA-256 fingerprint in a single pass.
   */
  public async writeStagedStream(
    stagedKey: string,
    sourceStream: NodeJS.ReadableStream,
    maxBytes: number = MAX_UPLOAD_BYTES
  ): Promise<{ byteCount: number; sha256Hex: string }> {
    const physicalPath = this.resolveSecurePath(stagedKey);
    await fsp.mkdir(path.dirname(physicalPath), { recursive: true });

    const { hasherStream, done } = createStreamingHasher(maxBytes);
    const fileWriteStream = fs.createWriteStream(physicalPath);

    // Prevent unhandled rejection if pipeline rejects before done
    const doneHandled = done.catch((err) => {
      throw err;
    });

    try {
      const [hashResult] = await Promise.all([
        doneHandled,
        pipeline(sourceStream, hasherStream, fileWriteStream),
      ]);

      return {
        byteCount: hashResult.byteCount,
        sha256Hex: hashResult.sha256Hex,
      };
    } catch (err: unknown) {
      // Compensating cleanup on failure: unlink partially written file
      await fsp.unlink(physicalPath).catch(() => {});
      throw err;
    }
  }

  /**
   * Writes an in-memory buffer directly to a staged key.
   */
  public async writeStagedBuffer(stagedKey: string, buffer: Buffer | Uint8Array): Promise<void> {
    const physicalPath = this.resolveSecurePath(stagedKey);
    await fsp.mkdir(path.dirname(physicalPath), { recursive: true });
    try {
      await fsp.writeFile(physicalPath, buffer);
    } catch (err: unknown) {
      throw new StorageIOError(
        `Failed to write staged buffer for key '${stagedKey}'.`,
        err,
        stagedKey
      );
    }
  }

  /**
   * Writes a derived preview or thumbnail buffer to a private derived storage key.
   */
  public async writeDerivedBuffer(derivedKey: string, buffer: Buffer | Uint8Array): Promise<void> {
    const physicalPath = this.resolveSecurePath(derivedKey);
    await fsp.mkdir(path.dirname(physicalPath), { recursive: true });
    try {
      await fsp.writeFile(physicalPath, buffer);
    } catch (err: unknown) {
      throw new StorageIOError(
        `Failed to write derived buffer for key '${derivedKey}'.`,
        err,
        derivedKey
      );
    }
  }

  /**
   * Writes a generated dossier ZIP archive or PDF report buffer to private dossier storage.
   */
  public async writeDossierBuffer(dossierKey: string, buffer: Buffer | Uint8Array): Promise<void> {
    const physicalPath = this.resolveSecurePath(dossierKey);
    await fsp.mkdir(path.dirname(physicalPath), { recursive: true });
    try {
      await fsp.writeFile(physicalPath, buffer);
    } catch (err: unknown) {
      throw new StorageIOError(
        `Failed to write dossier buffer for key '${dossierKey}'.`,
        err,
        dossierKey
      );
    }
  }

  /**
   * Opens a writable stream for writing a file to storage (e.g. streaming archiver ZIP).
   */
  public createWriteStream(storageKey: string): fs.WriteStream {
    const physicalPath = this.resolveSecurePath(storageKey);
    fs.mkdirSync(path.dirname(physicalPath), { recursive: true });
    return fs.createWriteStream(physicalPath);
  }

  /**
   * Promotes staged evidence to its permanent raw location.
   *
   * Idempotent & Crash-Resilient Rules:
   * 1. If rawKey already exists:
   *    - Verify SHA-256 matches expectedSha256.
   *    - If match: unlink lingering stagedKey and return ALREADY_EXISTS.
   *    - If mismatch: throw StorageIntegrityMismatchError (forensic integrity violation).
   * 2. If rawKey does not exist:
   *    - Verify stagedKey exists. If not, throw StorageFileNotFoundError.
   *    - Verify stagedKey SHA-256 matches expectedSha256.
   *    - If mismatch: throw StorageIntegrityMismatchError. DO NOT DELETE staged file!
   *    - If match: atomically move stagedKey to rawKey.
   */
  public async promoteStaged(
    stagedKey: string,
    rawKey: string,
    expectedSha256: string
  ): Promise<PromotionResult> {
    const stagedPath = this.resolveSecurePath(stagedKey);
    const rawPath = this.resolveSecurePath(rawKey);
    const normalizedExpected = expectedSha256.toLowerCase().trim();

    // 1. Check if rawKey already exists (idempotency / post-crash replay)
    const rawExists = await this.pathExists(rawPath);
    if (rawExists) {
      const existingRawHash = await this.computeFileSha256(rawPath);
      if (existingRawHash === normalizedExpected) {
        // Clean up lingering staged file if present
        await fsp.unlink(stagedPath).catch(() => {});
        const stat = await fsp.stat(rawPath);
        return {
          status: 'ALREADY_EXISTS',
          rawKey,
          stagedKey,
          sha256Hex: normalizedExpected,
          sizeBytes: stat.size,
          details: 'Evidence already promoted to permanent storage with identical SHA-256 digest.',
        };
      } else {
        throw new StorageIntegrityMismatchError(
          rawKey,
          normalizedExpected,
          existingRawHash,
          `Destination file '${rawKey}' already exists but its SHA-256 does not match expected digest.`
        );
      }
    }

    // 2. Raw does not exist: ensure staged file exists
    const stagedExists = await this.pathExists(stagedPath);
    if (!stagedExists) {
      throw new StorageFileNotFoundError(
        stagedKey,
        `Cannot promote evidence: staged file not found for key '${stagedKey}'.`
      );
    }

    // 3. Verify fingerprint of staged file before moving
    const stagedHash = await this.computeFileSha256(stagedPath);
    if (stagedHash !== normalizedExpected) {
      // CRITICAL FORENSIC REQUIREMENT: Preserve staged file for investigation. DO NOT DELETE.
      throw new StorageIntegrityMismatchError(
        stagedKey,
        normalizedExpected,
        stagedHash,
        `Staged file fingerprint mismatch for '${stagedKey}': expected '${normalizedExpected}', calculated '${stagedHash}'. Promotion rejected; staged file preserved for investigation.`
      );
    }

    // 4. Ensure destination parent directory exists
    await fsp.mkdir(path.dirname(rawPath), { recursive: true });

    // 5. Atomic promotion via rename
    try {
      await fsp.rename(stagedPath, rawPath);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      // Handle cross-device rename fallback (EXDEV)
      if (code === 'EXDEV') {
        await fsp.copyFile(stagedPath, rawPath);
        const copiedHash = await this.computeFileSha256(rawPath);
        if (copiedHash === normalizedExpected) {
          await fsp.unlink(stagedPath);
        } else {
          await fsp.unlink(rawPath).catch(() => {});
          throw new StorageIntegrityMismatchError(
            rawKey,
            normalizedExpected,
            copiedHash,
            'Cross-device copy resulted in corrupted digest. Raw file purged; staged file preserved.'
          );
        }
      } else {
        throw new StorageIOError(
          `Failed to promote staged file '${stagedKey}' to '${rawKey}'.`,
          err,
          rawKey
        );
      }
    }

    const stat = await fsp.stat(rawPath);
    return {
      status: 'PROMOTED',
      rawKey,
      stagedKey,
      sha256Hex: normalizedExpected,
      sizeBytes: stat.size,
      details: 'Staged evidence promoted to permanent raw storage successfully.',
    };
  }

  /**
   * Opens a readable stream for a preserved storage key.
   */
  public async readStream(storageKey: string): Promise<NodeJS.ReadableStream> {
    const physicalPath = this.resolveSecurePath(storageKey);
    const exists = await this.pathExists(physicalPath);
    if (!exists) {
      throw new StorageFileNotFoundError(storageKey);
    }
    return fs.createReadStream(physicalPath);
  }

  /**
   * Reads the entire contents of a preserved storage object into memory.
   */
  public async readBuffer(storageKey: string): Promise<Buffer> {
    const physicalPath = this.resolveSecurePath(storageKey);
    try {
      return await fsp.readFile(physicalPath);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        throw new StorageFileNotFoundError(storageKey);
      }
      throw new StorageIOError(`Failed to read buffer for '${storageKey}'.`, err, storageKey);
    }
  }

  /**
   * Reads a byte range from a preserved storage object into memory without loading
   * the entire file into memory. Negative offset values read relative to the end of file.
   */
  public async readRange(storageKey: string, offset: number, length: number): Promise<Buffer> {
    const physicalPath = this.resolveSecurePath(storageKey);
    let handle: fsp.FileHandle | undefined;
    try {
      handle = await fsp.open(physicalPath, 'r');
      const stat = await handle.stat();
      const fileSize = stat.size;

      const actualOffset = offset < 0 ? Math.max(0, fileSize + offset) : Math.min(offset, fileSize);
      if (actualOffset >= fileSize || length <= 0) {
        return Buffer.alloc(0);
      }

      const bytesToRead = Math.min(length, fileSize - actualOffset);
      const buf = Buffer.alloc(bytesToRead);
      const { bytesRead } = await handle.read(buf, 0, bytesToRead, actualOffset);
      return bytesRead === bytesToRead ? buf : buf.subarray(0, bytesRead);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        throw new StorageFileNotFoundError(storageKey);
      }
      throw new StorageIOError(`Failed to read range for '${storageKey}'.`, err, storageKey);
    } finally {
      await handle?.close();
    }
  }

  /**
   * Checks whether a storage key exists.
   */
  public async exists(storageKey: string): Promise<boolean> {
    try {
      const physicalPath = this.resolveSecurePath(storageKey);
      return await this.pathExists(physicalPath);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves metadata (size, mtime, optional hash) without loading entire payload.
   */
  public async getMetadata(storageKey: string): Promise<StorageObjectMetadata> {
    const physicalPath = this.resolveSecurePath(storageKey);
    try {
      const stat = await fsp.stat(physicalPath);
      return {
        storageKey,
        sizeBytes: stat.size,
        lastModifiedMs: stat.mtimeMs,
      };
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        throw new StorageFileNotFoundError(storageKey);
      }
      throw new StorageIOError(`Failed to get metadata for '${storageKey}'.`, err, storageKey);
    }
  }

  /**
   * Cryptographically verifies the integrity of a stored file against an expected digest.
   */
  public async verifyIntegrity(
    storageKey: string,
    expectedSha256: string
  ): Promise<IntegrityVerificationResult> {
    const physicalPath = this.resolveSecurePath(storageKey);
    const exists = await this.pathExists(physicalPath);
    if (!exists) {
      throw new StorageFileNotFoundError(storageKey);
    }

    const calculatedSha256 = await this.computeFileSha256(physicalPath);
    const normalizedExpected = expectedSha256.toLowerCase().trim();
    const stat = await fsp.stat(physicalPath);

    return {
      storageKey,
      matches: calculatedSha256 === normalizedExpected,
      expectedSha256: normalizedExpected,
      calculatedSha256,
      sizeBytes: stat.size,
    };
  }

  /**
   * Safely deletes a file by its logical key.
   */
  public async deleteFile(storageKey: string): Promise<boolean> {
    const physicalPath = this.resolveSecurePath(storageKey);
    try {
      await fsp.unlink(physicalPath);
      return true;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        return false;
      }
      throw new StorageIOError(`Failed to delete file '${storageKey}'.`, err, storageKey);
    }
  }

  /**
   * Lists all currently lingering staged files for reconciliation.
   */
  public async listStagedFiles(): Promise<StagedFileInfo[]> {
    const stagedDir = path.resolve(this.rootPath, 'staged');
    const results: StagedFileInfo[] = [];

    const stagedExists = await this.pathExists(stagedDir);
    if (!stagedExists) {
      return results;
    }

    const scanDirectory = async (currentDir: string): Promise<void> => {
      const entries = await fsp.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const relative = path.relative(this.rootPath, fullPath).replace(/\\/g, '/');
          const stat = await fsp.stat(fullPath);
          const parsed = parseStorageKey(relative);
          const ageMs = Date.now() - stat.mtimeMs;

          results.push({
            stagedKey: relative,
            caseId: parsed?.caseId,
            evidenceId: parsed?.evidenceId,
            sizeBytes: stat.size,
            lastModifiedMs: stat.mtimeMs,
            ageMs,
          });
        }
      }
    };

    await scanDirectory(stagedDir);
    return results;
  }

  /**
   * Safely cleans up abandoned staged files older than maxAgeMs.
   *
   * Zero-Data-Loss Safety Invariant:
   * When shouldDeletePredicate is supplied, a file is ONLY deleted if the predicate
   * returns true (coordinating with Person 3 to ensure no PENDING_PROMOTION DB record exists).
   */
  public async cleanupStagedOlderThan(
    maxAgeMs: number,
    shouldDeletePredicate?: (file: StagedFileInfo) => Promise<boolean> | boolean
  ): Promise<CleanupSummary> {
    const files = await this.listStagedFiles();
    const summary: CleanupSummary = {
      inspectedCount: files.length,
      deletedCount: 0,
      retainedCount: 0,
      errors: [],
    };

    for (const file of files) {
      if (file.ageMs < maxAgeMs) {
        summary.retainedCount++;
        continue;
      }

      let shouldDelete = false;
      if (shouldDeletePredicate) {
        try {
          shouldDelete = await shouldDeletePredicate(file);
        } catch (err: unknown) {
          summary.errors.push({
            stagedKey: file.stagedKey,
            error: `Predicate execution failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          summary.retainedCount++;
          continue;
        }
      } else {
        // Without predicate, default to safe deletion only for unparsed/orphaned files
        shouldDelete = !file.evidenceId;
      }

      if (shouldDelete) {
        try {
          await this.deleteFile(file.stagedKey);
          summary.deletedCount++;
        } catch (err: unknown) {
          summary.errors.push({
            stagedKey: file.stagedKey,
            error: err instanceof Error ? err.message : String(err),
          });
          summary.retainedCount++;
        }
      } else {
        summary.retainedCount++;
      }
    }

    return summary;
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async computeFileSha256(filePath: string): Promise<string> {
    const stream = fs.createReadStream(filePath);
    const hash = createHash('sha256');

    return new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    });
  }
}
