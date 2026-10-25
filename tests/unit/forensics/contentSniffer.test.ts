import { describe, it, expect } from 'vitest';
import { sniffMagicBytes } from '../../../src/lib/forensics/contentSniffer.js';
import {
  EmptyStreamError,
  MalformedFileError,
  UnsupportedMediaTypeError,
} from '../../../src/lib/forensics/forensicsTypes.js';

describe('Forensics: Content Sniffer (Magic Byte Inspection)', () => {
  describe('Supported Image & Document Formats', () => {
    it('accurately identifies PNG from 8-byte magic header', () => {
      // 89 50 4E 47 0D 0A 1A 0A followed by dummy IHDR bytes
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);
      const result = sniffMagicBytes(pngHeader);

      expect(result.detectedMimeType).toBe('image/png');
      expect(result.isSupported).toBe(true);
      expect(result.details).toContain('PNG');
    });

    it('accurately identifies JPEG from SOI marker prefix (FF D8 FF)', () => {
      // FF D8 FF E0 followed by JFIF header bytes
      const jpegHeader = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const result = sniffMagicBytes(jpegHeader);

      expect(result.detectedMimeType).toBe('image/jpeg');
      expect(result.isSupported).toBe(true);
      expect(result.details).toContain('JPEG');
    });

    it('accurately identifies PDF from %PDF- header', () => {
      const pdfHeader = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\n');
      const result = sniffMagicBytes(pdfHeader);

      expect(result.detectedMimeType).toBe('application/pdf');
      expect(result.isSupported).toBe(true);
      expect(result.details).toContain('PDF');
    });

    it('accurately identifies valid UTF-8/ASCII plain text', () => {
      const textSample = Buffer.from(
        'INCIDENT REPORT\nDate: 2026-10-24\nDetails: Harassing messages received via SMS.\n'
      );
      const result = sniffMagicBytes(textSample);

      expect(result.detectedMimeType).toBe('text/plain');
      expect(result.isSupported).toBe(true);
      expect(result.details).toContain('UTF-8/ASCII');
    });

    it('accepts UTF-8 text containing unicode characters, tabs, and newlines', () => {
      const unicodeText = Buffer.from(
        'साक्ष्य विवरण (Evidence Details):\tThreat recorded at 10:30 PM.\r\nNext line.'
      );
      const result = sniffMagicBytes(unicodeText);

      expect(result.detectedMimeType).toBe('text/plain');
      expect(result.isSupported).toBe(true);
    });
  });

  describe('Explicit Rejection of Disallowed Executables & Archives', () => {
    it('rejects shell scripts with shebang (#!/bin/sh) disguised as text or other files', () => {
      const bashScript = Buffer.from('#!/bin/bash\nrm -rf /tmp/test\n');

      expect(() => sniffMagicBytes(bashScript)).toThrow(UnsupportedMediaTypeError);
      try {
        sniffMagicBytes(bashScript);
      } catch (err: unknown) {
        const sniffErr = err as UnsupportedMediaTypeError;
        expect(sniffErr.code).toBe('ERR_UNSUPPORTED_MEDIA_TYPE');
        expect(sniffErr.message).toContain('shebang');
      }
    });

    it('rejects Windows PE / DOS executable headers (MZ)', () => {
      // MZ header (0x4D, 0x5A)
      const peBinary = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

      expect(() => sniffMagicBytes(peBinary)).toThrow(UnsupportedMediaTypeError);
      try {
        sniffMagicBytes(peBinary);
      } catch (err: unknown) {
        const sniffErr = err as UnsupportedMediaTypeError;
        expect(sniffErr.code).toBe('ERR_UNSUPPORTED_MEDIA_TYPE');
        expect(sniffErr.message).toContain('Windows executable');
      }
    });

    it('rejects Linux ELF binary headers (\\x7fELF)', () => {
      const elfBinary = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

      expect(() => sniffMagicBytes(elfBinary)).toThrow(UnsupportedMediaTypeError);
      try {
        sniffMagicBytes(elfBinary);
      } catch (err: unknown) {
        const sniffErr = err as UnsupportedMediaTypeError;
        expect(sniffErr.code).toBe('ERR_UNSUPPORTED_MEDIA_TYPE');
        expect(sniffErr.message).toContain('ELF');
      }
    });

    it('rejects ZIP archives (PK\\x03\\x04) including OOXML / JAR / APK', () => {
      const zipArchive = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

      expect(() => sniffMagicBytes(zipArchive)).toThrow(UnsupportedMediaTypeError);
      try {
        sniffMagicBytes(zipArchive);
      } catch (err: unknown) {
        const sniffErr = err as UnsupportedMediaTypeError;
        expect(sniffErr.code).toBe('ERR_UNSUPPORTED_MEDIA_TYPE');
        expect(sniffErr.message).toContain('ZIP');
      }
    });

    it('rejects WebAssembly binary modules (\\0asm)', () => {
      const wasmBinary = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      expect(() => sniffMagicBytes(wasmBinary)).toThrow(UnsupportedMediaTypeError);
    });

    it('rejects Java bytecode / Mach-O fat binaries (CAFEBABE)', () => {
      const javaClass = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34]);
      expect(() => sniffMagicBytes(javaClass)).toThrow(UnsupportedMediaTypeError);
    });

    it('rejects 7-Zip, RAR, and GZIP compressed archives', () => {
      const rar = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
      const sevenZip = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
      const gzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]);

      expect(() => sniffMagicBytes(rar)).toThrow(UnsupportedMediaTypeError);
      expect(() => sniffMagicBytes(sevenZip)).toThrow(UnsupportedMediaTypeError);
      expect(() => sniffMagicBytes(gzip)).toThrow(UnsupportedMediaTypeError);
    });
  });

  describe('Null Byte and Malformed Text Detection', () => {
    it('rejects text containing binary null bytes (0x00)', () => {
      const binaryDisguised = Buffer.from('Normal text prefix\x00malicious binary remainder');

      expect(() => sniffMagicBytes(binaryDisguised)).toThrow(UnsupportedMediaTypeError);
      try {
        sniffMagicBytes(binaryDisguised);
      } catch (err: unknown) {
        const sniffErr = err as UnsupportedMediaTypeError;
        expect(sniffErr.message).toContain('null bytes');
      }
    });

    it('rejects non-printable binary control characters in text', () => {
      // 0x07 is Bell (BEL), not permitted in plain text
      const controlByteText = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x07, 0x6f]);
      expect(() => sniffMagicBytes(controlByteText)).toThrow(UnsupportedMediaTypeError);
    });

    it('rejects invalid UTF-8 sequences', () => {
      // 0xC0 and 0xC1 are invalid UTF-8 start bytes
      const invalidUtf8 = Buffer.from([0xc0, 0xaf, 0x61, 0x62, 0x63]);
      expect(() => sniffMagicBytes(invalidUtf8)).toThrow(UnsupportedMediaTypeError);
    });
  });

  describe('Boundary Checks: Empty & Truncated Headers', () => {
    it('throws EmptyStreamError on zero-byte buffer', () => {
      expect(() => sniffMagicBytes(Buffer.alloc(0))).toThrow(EmptyStreamError);
    });

    it('throws MalformedFileError when buffer is under 4 bytes', () => {
      expect(() => sniffMagicBytes(Buffer.from([0x41, 0x42]))).toThrow(MalformedFileError);
    });

    it('throws MalformedFileError on truncated PNG header (under 8 bytes)', () => {
      const truncatedPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);
      expect(() => sniffMagicBytes(truncatedPng)).toThrow(MalformedFileError);
    });

    it('throws MalformedFileError on truncated PDF header', () => {
      const truncatedPdf = Buffer.from('%PDF');
      expect(() => sniffMagicBytes(truncatedPdf)).toThrow(MalformedFileError);
    });
  });
});
