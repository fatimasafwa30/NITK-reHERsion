import { describe, it, expect } from 'vitest';
import {
  extractMetadata,
} from '../../../src/lib/forensics/metadataExtractor.js';

describe('Forensics: Metadata Extractor & Timestamp Taxonomy Classifier', () => {
  describe('JPEG EXIF & Dimension Extraction', () => {
    function createMockJpegWithExif(): Buffer {
      // 1. TIFF Header & IFD0 in Little-Endian
      const tiffBuffer = Buffer.alloc(120);
      let p = 0;

      // Endian 'II', Magic 42, Offset to IFD0 (8)
      tiffBuffer.write('II', p); p += 2;
      tiffBuffer.writeUInt16LE(0x002a, p); p += 2;
      tiffBuffer.writeUInt32LE(0x00000008, p); p += 4;

      // IFD0 entry count: 3 entries
      tiffBuffer.writeUInt16LE(3, p); p += 2;

      // Entry 1: Model (tag 0x0110, type 2 ASCII, count 8)
      tiffBuffer.writeUInt16LE(0x0110, p); p += 2;
      tiffBuffer.writeUInt16LE(2, p); p += 2;
      tiffBuffer.writeUInt32LE(8, p); p += 4;
      tiffBuffer.writeUInt32LE(50, p); p += 4; // offset 50

      // Entry 2: DateTime (tag 0x0132, type 2 ASCII, count 20)
      tiffBuffer.writeUInt16LE(0x0132, p); p += 2;
      tiffBuffer.writeUInt16LE(2, p); p += 2;
      tiffBuffer.writeUInt32LE(20, p); p += 4;
      tiffBuffer.writeUInt32LE(60, p); p += 4; // offset 60

      // Entry 3: OffsetTime (tag 0x9010, type 2 ASCII, count 7)
      tiffBuffer.writeUInt16LE(0x9010, p); p += 2;
      tiffBuffer.writeUInt16LE(2, p); p += 2;
      tiffBuffer.writeUInt32LE(7, p); p += 4;
      tiffBuffer.writeUInt32LE(85, p); p += 4; // offset 85

      // String values
      tiffBuffer.write('Pixel 7\0', 50, 'ascii');
      tiffBuffer.write('2026:10:24 15:30:00\0', 60, 'ascii');
      tiffBuffer.write('+05:30\0', 85, 'ascii');

      // 2. Assemble JPEG segments
      const app1Length = 2 + 6 + tiffBuffer.length;
      const app1Header = Buffer.alloc(10);
      app1Header[0] = 0xff;
      app1Header[1] = 0xe1; // APP1
      app1Header.writeUInt16BE(app1Length, 2);
      app1Header.write('Exif\0\0', 4, 'ascii');

      // SOF0 (Dimensions: 1920 x 1080)
      const sof0 = Buffer.from([
        0xff, 0xc0, 0x00, 0x11, 0x08,
        0x04, 0x38, // Height: 1080
        0x07, 0x80, // Width: 1920
        0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      ]);

      const soi = Buffer.from([0xff, 0xd8]);
      const eoi = Buffer.from([0xff, 0xd9]);

      return Buffer.concat([soi, app1Header, tiffBuffer, sof0, eoi]);
    }

    it('extracts camera model, dimensions, and Tier 2 EXIF timestamp from JPEG', () => {
      const jpegBuf = createMockJpegWithExif();
      const result = extractMetadata(jpegBuf, 'image/jpeg');

      expect(result.status).toBe('SUCCESS');
      expect(result.detectedMimeType).toBe('image/jpeg');
      expect(result.metadata.format).toBe('JPEG');

      // Check extracted EXIF fields
      const exif = result.metadata.exif as Record<string, unknown>;
      expect(exif).toBeDefined();
      expect(exif.model).toBe('Pixel 7');

      // Check extracted dimensions
      const dims = result.metadata.dimensions as Record<string, unknown>;
      expect(dims.width).toBe(1920);
      expect(dims.height).toBe(1080);

      // Check Tier 2 timestamp classification
      expect(result.embeddedTimeConfidence).toBe('UNVERIFIED_DEVICE_METADATA');
      expect(result.extractedFileTimezone).toBe('+05:30');
      // 15:30:00 at +05:30 corresponds to 10:00:00 UTC
      expect(result.extractedFileTimeUtc).toBe('2026-10-24T10:00:00.000Z');
    });

    it('handles JPEG without EXIF metadata gracefully with SUCCESS status', () => {
      // JPEG with SOI, complete SOF0 (11 bytes: 2 length + 1 precision + 2 height + 2 width + 1 channel + 3 component info), and EOI
      const minimalJpeg = Buffer.from([
        0xff, 0xd8,
        0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00,
        0xff, 0xd9,
      ]);
      const result = extractMetadata(minimalJpeg, 'image/jpeg');

      expect(result.status).toBe('SUCCESS');
      expect(result.extractedFileTimeUtc).toBeNull();
      expect(result.embeddedTimeConfidence).toBe('UNVERIFIED_DEVICE_METADATA');
    });
  });

  describe('PNG Chunk & Timestamp Extraction', () => {
    function createMockPngWithTime(): Buffer {
      const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      // IHDR: 800 x 600, 8-bit RGBA
      const ihdrData = Buffer.alloc(13);
      ihdrData.writeUInt32BE(800, 0);
      ihdrData.writeUInt32BE(600, 4);
      ihdrData[8] = 8;  // bit depth
      ihdrData[9] = 6;  // RGBA
      ihdrData[10] = 0; // compression
      ihdrData[11] = 0; // filter
      ihdrData[12] = 0; // interlace

      const ihdrChunk = Buffer.alloc(12 + 13);
      ihdrChunk.writeUInt32BE(13, 0);
      ihdrChunk.write('IHDR', 4, 'ascii');
      ihdrData.copy(ihdrChunk, 8);
      ihdrChunk.writeUInt32BE(0, 21); // dummy CRC

      // tIME: 2026-10-24 14:30:00 UTC
      const timeData = Buffer.alloc(7);
      timeData.writeUInt16BE(2026, 0); // year
      timeData[2] = 10; // month
      timeData[3] = 24; // day
      timeData[4] = 14; // hour
      timeData[5] = 30; // min
      timeData[6] = 0;  // sec

      const timeChunk = Buffer.alloc(12 + 7);
      timeChunk.writeUInt32BE(7, 0);
      timeChunk.write('tIME', 4, 'ascii');
      timeData.copy(timeChunk, 8);
      timeChunk.writeUInt32BE(0, 15); // dummy CRC

      // tEXt: Software=VeraTraceCapture
      const textRaw = Buffer.from('Software\0VeraTraceCapture', 'latin1');
      const textChunk = Buffer.alloc(12 + textRaw.length);
      textChunk.writeUInt32BE(textRaw.length, 0);
      textChunk.write('tEXt', 4, 'ascii');
      textRaw.copy(textChunk, 8);
      textChunk.writeUInt32BE(0, 8 + textRaw.length);

      // IEND
      const iendChunk = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

      return Buffer.concat([sig, ihdrChunk, timeChunk, textChunk, iendChunk]);
    }

    it('extracts dimensions, tIME timestamp, and tEXt chunks from PNG', () => {
      const pngBuf = createMockPngWithTime();
      const result = extractMetadata(pngBuf, 'image/png');

      expect(result.status).toBe('SUCCESS');
      expect(result.detectedMimeType).toBe('image/png');

      // Check dimensions
      const dims = result.metadata.dimensions as Record<string, unknown>;
      expect(dims.width).toBe(800);
      expect(dims.height).toBe(600);

      // Check tEXt chunk
      const textChunks = result.metadata.textChunks as Record<string, string>;
      expect(textChunks.Software).toBe('VeraTraceCapture');

      // Check Tier 2 timestamp
      expect(result.embeddedTimeConfidence).toBe('UNVERIFIED_DEVICE_METADATA');
      expect(result.extractedFileTimeUtc).toBe('2026-10-24T14:30:00.000Z');
      expect(result.extractedFileTimezone).toBe('UTC');
    });
  });

  describe('PDF Document Metadata Extraction', () => {
    it('extracts PDF version, title, author, and creation date from standard small PDF (< 64 KiB)', () => {
      const pdfText =
        '%PDF-1.7\n' +
        '1 0 obj\n' +
        '<< /Title (Threatening Message Log) /Author (Complainant) /CreationDate (D:20261024220000+05\'30\') >>\n' +
        'endobj\n' +
        '2 0 obj\n<< /Type /Page >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page >>\nendobj\n' +
        'trailer\n<< /Root 1 0 R >>\n%%EOF';

      const pdfBuf = Buffer.from(pdfText, 'latin1');
      const result = extractMetadata(pdfBuf, 'application/pdf');

      expect(result.status).toBe('SUCCESS');
      expect(result.detectedMimeType).toBe('application/pdf');
      expect(result.metadata.pdfVersion).toBe('1.7');

      const info = result.metadata.info as Record<string, string>;
      expect(info.title).toBe('Threatening Message Log');
      expect(info.author).toBe('Complainant');

      expect(result.metadata.estimatedPageCount).toBe(2);

      // 22:00:00 at +05:30 -> 16:30:00 UTC
      expect(result.extractedFileTimeUtc).toBe('2026-10-24T16:30:00.000Z');
      expect(result.extractedFileTimezone).toBe('+05:30');
      expect(result.embeddedTimeConfidence).toBe('UNVERIFIED_DEVICE_METADATA');
    });

    it('extracts trailer metadata from a large synthetic PDF (> 64 KiB) when metadata is placed near the end', () => {
      // Build a synthetic valid PDF with > 64 KiB of content between header and trailer
      const headerPart =
        '%PDF-1.6\n' +
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Count 5 /Kids [3 0 R] >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page >>\nendobj\n' +
        '4 0 obj\n<< /Length 72000 >>\nstream\n';

      // Insert 72,000 bytes of padding so the file exceeds 64 KiB (65,536 bytes)
      const padding = 'X'.repeat(72000);

      const trailerPart =
        '\nendstream\nendobj\n' +
        '5 0 obj\n<< /Title (Stalking Evidence Export) /Author (Officer Sharma) /CreationDate (D:20261025114500+05\'30\') /ModDate (D:20261025120000+05\'30\') >>\nendobj\n' +
        'trailer\n<< /Root 1 0 R /Info 5 0 R >>\n%%EOF\n';

      const largePdfBuf = Buffer.from(headerPart + padding + trailerPart, 'latin1');
      expect(largePdfBuf.length).toBeGreaterThan(65536);

      // Verify direct extraction on the complete large buffer
      const result = extractMetadata(largePdfBuf, 'application/pdf');

      expect(result.status).toBe('SUCCESS');
      expect(result.detectedMimeType).toBe('application/pdf');
      expect(result.metadata.pdfVersion).toBe('1.6');

      const info = result.metadata.info as Record<string, string>;
      expect(info).toBeDefined();
      expect(info.title).toBe('Stalking Evidence Export');
      expect(info.author).toBe('Officer Sharma');

      // 11:45:00 at +05:30 -> 06:15:00 UTC
      expect(result.extractedFileTimeUtc).toBe('2026-10-25T06:15:00.000Z');
      expect(result.extractedFileTimezone).toBe('+05:30');
      expect(result.embeddedTimeConfidence).toBe('UNVERIFIED_DEVICE_METADATA');
      expect(result.metadata.estimatedPageCount).toBe(5);
    });

    it('extracts metadata from large PDF using separate header and tail buffers (streaming pipeline mode)', () => {
      // Simulate memory-bounded pipeline: only 64 KiB header and 64 KiB tail available
      const headerPart =
        '%PDF-1.5\n' +
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Count 3 >>\nendobj\n' +
        '3 0 obj\n<< /Length 80000 >>\nstream\n';

      const padding = 'Y'.repeat(80000);

      const trailerPart =
        '\nendstream\nendobj\n' +
        '4 0 obj\n<< /Title (WhatsApp Harassment Export) /CreationDate (D:20261025173000Z) >>\nendobj\n' +
        'trailer\n<< /Root 1 0 R /Info 4 0 R >>\n%%EOF\n';

      const fullLargePdf = Buffer.from(headerPart + padding + trailerPart, 'latin1');
      expect(fullLargePdf.length).toBeGreaterThan(80000);

      // Slice leading 64 KiB and trailing 64 KiB (simulating readRange)
      const headerSlice = fullLargePdf.subarray(0, 65536);
      const tailSlice = fullLargePdf.subarray(fullLargePdf.length - 65536);

      const result = extractMetadata(headerSlice, 'application/pdf', { tailBuffer: tailSlice });

      expect(result.status).toBe('SUCCESS');
      expect(result.detectedMimeType).toBe('application/pdf');
      expect(result.metadata.pdfVersion).toBe('1.5');

      const info = result.metadata.info as Record<string, string>;
      expect(info).toBeDefined();
      expect(info.title).toBe('WhatsApp Harassment Export');

      expect(result.extractedFileTimeUtc).toBe('2026-10-25T17:30:00.000Z');
      expect(result.extractedFileTimezone).toBe('Z');
      expect(result.metadata.estimatedPageCount).toBe(3);
    });
  });

  describe('Plain Text Statistics Extraction', () => {
    it('extracts word count, line count, character count, and detects UTF-8', () => {
      const plainText = 'Case: Harassment Report\nDate: 2026-10-24\nDetails: Cyberbullying via WhatsApp.\n';
      const textBuf = Buffer.from(plainText, 'utf8');

      const result = extractMetadata(textBuf, 'text/plain');

      expect(result.status).toBe('SUCCESS');
      expect(result.detectedMimeType).toBe('text/plain');

      const meta = result.metadata;
      expect(meta.format).toBe('PLAIN_TEXT');
      expect(meta.characterCount).toBe(plainText.length);
      expect(meta.lineCount).toBe(4);
      expect(meta.wordCount).toBe(9);
      expect(meta.encoding).toBe('US-ASCII');

      // Plain text has no embedded device timestamps
      expect(result.extractedFileTimeUtc).toBeNull();
      expect(result.embeddedTimeConfidence).toBe('NOT_APPLICABLE');
    });
  });

  describe('Corrupt / Malformed Metadata Resilience', () => {
    it('returns PARTIAL_WARNING without throwing when metadata header is truncated or corrupt', () => {
      // JPEG SOI with truncated APP1 header
      const truncatedJpeg = Buffer.from([
        0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      ]);

      const result = extractMetadata(truncatedJpeg, 'image/jpeg');

      // Should not throw, should capture partial warning
      expect(result.status).toBe('PARTIAL_WARNING');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.extractedFileTimeUtc).toBeNull();
    });
  });
});
