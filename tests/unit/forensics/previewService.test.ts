/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Module H — Vault Service & Isolated Derived Preview Generator
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 2 (Lines 100, 119, 152), Phase 3 Milestone 4 (Lines 1517-1518), Threat Model TH-05
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateDerivedPreview,
  getPreviewHttpHeaders,
  verifyVaultAccess,
  PreviewSecurityError,
  VaultAccessError,
} from '../../../src/lib/forensics/previewService.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/localStorageAdapter.js';
import { getEvidenceRegister } from '../../../src/services/evidenceStore.js';
import { hashBuffer } from '../../../src/lib/forensics/streamingHasher.js';
import {
  StorageIntegrityMismatchError,
  ForensicsError,
} from '../../../src/lib/forensics/forensicsTypes.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Module H: Vault Service & Derived Preview Generator', () => {
  let tempDir: string;
  let storage: LocalStorageAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'veratrace-preview-test-'));
    storage = new LocalStorageAdapter(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
    0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x10, // 32x16 px
    0x08, 0x06, 0x00, 0x00, 0x00, 0x57, 0x35, 0x9f, 0x9b,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
  ]);

  const validJpegBuffer = Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([
      0xff, 0xc0, 0x00, 0x11, 0x08,
      0x00, 0x40, // Height: 64
      0x00, 0x80, // Width: 128
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]), // SOF0
    Buffer.from([0xff, 0xd9]), // EOI
  ]);

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (Harassment Complaint) /Author (Victim A) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );

  const validTextBuffer = Buffer.from(
    'Sender: suspect_user\nDate: 2026-10-24 10:00:00\nMessage: Pay ₹50,000 or else.\n<script>alert("xss")</script>'
  );

  describe('1. Valid Image Previews (PNG & JPEG)', () => {
    it('generates safe PNG preview, extracts dimensions, and isolates derived storage', async () => {
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-png-001';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;
      const originalSha256 = hashBuffer(validPngBuffer).sha256Hex;

      // Save raw evidence
      await storage.writeDerivedBuffer(rawKey, validPngBuffer);

      const preview = await generateDerivedPreview(storage, {
        caseId,
        evidenceId,
        storageKey: rawKey,
        sha256: originalSha256,
        mimeType: 'image/png',
        fileName: 'screenshot.png',
      });

      expect(preview.isDerivedPreview).toBe(true);
      expect(preview.evidenceId).toBe(evidenceId);
      expect(preview.caseId).toBe(caseId);
      expect(preview.previewMimeType).toBe('image/png');
      expect(preview.previewStorageKey).toBe(`derived/${caseId}/${evidenceId}.preview`);
      expect(preview.originalSha256).toBe(originalSha256);
      expect(preview.previewSha256).toBeDefined();
      expect(preview.previewSizeBytes).toBeGreaterThan(0);
      expect(preview.dimensions).toEqual({ width: 32, height: 16 });

      // Verifies preview file exists in derived/ storage separately
      const derivedExists = await storage.exists(preview.previewStorageKey);
      expect(derivedExists).toBe(true);
    });

    it('generates safe JPEG preview and extracts dimensions', async () => {
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-jpeg-002';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;
      const originalSha256 = hashBuffer(validJpegBuffer).sha256Hex;

      await storage.writeDerivedBuffer(rawKey, validJpegBuffer);

      const preview = await generateDerivedPreview(storage, {
        caseId,
        evidenceId,
        storageKey: rawKey,
        sha256: originalSha256,
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
      });

      expect(preview.isDerivedPreview).toBe(true);
      expect(preview.previewMimeType).toBe('image/jpeg');
      expect(preview.dimensions).toEqual({ width: 128, height: 64 });
    });
  });

  describe('2. PDF and Plain-Text Preview Safety', () => {
    it('generates safe PDF preview with metadata summary snippet and strict isolation', async () => {
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-pdf-003';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;
      const originalSha256 = hashBuffer(validPdfBuffer).sha256Hex;

      await storage.writeDerivedBuffer(rawKey, validPdfBuffer);

      const preview = await generateDerivedPreview(storage, {
        caseId,
        evidenceId,
        storageKey: rawKey,
        sha256: originalSha256,
        mimeType: 'application/pdf',
        fileName: 'complaint.pdf',
      });

      expect(preview.isDerivedPreview).toBe(true);
      expect(preview.previewMimeType).toBe('application/pdf');
      expect(preview.textSnippet).toBe('PDF Document - Harassment Complaint');
      expect(preview.httpHeaders['Content-Security-Policy']).toContain("default-src 'none'");
    });

    it('correctly maps page count and title from PDF metadata including singular/plural forms', async () => {
      const caseId = 'case-preview-pdf-meta';

      // 1. Multi-page PDF with title and page count
      const multiPagePdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count 4 >>\nendobj\n2 0 obj\n<< /Title (Extortion Letter) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
      );
      const multiKey = `raw/${caseId}/ev-pdf-multi.raw`;
      await storage.writeDerivedBuffer(multiKey, multiPagePdf);

      const multiPreview = await generateDerivedPreview(storage, {
        caseId,
        evidenceId: 'ev-pdf-multi',
        storageKey: multiKey,
        sha256: hashBuffer(multiPagePdf).sha256Hex,
        mimeType: 'application/pdf',
        fileName: 'extortion.pdf',
      });

      expect(multiPreview.textSnippet).toBe('PDF Document (4 pages) - Extortion Letter');

      // 2. Single-page PDF with singular 'page' formatting
      const singlePagePdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count 1 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
      );
      const singleKey = `raw/${caseId}/ev-pdf-single.raw`;
      await storage.writeDerivedBuffer(singleKey, singlePagePdf);

      const singlePreview = await generateDerivedPreview(storage, {
        caseId,
        evidenceId: 'ev-pdf-single',
        storageKey: singleKey,
        sha256: hashBuffer(singlePagePdf).sha256Hex,
        mimeType: 'application/pdf',
      });

      expect(singlePreview.textSnippet).toBe('PDF Document (1 page)');

      // 3. Fallback when both page count and title are absent
      const minimalPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
      );
      const minKey = `raw/${caseId}/ev-pdf-min.raw`;
      await storage.writeDerivedBuffer(minKey, minimalPdf);

      const minPreview = await generateDerivedPreview(storage, {
        caseId,
        evidenceId: 'ev-pdf-min',
        storageKey: minKey,
        sha256: hashBuffer(minimalPdf).sha256Hex,
        mimeType: 'application/pdf',
      });

      expect(minPreview.textSnippet).toBe('PDF Document');
    });

    it('escapes HTML tags and prevents script injection in plain-text previews (TH-05)', async () => {
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-txt-004';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;
      const originalSha256 = hashBuffer(validTextBuffer).sha256Hex;

      await storage.writeDerivedBuffer(rawKey, validTextBuffer);

      const preview = await generateDerivedPreview(storage, {
        caseId,
        evidenceId,
        storageKey: rawKey,
        sha256: originalSha256,
        mimeType: 'text/plain',
        fileName: 'chat_log.txt',
      });

      expect(preview.isDerivedPreview).toBe(true);
      expect(preview.previewMimeType).toBe('text/plain');

      // Crucial: HTML entities are escaped to prevent XSS execution
      expect(preview.textSnippet).not.toContain('<script>');
      expect(preview.textSnippet).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('enforces maximum text length cap and appends truncation indicator', async () => {
      const longText = 'A'.repeat(500);
      const buf = Buffer.from(longText, 'utf8');
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-txt-trunc';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;

      await storage.writeDerivedBuffer(rawKey, buf);

      const preview = await generateDerivedPreview(
        storage,
        {
          caseId,
          evidenceId,
          storageKey: rawKey,
          sha256: hashBuffer(buf).sha256Hex,
          mimeType: 'text/plain',
        },
        { maxTextLength: 100 }
      );

      expect(preview.textSnippet).toContain('[... Truncated for safe preview ...]');
      expect(preview.previewBuffer.length).toBe(100);
    });
  });

  describe('3. Content Validation & Malicious / Executable Rejection', () => {
    it('rejects executable scripts disguised as images or text', async () => {
      const maliciousScript = Buffer.from('#!/bin/bash\necho dangerous payload');
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-mal-001';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;

      await storage.writeDerivedBuffer(rawKey, maliciousScript);

      await expect(
        generateDerivedPreview(storage, {
          caseId,
          evidenceId,
          storageKey: rawKey,
          sha256: hashBuffer(maliciousScript).sha256Hex,
          mimeType: 'text/plain',
        })
      ).rejects.toThrow();
    });

    it('detects and rejects MIME type spoofing (claiming JPEG for PNG bytes)', async () => {
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-spoof-001';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;

      // Actual bytes are PNG, but record claims JPEG
      await storage.writeDerivedBuffer(rawKey, validPngBuffer);

      await expect(
        generateDerivedPreview(storage, {
          caseId,
          evidenceId,
          storageKey: rawKey,
          sha256: hashBuffer(validPngBuffer).sha256Hex,
          mimeType: 'image/jpeg', // Spoofed!
        })
      ).rejects.toThrow(PreviewSecurityError);
    });

    it('rejects text files containing binary null bytes', async () => {
      const binaryInText = Buffer.from('Normal text \0\x01\x02 binary payload');
      const caseId = 'case-preview-01';
      const evidenceId = 'ev-null-byte';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;

      await storage.writeDerivedBuffer(rawKey, binaryInText);

      await expect(
        generateDerivedPreview(storage, {
          caseId,
          evidenceId,
          storageKey: rawKey,
          sha256: hashBuffer(binaryInText).sha256Hex,
          mimeType: 'text/plain',
        })
      ).rejects.toThrow(ForensicsError);
    });
  });

  describe('4. Security Response Headers (TH-05 & CSP Isolation)', () => {
    it('returns strict HTTP isolation headers for safe browser iframe rendering', () => {
      const headers = getPreviewHttpHeaders('image/png', 'suspicious; filename="exploit.exe"');

      expect(headers['Content-Type']).toBe('image/png');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Content-Security-Policy']).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; sandbox"
      );
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(headers['Cache-Control']).toContain('no-transform');
      // Sanitized filename in Content-Disposition
      expect(headers['Content-Disposition']).not.toContain('"exploit.exe"');
    });
  });

  describe('5. Vault Access Control & Path Traversal Containment', () => {
    it('blocks path traversal attempts in vault access identifiers', () => {
      expect(
        verifyVaultAccess({ caseId: '../../etc', evidenceId: 'ev-01' }).authorized
      ).toBe(false);

      expect(
        verifyVaultAccess({ caseId: 'case-01', evidenceId: '../secret.key' }).authorized
      ).toBe(false);

      expect(
        verifyVaultAccess({ caseId: 'valid-case', evidenceId: 'valid-ev' }).authorized
      ).toBe(true);
    });

    it('rejects cross-case access violation when evidence belongs to a different case', () => {
      const record = { caseId: 'victim-case-A', evidenceId: 'ev-01' };

      const check = verifyVaultAccess(
        { caseId: 'attacker-case-B', evidenceId: 'ev-01' },
        record
      );

      expect(check.authorized).toBe(false);
      expect(check.reason).toContain('Cross-case access violation');
    });
  });

  describe('6. Evidence Preservation Invariant (Raw File Unmodified)', () => {
    it('mathematically confirms raw evidence bytes and SHA-256 remain 100% unchanged', async () => {
      const caseId = 'case-preserve-check';
      const evidenceId = 'ev-integrity-test';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;
      const originalSha256 = hashBuffer(validPngBuffer).sha256Hex;

      await storage.writeDerivedBuffer(rawKey, validPngBuffer);

      // Generate preview
      await generateDerivedPreview(storage, {
        caseId,
        evidenceId,
        storageKey: rawKey,
        sha256: originalSha256,
        mimeType: 'image/png',
      });

      // Read raw file again and verify SHA-256
      const afterRawBuffer = await storage.readBuffer(rawKey);
      const afterSha256 = hashBuffer(afterRawBuffer).sha256Hex;

      expect(afterSha256).toBe(originalSha256);
      expect(afterRawBuffer.equals(validPngBuffer)).toBe(true);
    });

    it('detects tampering and refuses to generate preview if raw evidence was altered', async () => {
      const caseId = 'case-tamper-check';
      const evidenceId = 'ev-tamper-test';
      const rawKey = `raw/${caseId}/${evidenceId}.raw`;

      // Save valid PNG
      await storage.writeDerivedBuffer(rawKey, validPngBuffer);

      // Claim a different SHA-256 hash (simulating tampering)
      await expect(
        generateDerivedPreview(storage, {
          caseId,
          evidenceId,
          storageKey: rawKey,
          sha256: '0000000000000000000000000000000000000000000000000000000000000000',
          mimeType: 'image/png',
        })
      ).rejects.toThrow(StorageIntegrityMismatchError);
    });
  });

  describe('7. EvidenceRegister Integration', () => {
    it('generates derived preview and preview headers through EvidenceRegister methods', async () => {
      const caseId = 'case-reg-preview';
      const register = getEvidenceRegister(caseId, storage);

      const added = await register.addRecord({
        name: 'victim_screenshot.png',
        buffer: validPngBuffer,
      });

      const preview = await register.getDerivedPreview(added.evidenceId);
      expect(preview.isDerivedPreview).toBe(true);
      expect(preview.previewMimeType).toBe('image/png');
      expect(preview.originalSha256).toBe(added.sha256);

      const headers = register.getPreviewHeaders(added.evidenceId);
      expect(headers['Content-Type']).toBe('image/png');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');

      const access = register.verifyVaultAccess(added.evidenceId);
      expect(access.authorized).toBe(true);
    });
  });
});
