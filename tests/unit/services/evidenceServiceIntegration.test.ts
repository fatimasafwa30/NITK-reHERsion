import { describe, it, expect, beforeEach } from 'vitest';
import { Buffer } from 'buffer';
import {
  processEvidenceFile,
  recheckEvidenceIntegrity,
  getEvidenceForCase,
  getEvidenceById,
  clearEvidenceForCase,
  subscribeEvidence,
  sanitizeFilename,
  computeSha256,
  storeEvidenceBlob,
  updateEvidenceVerificationStatus,
  getProvenanceEventsForCase,
  VerificationStatus,
} from '../../../src/services/evidenceService.js';
import {
  getTimelineForCase,
  addTimelineEventForCase,
  clearTimelineForCase,
  subscribeTimeline,
} from '../../../src/services/timelineService.js';
import {
  QuotaExceededError,
  EmptyStreamError,
  UnsupportedMediaTypeError,
} from '../../../src/lib/forensics/forensicsTypes.js';

describe('Evidence Service & UI Integration Pipeline', () => {
  const caseId = 'case_ui_test_1001';

  beforeEach(() => {
    clearEvidenceForCase(caseId);
    clearTimelineForCase(caseId);
  });

  describe('Filename Sanitization', () => {
    it('sanitizes dangerous characters and directory traversal prefixes', () => {
      expect(sanitizeFilename('../../../etc/passwd.png')).toBe('passwd.png');
      expect(sanitizeFilename('C:\\Users\\Victim\\Desktop\\photo.jpeg')).toBe('photo.jpeg');
      expect(sanitizeFilename('file<with>illegal:chars?.pdf')).toBe('file_with_illegal_chars_.pdf');
      expect(sanitizeFilename('')).toBe('unnamed_evidence');
      // @ts-ignore
      expect(sanitizeFilename(null)).toBe('unnamed_evidence');
    });
  });

  describe('SHA-256 Computation', () => {
    it('computes accurate lowercase 64-character SHA-256 digest', async () => {
      const data = new TextEncoder().encode('VeraTrace Forensic Evidence Test');
      const hash = await computeSha256(data);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash.length).toBe(64);
    });
  });

  describe('Quota & Format Validation', () => {
    it('rejects files exceeding the 50 MiB limit', async () => {
      const oversizedFile = {
        name: 'huge_file.pdf',
        size: 52_428_801, // 50 MiB + 1 byte
        slice: () => new Uint8Array(0),
        arrayBuffer: async () => new ArrayBuffer(0),
      };

      await expect(processEvidenceFile(caseId, oversizedFile as any)).rejects.toThrow(
        QuotaExceededError
      );
    });

    it('rejects empty files (0 bytes)', async () => {
      const emptyFile = {
        name: 'empty.png',
        size: 0,
        slice: () => new Uint8Array(0),
        arrayBuffer: async () => new ArrayBuffer(0),
      };

      await expect(processEvidenceFile(caseId, emptyFile as any)).rejects.toThrow(
        EmptyStreamError
      );
    });

    it('rejects disallowed executable binaries (e.g. Windows PE MZ header)', async () => {
      const peBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const exeFile = {
        name: 'malicious.exe',
        size: peBytes.length,
        slice: () => ({
          arrayBuffer: async () => peBytes.buffer.slice(0, peBytes.length),
        }),
        arrayBuffer: async () => peBytes.buffer.slice(0, peBytes.length),
      };

      await expect(processEvidenceFile(caseId, exeFile as any)).rejects.toThrow(
        UnsupportedMediaTypeError
      );
    });

    it('rejects disallowed archives (e.g. ZIP container)', async () => {
      const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const zipFile = {
        name: 'archive.zip',
        size: zipBytes.length,
        slice: () => ({
          arrayBuffer: async () => zipBytes.buffer.slice(0, zipBytes.length),
        }),
        arrayBuffer: async () => zipBytes.buffer.slice(0, zipBytes.length),
      };

      await expect(processEvidenceFile(caseId, zipFile as any)).rejects.toThrow(
        UnsupportedMediaTypeError
      );
    });
  });

  describe('Forensic Processing Pipeline', () => {
    it('successfully processes a valid PNG file, computes SHA-256, and links to timeline', async () => {
      // 8-byte PNG signature followed by IHDR chunk
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, // IHDR length
        0x49, 0x48, 0x44, 0x52, // 'IHDR'
        0x00, 0x00, 0x01, 0x00, // width 256
        0x00, 0x00, 0x01, 0x00, // height 256
        0x08, 0x02, 0x00, 0x00, 0x00,
        0x90, 0x77, 0x53, 0xde, // CRC
      ]);

      const file = {
        name: 'screenshot-chat.png',
        size: pngBytes.length,
        slice: (start = 0, end = pngBytes.length) => ({
          arrayBuffer: async () => pngBytes.slice(start, end).buffer,
        }),
        arrayBuffer: async () => pngBytes.buffer.slice(0, pngBytes.length),
      };

      const record = await processEvidenceFile(caseId, file as any, 'WhatsApp Screenshot');

      expect(record).toBeDefined();
      expect(record.fileName).toBe('screenshot-chat.png');
      expect(record.mimeType).toBe('image/png');
      expect(record.sizeBytes).toBe(pngBytes.length);
      expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.verificationStatus).toBe(VerificationStatus.MATCH);
      expect(record.intakeStatus).toBe('PROMOTED');
      expect(record.userClaimedSource).toBe('WhatsApp Screenshot');

      // Verify registration in evidence store
      const allEvidence = getEvidenceForCase(caseId);
      expect(allEvidence).toHaveLength(1);
      expect(allEvidence[0].evidenceId).toBe(record.evidenceId);

      // Verify registration in timeline store
      const timeline = getTimelineForCase(caseId);
      expect(timeline.length).toBeGreaterThanOrEqual(1);
      expect(timeline.some((e) => e.relatedEvidenceId === record.evidenceId)).toBe(true);

      // Verify provenance audit trail was recorded
      const provenance = getProvenanceEventsForCase(caseId);
      expect(provenance.some((p) => p.eventType === 'FILE_INTAKE_RECEIVED')).toBe(true);
      expect(provenance.some((p) => p.eventType === 'MAGIC_BYTES_VERIFIED')).toBe(true);
      expect(provenance.some((p) => p.eventType === 'STREAMING_SHA256_COMPUTED')).toBe(true);
      expect(provenance.some((p) => p.eventType === 'RAW_PROMOTION_COMMITTED')).toBe(true);
    });

    it('processes a large PDF (> 64 KiB) inspecting the tail buffer for trailer metadata', async () => {
      const header = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
      const trailer = Buffer.from(
        'trailer\n<< /Root 1 0 R /Info << /CreationDate (D:20261015120000+05\'30\') >> >>\nstartxref\n12345\n%%EOF'
      );
      const totalSize = 70_000;
      const fullBuffer = Buffer.alloc(totalSize, 0x20); // space padding
      header.copy(fullBuffer, 0);
      trailer.copy(fullBuffer, totalSize - trailer.length);

      const file = {
        name: 'harassment-email-thread.pdf',
        size: totalSize,
        slice: (start = 0, end = totalSize) => {
          const actualStart = start < 0 ? Math.max(0, totalSize + start) : start;
          const actualEnd = end < 0 ? Math.max(0, totalSize + end) : end;
          const sliced = fullBuffer.subarray(actualStart, actualEnd);
          return {
            arrayBuffer: async () => sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength),
          };
        },
        arrayBuffer: async () => fullBuffer.buffer.slice(fullBuffer.byteOffset, fullBuffer.byteOffset + fullBuffer.byteLength),
      };

      const record = await processEvidenceFile(caseId, file as any);

      expect(record.mimeType).toBe('application/pdf');
      expect(record.extractedMetadata?.status).toBe('SUCCESS');
      expect(record.extractedMetadata?.extractedFileTimeUtc).toBeDefined();
    });

    it('processes valid plain text UTF-8 evidence', async () => {
      const text = 'Transcript of voice recording from harassment incident.\nDate: 2026-10-18';
      const textBytes = new TextEncoder().encode(text);

      const file = {
        name: 'transcript.txt',
        size: textBytes.length,
        slice: (start = 0, end = textBytes.length) => ({
          arrayBuffer: async () => textBytes.slice(start, end).buffer,
        }),
        arrayBuffer: async () => textBytes.buffer.slice(0, textBytes.length),
      };

      const record = await processEvidenceFile(caseId, file as any);

      expect(record.mimeType).toBe('text/plain');
      expect(record.verificationStatus).toBe('MATCH');
    });
  });

  describe('Integrity Re-Verification Flow', () => {
    it('verifies an unaltered file rechecks as MATCH', async () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x01]);
      const file = {
        name: 'doc.png',
        size: bytes.length,
        slice: () => ({ arrayBuffer: async () => bytes.buffer.slice(0, bytes.length) }),
        arrayBuffer: async () => bytes.buffer.slice(0, bytes.length),
      };

      const record = await processEvidenceFile(caseId, file as any);
      storeEvidenceBlob(record.evidenceId, bytes.buffer as any);

      const status = await recheckEvidenceIntegrity(record.evidenceId);
      expect(status).toBe(VerificationStatus.MATCH);

      const updated = getEvidenceById(record.evidenceId);
      expect(updated?.verificationStatus).toBe(VerificationStatus.MATCH);
    });

    it('detects byte tampering and updates status to MISMATCH', async () => {
      const originalBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x01]);
      const file = {
        name: 'doc.png',
        size: originalBytes.length,
        slice: () => ({ arrayBuffer: async () => originalBytes.buffer.slice(0, originalBytes.length) }),
        arrayBuffer: async () => originalBytes.buffer.slice(0, originalBytes.length),
      };

      const record = await processEvidenceFile(caseId, file as any);

      // Simulate bit tampering
      const tamperedBytes = new Uint8Array(originalBytes);
      tamperedBytes[tamperedBytes.length - 1] = 0xff;
      storeEvidenceBlob(record.evidenceId, tamperedBytes.buffer as any);

      const status = await recheckEvidenceIntegrity(record.evidenceId);
      expect(status).toBe(VerificationStatus.MISMATCH);

      const updated = getEvidenceById(record.evidenceId);
      expect(updated?.verificationStatus).toBe(VerificationStatus.MISMATCH);

      // Verify audit provenance was logged
      const provenance = getProvenanceEventsForCase(caseId);
      const auditEvt = provenance.find((p) => p.eventType === 'VERIFICATION_AUDIT_EXECUTED');
      expect(auditEvt).toBeDefined();
      expect(auditEvt?.eventOutcome).toBe('FAILED');
    });

    it('verifies initial mock records by 64-char hex format when bytes are uncached', async () => {
      const record = {
        evidenceId: 'ev_mock_unverified',
        caseId,
        fileName: 'unverified-doc.pdf',
        originalFilename: 'unverified-doc.pdf',
        mimeType: 'application/pdf' as const,
        sizeBytes: 1000,
        recordedAt: new Date().toISOString(),
        sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        verificationStatus: VerificationStatus.UNVERIFIED,
        storageKey: `cases/${caseId}/raw/ev_mock_unverified`,
        intakeStatus: 'PROMOTED' as const,
      };

      updateEvidenceVerificationStatus(record.evidenceId, record.verificationStatus);
      // Directly sync
      const { syncEvidenceRecord } = await import('../../../src/services/evidenceService.js');
      syncEvidenceRecord(caseId, record);

      const status = await recheckEvidenceIntegrity(record.evidenceId);
      expect(status).toBe(VerificationStatus.MATCH);
    });
  });

  describe('Reactive Subscriptions', () => {
    it('notifies evidence listeners when new files are processed', async () => {
      let notified = false;
      const unsubscribe = subscribeEvidence(caseId, () => {
        notified = true;
      });

      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const file = {
        name: 'reactive.png',
        size: bytes.length,
        slice: () => ({ arrayBuffer: async () => bytes.buffer.slice(0, bytes.length) }),
        arrayBuffer: async () => bytes.buffer.slice(0, bytes.length),
      };

      await processEvidenceFile(caseId, file as any);

      expect(notified).toBe(true);
      unsubscribe();
    });

    it('notifies timeline listeners when timeline events are added', () => {
      let timelineNotified = false;
      const unsubscribe = subscribeTimeline(caseId, () => {
        timelineNotified = true;
      });

      addTimelineEventForCase(caseId, {
        caseId,
        label: 'Verbal threat occurred',
        occurredAt: '2026-10-10T11:00:00.000Z',
        timeConfidence: 'uncertain',
      });

      expect(timelineNotified).toBe(true);
      unsubscribe();
    });
  });
});