/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Metadata Extractor & Timestamp Taxonomy Classifier
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 1.3 & 6.2)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * FORENSIC PRINCIPLE (Blueprint Section 1.3):
 * Extracted device timestamps and EXIF header fields originate from untrusted client
 * hardware clocks that are easily manipulated, desynchronized, or spoofed.
 * All file-embedded dates are strictly classified under Tier 2 as UNVERIFIED_DEVICE_METADATA.
 * Extraction failure or corrupt headers MUST NEVER alter or corrupt raw preserved evidence bytes.
 */

import { Buffer } from 'buffer';
import { SupportedMimeType } from './forensicsTypes.js';

export type ExtractionStatus = 'SUCCESS' | 'PARTIAL_WARNING' | 'FAILED' | 'NOT_APPLICABLE';

export interface ExtractedMetadataResult {
  /** Outcome status of metadata extraction */
  status: ExtractionStatus;
  /** MIME type verified for the extracted payload */
  detectedMimeType: SupportedMimeType;
  /**
   * Tier 2 File-Embedded Metadata Time (UTC ISO 8601 string), or null if not present.
   * NOTE: Subject to device clock errors; unverified.
   */
  extractedFileTimeUtc: string | null;
  /** Extracted timezone offset (e.g. '+05:30' or 'Z'), or null */
  extractedFileTimezone: string | null;
  /** Fixed confidence classification per Blueprint Section 1.3 */
  embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA' | 'NOT_APPLICABLE';
  /** Structured raw metadata object */
  metadata: Record<string, unknown>;
  /** Non-fatal warnings encountered during extraction */
  warnings: string[];
}

export interface MetadataExtractionOptions {
  /**
   * Optional trailing bytes of the evidence file (e.g. last 64 KiB)
   * used to inspect end-of-file metadata (such as PDF trailers) without loading the entire file into memory.
   */
  tailBuffer?: Buffer | Uint8Array;
}

/**
 * Safely extracts metadata and embedded Tier 2 timestamps from an evidence buffer.
 *
 * Guaranteed safe: never throws uncaught exceptions; malformed or malicious
 * headers return status 'PARTIAL_WARNING' or 'FAILED' with safe diagnostics.
 *
 * @param buffer In-memory file buffer (leading slice or full content)
 * @param mimeType The verified MIME type from contentSniffer
 * @param options Optional configuration including tailBuffer for end-of-file trailer inspection
 * @returns ExtractedMetadataResult
 */
export function extractMetadata(
  buffer: Buffer | Uint8Array,
  mimeType: SupportedMimeType,
  options?: MetadataExtractionOptions | Buffer | Uint8Array
): ExtractedMetadataResult {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const tailBuf = options
    ? Buffer.isBuffer(options) || options instanceof Uint8Array
      ? Buffer.isBuffer(options)
        ? options
        : Buffer.from(options)
      : options.tailBuffer
      ? Buffer.isBuffer(options.tailBuffer)
        ? options.tailBuffer
        : Buffer.from(options.tailBuffer)
      : undefined
    : undefined;

  try {
    switch (mimeType) {
      case 'image/jpeg':
        return extractJpegMetadata(buf);
      case 'image/png':
        return extractPngMetadata(buf);
      case 'application/pdf':
        return extractPdfMetadata(buf, tailBuf);
      case 'text/plain':
        return extractTextMetadata(buf);
      default:
        return {
          status: 'NOT_APPLICABLE',
          detectedMimeType: mimeType,
          extractedFileTimeUtc: null,
          extractedFileTimezone: null,
          embeddedTimeConfidence: 'NOT_APPLICABLE',
          metadata: {},
          warnings: [`Unsupported MIME type for metadata extraction: ${mimeType}`],
        };
    }
  } catch (err: unknown) {
    return {
      status: 'FAILED',
      detectedMimeType: mimeType,
      extractedFileTimeUtc: null,
      extractedFileTimezone: null,
      embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA',
      metadata: {},
      warnings: [`Unexpected metadata extraction error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// ============================================================================
// JPEG EXIF / JFIF METADATA EXTRACTION
// ============================================================================

function extractJpegMetadata(buf: Buffer): ExtractedMetadataResult {
  const warnings: string[] = [];
  const meta: Record<string, unknown> = { format: 'JPEG' };
  let extractedTimeUtc: string | null = null;
  let extractedTimezone: string | null = null;

  try {
    let offset = 2; // Skip SOI (FF D8)
    while (offset < buf.length - 4) {
      if (buf[offset] !== 0xff) break;

      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);

      if (offset + 2 + length > buf.length) {
        warnings.push('Premature end of JPEG file while reading segment');
      }

      // Stop scanning at SOS (Start of Scan)
      if (marker === 0xda || marker === 0xd9) break;

      // APP0 (JFIF)
      if (marker === 0xe0 && length >= 16) {
        const jfifIdentifier = buf.toString('ascii', offset + 4, offset + 8);
        if (jfifIdentifier === 'JFIF') {
          meta.jfif = {
            version: `${buf[offset + 9]}.${buf[offset + 10]}`,
            densityUnits: buf[offset + 11],
            xDensity: buf.readUInt16BE(offset + 12),
            yDensity: buf.readUInt16BE(offset + 14),
          };
        }
      }

      // APP1 (Exif)
      if (marker === 0xe1 && length >= 14) {
        const exifHeader = buf.toString('ascii', offset + 4, offset + 8);
        if (exifHeader === 'Exif') {
          const tiffStart = offset + 10;
          parseExifTiff(buf, tiffStart, meta, warnings);
        }
      }

      // SOF0 (Baseline DCT) / SOF2 (Progressive) -> Image Dimensions
      if ((marker === 0xc0 || marker === 0xc2) && length >= 8) {
        meta.dimensions = {
          bitsPerSample: buf[offset + 4],
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
          colorChannels: buf[offset + 9],
        };
      }

      offset += 2 + length;
    }

    // Process extracted timestamps if found in EXIF
    const exif = meta.exif as Record<string, unknown> | undefined;
    if (exif) {
      const rawDate = (exif.dateTimeOriginal || exif.dateTime) as string | undefined;
      const rawOffset = exif.offsetTimeOriginal || exif.offsetTime;
      if (typeof rawDate === 'string') {
        const parsed = parseExifDateString(rawDate, typeof rawOffset === 'string' ? rawOffset : undefined);
        if (parsed) {
          extractedTimeUtc = parsed.utcIso;
          extractedTimezone = parsed.timezone;
        } else {
          warnings.push(`Malformed EXIF datetime format: '${rawDate}'`);
        }
      }
    }
  } catch (err: unknown) {
    warnings.push(`Partial JPEG metadata scan failure: ${err instanceof Error ? err.message : String(err)}`);
  }

  const status: ExtractionStatus =
    warnings.length > 0 ? 'PARTIAL_WARNING' : 'SUCCESS';

  return {
    status,
    detectedMimeType: 'image/jpeg',
    extractedFileTimeUtc: extractedTimeUtc,
    extractedFileTimezone: extractedTimezone,
    embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA',
    metadata: meta,
    warnings,
  };
}

function parseExifTiff(
  buf: Buffer,
  start: number,
  meta: Record<string, unknown>,
  warnings: string[]
): void {
  if (start + 8 > buf.length) {
    warnings.push('Truncated EXIF TIFF header');
    return;
  }

  const endianMarker = buf.toString('ascii', start, start + 2);
  const isLittle = endianMarker === 'II'; // Intel
  const isBig = endianMarker === 'MM'; // Motorola

  if (!isLittle && !isBig) {
    warnings.push('Invalid TIFF endianness marker in EXIF');
    return;
  }

  const readU16 = (o: number) => (isLittle ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const readU32 = (o: number) => (isLittle ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

  const magic = readU16(start + 2);
  if (magic !== 0x002a) {
    warnings.push('Invalid TIFF magic 42 in EXIF');
    return;
  }

  const ifd0Offset = readU32(start + 4);
  if (start + ifd0Offset >= buf.length) return;

  const exifData: Record<string, unknown> = {};

  const readIfdEntries = (ifdStart: number) => {
    if (ifdStart + 2 > buf.length) return;
    const entryCount = readU16(ifdStart);
    let entryOffset = ifdStart + 2;

    for (let i = 0; i < entryCount; i++) {
      if (entryOffset + 12 > buf.length) break;

      const tag = readU16(entryOffset);
      const type = readU16(entryOffset + 2);
      const count = readU32(entryOffset + 4);

      let valOffset = entryOffset + 8;
      if (type === 2 && count > 4) {
        valOffset = start + readU32(entryOffset + 8);
      }

      // ASCII strings (type 2)
      if (type === 2 && valOffset + count <= buf.length) {
        const strVal = buf.toString('ascii', valOffset, valOffset + count).replace(/\0+$/, '').trim();
        switch (tag) {
          case 0x010f: exifData.make = strVal; break;
          case 0x0110: exifData.model = strVal; break;
          case 0x0131: exifData.software = strVal; break;
          case 0x0132: exifData.dateTime = strVal; break;
          case 0x9003: exifData.dateTimeOriginal = strVal; break;
          case 0x9004: exifData.dateTimeDigitized = strVal; break;
          case 0x9010: exifData.offsetTime = strVal; break;
          case 0x9011: exifData.offsetTimeOriginal = strVal; break;
        }
      }

      // ExifSubIFD pointer (tag 0x8769)
      if (tag === 0x8769 && type === 4) {
        const subIfdOffset = start + readU32(entryOffset + 8);
        readIfdEntries(subIfdOffset);
      }

      // Orientation (tag 0x0112)
      if (tag === 0x0112) {
        exifData.orientation = readU16(entryOffset + 8);
      }

      entryOffset += 12;
    }
  };

  readIfdEntries(start + ifd0Offset);
  if (Object.keys(exifData).length > 0) {
    meta.exif = exifData;
  }
}

// ============================================================================
// PNG METADATA EXTRACTION
// ============================================================================

function extractPngMetadata(buf: Buffer): ExtractedMetadataResult {
  const warnings: string[] = [];
  const meta: Record<string, unknown> = { format: 'PNG' };
  let extractedTimeUtc: string | null = null;

  try {
    let offset = 8; // Skip 8-byte PNG signature

    while (offset < buf.length - 8) {
      const length = buf.readUInt32BE(offset);
      const chunkType = buf.toString('ascii', offset + 4, offset + 8);
      const dataStart = offset + 8;

      if (dataStart + length > buf.length) {
        warnings.push('Premature end of PNG file while reading chunk');
        break;
      }

      // IHDR: Image Header
      if (chunkType === 'IHDR' && length >= 13) {
        meta.dimensions = {
          width: buf.readUInt32BE(dataStart),
          height: buf.readUInt32BE(dataStart + 4),
          bitDepth: buf[dataStart + 8],
          colorType: buf[dataStart + 9],
          compressionMethod: buf[dataStart + 10],
          filterMethod: buf[dataStart + 11],
          interlaceMethod: buf[dataStart + 12],
        };
      }

      // tIME: Modification Time
      if (chunkType === 'tIME' && length >= 7) {
        const year = buf.readUInt16BE(dataStart);
        const month = buf[dataStart + 2];
        const day = buf[dataStart + 3];
        const hour = buf[dataStart + 4];
        const minute = buf[dataStart + 5];
        const second = buf[dataStart + 6];

        const dateObj = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
        if (!isNaN(dateObj.getTime())) {
          extractedTimeUtc = dateObj.toISOString();
          meta.tIME = extractedTimeUtc;
        } else {
          warnings.push('Invalid timestamp values in PNG tIME chunk');
        }
      }

      // tEXt: Latin-1 text chunk
      if (chunkType === 'tEXt' && length > 0) {
        const textChunk = buf.subarray(dataStart, dataStart + length);
        const nullIdx = textChunk.indexOf(0);
        if (nullIdx > 0) {
          const keyword = textChunk.toString('latin1', 0, nullIdx).trim();
          const textValue = textChunk.toString('latin1', nullIdx + 1).trim();
          if (!meta.textChunks) meta.textChunks = {};
          (meta.textChunks as Record<string, string>)[keyword] = textValue;

          // Check for common date keywords in tEXt
          if (!extractedTimeUtc && (keyword.toLowerCase() === 'creation time' || keyword.toLowerCase() === 'date')) {
            const parsed = Date.parse(textValue);
            if (!isNaN(parsed)) {
              extractedTimeUtc = new Date(parsed).toISOString();
            }
          }
        }
      }

      if (chunkType === 'IEND') break;

      // Next chunk: 4 bytes length + 4 bytes type + length + 4 bytes CRC
      offset += 12 + length;
    }
  } catch (err: unknown) {
    warnings.push(`PNG chunk parsing error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    status: warnings.length > 0 ? 'PARTIAL_WARNING' : 'SUCCESS',
    detectedMimeType: 'image/png',
    extractedFileTimeUtc: extractedTimeUtc,
    extractedFileTimezone: extractedTimeUtc ? 'UTC' : null,
    embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA',
    metadata: meta,
    warnings,
  };
}

// ============================================================================
// PDF METADATA EXTRACTION
// ============================================================================

function extractPdfMetadata(buf: Buffer, tailBuf?: Buffer): ExtractedMetadataResult {
  const warnings: string[] = [];
  const meta: Record<string, unknown> = { format: 'PDF' };
  let extractedTimeUtc: string | null = null;
  let extractedTimezone: string | null = null;

  try {
    const rawHead = buf.toString('latin1', 0, Math.min(buf.length, 1024));
    const versionMatch = rawHead.match(/%PDF-(\d+\.\d+)/);
    if (versionMatch) {
      meta.pdfVersion = versionMatch[1];
    }

    // Inspect tail / trailer where Info dictionary usually resides.
    // If tailBuf is supplied (e.g. for files > 64 KiB), inspect tailBuf;
    // otherwise inspect the trailing 64 KiB of buf.
    let rawTail: string;
    if (tailBuf && tailBuf.length > 0) {
      const tailLen = Math.min(tailBuf.length, 65536);
      rawTail = tailBuf.toString('latin1', tailBuf.length - tailLen, tailBuf.length);
    } else {
      const tailLength = Math.min(buf.length, 65536);
      rawTail = buf.toString('latin1', buf.length - tailLength, buf.length);
    }

    // Extract Info dictionary fields: /Title, /Author, /Creator, /Producer, /CreationDate, /ModDate
    const infoFields: Record<string, string> = {};
    const fieldPatterns: Array<{ key: string; regex: RegExp }> = [
      { key: 'title', regex: /\/Title\s*\(([^)]*)\)/ },
      { key: 'author', regex: /\/Author\s*\(([^)]*)\)/ },
      { key: 'creator', regex: /\/Creator\s*\(([^)]*)\)/ },
      { key: 'producer', regex: /\/Producer\s*\(([^)]*)\)/ },
      { key: 'creationDate', regex: /\/CreationDate\s*\(([^)]*)\)/ },
      { key: 'modDate', regex: /\/ModDate\s*\(([^)]*)\)/ },
    ];

    for (const { key, regex } of fieldPatterns) {
      const match = rawTail.match(regex) || rawHead.match(regex);
      if (match) {
        infoFields[key] = match[1].trim();
      }
    }

    if (Object.keys(infoFields).length > 0) {
      meta.info = infoFields;
      if (infoFields.title) meta.title = infoFields.title;
      if (infoFields.author) meta.author = infoFields.author;
    }

    // Parse PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
    const targetPdfDate = infoFields.creationDate || infoFields.modDate;
    if (targetPdfDate) {
      const parsedDate = parsePdfDateString(targetPdfDate);
      if (parsedDate) {
        extractedTimeUtc = parsedDate.utcIso;
        extractedTimezone = parsedDate.timezone;
      } else {
        warnings.push(`Could not parse PDF date format: '${targetPdfDate}'`);
      }
    }

    // Page count estimation from /Count in /Pages dictionary or /Type /Page references
    const countMatch = rawHead.match(/\/Count\s+(\d+)/) || rawTail.match(/\/Count\s+(\d+)/);
    if (countMatch) {
      meta.estimatedPageCount = parseInt(countMatch[1], 10);
      meta.pageCount = meta.estimatedPageCount;
    } else {
      const fullText = tailBuf
        ? `${buf.toString('latin1')}\n${tailBuf.toString('latin1')}`
        : buf.toString('latin1');
      const pageMatches = fullText.match(/\/Type\s*\/Page\b/g);
      if (pageMatches) {
        meta.estimatedPageCount = pageMatches.length;
        meta.pageCount = meta.estimatedPageCount;
      }
    }
  } catch (err: unknown) {
    warnings.push(`PDF metadata extraction error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    status: warnings.length > 0 ? 'PARTIAL_WARNING' : 'SUCCESS',
    detectedMimeType: 'application/pdf',
    extractedFileTimeUtc: extractedTimeUtc,
    extractedFileTimezone: extractedTimezone,
    embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA',
    metadata: meta,
    warnings,
  };
}

// ============================================================================
// PLAIN TEXT METADATA EXTRACTION
// ============================================================================

function extractTextMetadata(buf: Buffer): ExtractedMetadataResult {
  const textContent = buf.toString('utf8');

  const lineCount = textContent.length === 0 ? 0 : textContent.split(/\r\n|\r|\n/).length;
  const wordCount = textContent.trim().length === 0 ? 0 : textContent.trim().split(/\s+/).length;
  const charCount = textContent.length;

  let isAsciiOnly = true;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 127) {
      isAsciiOnly = false;
      break;
    }
  }

  const meta: Record<string, unknown> = {
    format: 'PLAIN_TEXT',
    characterCount: charCount,
    lineCount,
    wordCount,
    encoding: isAsciiOnly ? 'US-ASCII' : 'UTF-8',
    hasTrailingNewline: textContent.endsWith('\n') || textContent.endsWith('\r'),
  };

  return {
    status: 'SUCCESS',
    detectedMimeType: 'text/plain',
    extractedFileTimeUtc: null,
    extractedFileTimezone: null,
    embeddedTimeConfidence: 'NOT_APPLICABLE',
    metadata: meta,
    warnings: [],
  };
}

// ============================================================================
// DATE PARSING UTILITIES
// ============================================================================

/**
 * Parses EXIF date formats: 'YYYY:MM:DD HH:MM:SS' with optional offset '+HH:MM'
 */
function parseExifDateString(
  dateStr: string,
  offsetStr?: string
): { utcIso: string; timezone: string } | null {
  const match = dateStr.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, yr, mo, da, hr, mi, se] = match.map(Number);
  let tz = 'Z';
  let tzOffsetMinutes = 0;

  if (offsetStr) {
    const tzMatch = offsetStr.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (tzMatch) {
      const sign = tzMatch[1] === '-' ? -1 : 1;
      const tzHours = Number(tzMatch[2]);
      const tzMins = Number(tzMatch[3]);
      tzOffsetMinutes = sign * (tzHours * 60 + tzMins);
      tz = offsetStr;
    }
  }

  // Construct UTC instant
  const utcMillis = Date.UTC(yr, mo - 1, da, hr, mi, se) - tzOffsetMinutes * 60 * 1000;
  const d = new Date(utcMillis);
  if (isNaN(d.getTime())) return null;

  return {
    utcIso: d.toISOString(),
    timezone: tz,
  };
}

/**
 * Parses PDF date format: 'D:YYYYMMDDHHmmSS[+|-]HH'mm'' or 'YYYYMMDD...'
 */
function parsePdfDateString(dateStr: string): { utcIso: string; timezone: string } | null {
  const clean = dateStr.startsWith('D:') ? dateStr.substring(2) : dateStr;
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([+-Z])?(\d{2})?'?(\d{2})?'?/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);

  const tzSign = match[7];
  let tzOffsetMinutes = 0;
  let timezoneStr = 'Z';

  if (tzSign === '+' || tzSign === '-') {
    const tzHours = Number(match[8] || 0);
    const tzMins = Number(match[9] || 0);
    const sign = tzSign === '-' ? -1 : 1;
    tzOffsetMinutes = sign * (tzHours * 60 + tzMins);
    timezoneStr = `${tzSign}${String(tzHours).padStart(2, '0')}:${String(tzMins).padStart(2, '0')}`;
  }

  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second) - tzOffsetMinutes * 60 * 1000;
  const d = new Date(utcMillis);
  if (isNaN(d.getTime())) return null;

  return {
    utcIso: d.toISOString(),
    timezone: timezoneStr,
  };
}
