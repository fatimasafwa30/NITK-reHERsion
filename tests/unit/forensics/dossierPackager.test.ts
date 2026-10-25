/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Module I — Dossier Generation Engine & Export Packager
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 3, 5, 6, 10.2, 11.1, 11.2, 14.1 (dossier/pdf_zip_generation.test.ts)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  packageDossier,
  validateAndRegisterEntryPath,
  verifyDossierExportAuthorization,
  DossierPackagingError,
} from '../../../src/lib/forensics/dossierPackager.js';
import { generateDerivedPreview } from '../../../src/lib/forensics/previewService.js';
import { generatePdfReportBuffer } from '../../../src/lib/forensics/pdfReportBuilder.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/localStorageAdapter.js';
import { getRawKey, getDerivedKey, getDossierKey } from '../../../src/lib/storage/storageTypes.js';
import { hashBuffer } from '../../../src/lib/forensics/streamingHasher.js';
import { generateEd25519KeyPair } from '../../../src/lib/forensics/manifestSigner.js';
import { verifyManifestOffline } from '../../../src/lib/forensics/offlineVerifier.js';
import { StorageIntegrityMismatchError } from '../../../src/lib/forensics/forensicsTypes.js';
import { getProvenanceRecorder, resetProvenanceRecorder } from '../../../src/lib/forensics/provenanceRecorder.js';
import { EvidenceRegister } from '../../../src/services/evidenceStore.js';

const TEST_STORAGE_DIR = path.resolve('./storage_test_dossier');

/**
 * Binary helper to parse standard ZIP local file headers without external dependencies.
 */
function unpackZipEntries(zipBuffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const eocdOffset = zipBuffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset === -1) {
    throw new Error('Not a valid ZIP archive: missing EOCD record.');
  }

  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);

  let cdPtr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = zipBuffer.readUInt32LE(cdPtr);
    if (sig !== 0x02014b50) {
      throw new Error(`Corrupt Central Directory header at offset ${cdPtr}`);
    }

    const compMethod = zipBuffer.readUInt16LE(cdPtr + 10);
    const compSize = zipBuffer.readUInt32LE(cdPtr + 20);
    const fnLen = zipBuffer.readUInt16LE(cdPtr + 28);
    const extraLen = zipBuffer.readUInt16LE(cdPtr + 30);
    const commentLen = zipBuffer.readUInt16LE(cdPtr + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cdPtr + 42);

    const name = zipBuffer.toString('utf8', cdPtr + 46, cdPtr + 46 + fnLen);

    const localFnLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFnLen + localExtraLen;

    const rawData = zipBuffer.subarray(dataOffset, dataOffset + compSize);
    let decompressed: Buffer;
    if (compMethod === 0) {
      decompressed = rawData;
    } else if (compMethod === 8) {
      decompressed = zlib.inflateRawSync(rawData);
    } else {
      throw new Error(`Unsupported compression method: ${compMethod}`);
    }

    entries.set(name, decompressed);
    cdPtr += 46 + fnLen + extraLen + commentLen;
  }

  return entries;
}

describe('Module I: Dossier Packager & PDF Summary Report', () => {
  let storage: LocalStorageAdapter;
  let testKeys: { privateKeyPem: string; publicKeyPem: string };

  const samplePngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR length (13)
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x20, // width: 32
    0x00, 0x00, 0x00, 0x20, // height: 32
    0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
    0x4f, 0x98, 0x93, 0x52, // IHDR CRC
    0x00, 0x00, 0x00, 0x00, // IEND length (0)
    0x49, 0x45, 0x4e, 0x44, // "IEND"
    0xae, 0x42, 0x60, 0x82, // IEND CRC
  ]);

  const sampleTextBuffer = Buffer.from('Extortion demand received via encrypted chat.\nThreatening disclosure.', 'utf8');

  beforeEach(async () => {
    await fsp.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    await fsp.mkdir(TEST_STORAGE_DIR, { recursive: true });
    storage = new LocalStorageAdapter(TEST_STORAGE_DIR);

    const generated = generateEd25519KeyPair({ keyId: 'veratrace-ed25519-2026-q4' });
    testKeys = {
      privateKeyPem: generated.privateKeyPem,
      publicKeyPem: generated.publicKeyPem,
    };

    resetProvenanceRecorder();
  });

  afterEach(async () => {
    await fsp.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  });

  it('generates a deterministic PDF summary report with verified data and statutory notices', async () => {
    const pngHash = hashBuffer(samplePngBuffer).sha256Hex;
    const reportBuffer = await generatePdfReportBuffer({
      caseInfo: {
        caseId: 'case-test-101',
        title: 'Extortion Incident Investigation',
        category: 'HARASSMENT_EXTORTION',
        summary: 'Targeted harassment campaign across multiple digital platforms.',
        exportTimestampUtc: '2026-10-25T00:00:00.000Z',
      },
      manifest: {
        $schema: 'https://veratrace.org/schemas/v1/dossier-manifest.json',
        manifestVersion: 1,
        generator: {
          software: 'VeraTrace Forensic Dossier Engine',
          version: '1.1.1-mvp',
          jurisdictionProfile: 'IN_BSA_2023',
        },
        case: {
          caseId: 'case-test-101',
          title: 'Extortion Incident Investigation',
          category: 'HARASSMENT_EXTORTION',
          exportTimestampUtc: '2026-10-25T00:00:00.000Z',
        },
        trustSeal: {
          digestAlgorithm: 'SHA-256',
          manifestContentSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
          canonicalizationAlgorithm: 'RFC8785_JCS',
          signatureAlgorithm: 'ED25519',
          signingKeyId: 'veratrace-ed25519-2026-q4',
          serverDigitalSignature: 'MC4CAQAwBQYDK2VwBCIEIP...TEST_SIGNATURE',
          verificationEndpoint: 'https://veratrace.org/api/v1/verification-runs',
        },
        files: [],
        disclaimers: [],
      },
      evidence: [
        {
          evidenceId: 'ev-1',
          originalFilename: 'threat_screenshot.png',
          mediaType: 'image/png',
          fileSizeBytes: samplePngBuffer.length,
          sha256: pngHash,
          packageRelativePath: 'evidence/ev-1_threat_screenshot.png',
          systemReceiptUtc: '2026-10-24T22:00:00.000Z',
        },
      ],
      timelineEvents: [
        {
          eventId: 'evt-1',
          caseId: 'case-test-101',
          title: 'Extortion Message Received',
          occurredAtUtc: '2026-10-24T21:45:00.000Z',
          tier: 'TIER_1_DEVICE_METADATA',
          isUncertain: false,
        } as any,
      ],
      provenanceMetadata: {
        persistenceModel: 'IN_MEMORY_SESSION',
        durableStorage: false,
        auditEventCount: 3,
        persistenceNotice: 'In-memory test notice',
      },
    });

    expect(Buffer.isBuffer(reportBuffer)).toBe(true);
    expect(reportBuffer.length).toBeGreaterThan(500);

    // Verify PDF header magic bytes "%PDF-"
    expect(reportBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('packages a complete valid dossier with all expected archive entries and indices', async () => {
    const caseId = 'case-dossier-01';
    const ev1Id = 'ev-png-01';
    const ev2Id = 'ev-txt-02';

    const pngHash = hashBuffer(samplePngBuffer).sha256Hex;
    const textHash = hashBuffer(sampleTextBuffer).sha256Hex;

    // Write raw files to storage
    await storage.writeStagedBuffer(getRawKey(caseId, ev1Id), samplePngBuffer);
    await storage.writeStagedBuffer(getRawKey(caseId, ev2Id), sampleTextBuffer);

    // Record provenance audit events
    const recorder = getProvenanceRecorder();
    await recorder.recordEvent({
      evidenceId: ev1Id,
      eventType: 'FILE_INTAKE_RECEIVED',
      eventOutcome: 'SUCCESS',
      softwareComponent: 'EvidencePipeline',
    });

    const result = await packageDossier(
      {
        caseId,
        title: 'Online Extortion Case',
        category: 'HARASSMENT_EXTORTION',
        summary: 'Targeted intimidation via Telegram channels.',
      },
      [
        {
          evidenceId: ev1Id,
          originalFilename: 'chat_capture.png',
          mediaType: 'image/png',
          sizeBytes: samplePngBuffer.length,
          sha256: pngHash,
        },
        {
          evidenceId: ev2Id,
          originalFilename: 'message_transcript.txt',
          mediaType: 'text/plain',
          sizeBytes: sampleTextBuffer.length,
          sha256: textHash,
        },
      ],
      {
        storageAdapter: storage,
        signingPrivateKeyPem: testKeys.privateKeyPem,
        signingKeyId: 'veratrace-ed25519-2026-q4',
        includePreviews: true,
        includePdfReport: true,
        timelineEvents: [
          {
            eventId: 'evt-1',
            caseId,
            title: 'Threat Received',
            occurredAtUtc: '2026-10-24T20:00:00.000Z',
            tier: 'TIER_1_DEVICE_METADATA',
          } as any,
        ],
      }
    );

    expect(result.caseId).toBe(caseId);
    expect(result.includedEvidenceCount).toBe(2);
    expect(result.zipSha256Hex).toMatch(/^[a-f0-9]{64}$/);
    expect(result.zipSizeBytes).toBeGreaterThan(0);
    expect(result.manifest).toBeDefined();
    expect(result.manifest.trustSeal.serverDigitalSignature).toBeDefined();
    expect(result.index).toBeDefined();

    // Verify files exist in storage
    expect(await storage.exists(result.zipArchiveStorageKey)).toBe(true);
    expect(result.pdfReportStorageKey).toBeDefined();
    expect(await storage.exists(result.pdfReportStorageKey!)).toBe(true);

    // Unpack ZIP archive and verify entries
    const zipBytes = await storage.readBuffer(result.zipArchiveStorageKey);
    const entries = unpackZipEntries(zipBytes);

    expect(entries.has('veratrace_manifest.v1.json')).toBe(true);
    expect(entries.has('dossier_index.json')).toBe(true);
    expect(entries.has('reports/case_summary.pdf')).toBe(true);
    expect(entries.has('audit/processing_events.json')).toBe(true);
    expect(entries.has('timeline/timeline_events.json')).toBe(true);
    expect(entries.has(`evidence/${ev1Id}_chat_capture.png`)).toBe(true);
    expect(entries.has(`evidence/${ev2Id}_message_transcript.txt`)).toBe(true);

    // Verify derived previews separation
    expect(entries.has(`previews/${ev1Id}.preview`)).toBe(true);
    expect(entries.has(`previews/${ev2Id}.preview`)).toBe(true);
  });

  it('preserves exact signed manifest bytes and verifies successfully with offline verifier', async () => {
    const caseId = 'case-verifier-02';
    const evId = 'ev-png-verified';
    const pngHash = hashBuffer(samplePngBuffer).sha256Hex;

    await storage.writeStagedBuffer(getRawKey(caseId, evId), samplePngBuffer);

    const result = await packageDossier(
      {
        caseId,
        title: 'Verifiable Evidence Package',
        category: 'DEFAMATION',
      },
      [
        {
          evidenceId: evId,
          originalFilename: 'proof.png',
          mediaType: 'image/png',
          sizeBytes: samplePngBuffer.length,
          sha256: pngHash,
        },
      ],
      {
        storageAdapter: storage,
        signingPrivateKeyPem: testKeys.privateKeyPem,
        signingKeyId: 'veratrace-ed25519-2026-q4',
      }
    );

    const zipBytes = await storage.readBuffer(result.zipArchiveStorageKey);
    const entries = unpackZipEntries(zipBytes);

    const manifestJsonString = entries.get('veratrace_manifest.v1.json')!.toString('utf8');
    const packagedRawBytes = entries.get(`evidence/${evId}_proof.png`)!;

    // Run standalone offline verifier
    const verificationReport = await verifyManifestOffline(manifestJsonString, {
      trustedPublicKeyPem: testKeys.publicKeyPem,
      files: [
        {
          packageRelativePath: `evidence/${evId}_proof.png`,
          buffer: packagedRawBytes,
        },
      ],
    });

    expect(verificationReport.overallStatus).toBe('MATCH');
    expect(verificationReport.signatureValid).toBe(true);
    expect(verificationReport.manifestContentSha256Matches).toBe(true);
    expect(verificationReport.checkedFilesCount).toBe(1);
    expect(verificationReport.fileResults[0].status).toBe('MATCH');
  });

  it('guarantees that raw evidence in storage remains 100% bit-for-bit unchanged', async () => {
    const caseId = 'case-immutability-03';
    const evId = 'ev-immutable-01';
    const rawKey = getRawKey(caseId, evId);

    await storage.writeStagedBuffer(rawKey, samplePngBuffer);
    const shaBefore = hashBuffer(await storage.readBuffer(rawKey)).sha256Hex;

    await packageDossier(
      {
        caseId,
        title: 'Immutability Check',
        category: 'HARASSMENT',
      },
      [
        {
          evidenceId: evId,
          originalFilename: 'original.png',
          mediaType: 'image/png',
          sizeBytes: samplePngBuffer.length,
          sha256: shaBefore,
        },
      ],
      {
        storageAdapter: storage,
        signingPrivateKeyPem: testKeys.privateKeyPem,
      }
    );

    const bytesAfter = await storage.readBuffer(rawKey);
    const shaAfter = hashBuffer(bytesAfter).sha256Hex;

    expect(shaAfter).toBe(shaBefore);
    expect(Buffer.compare(bytesAfter, samplePngBuffer)).toBe(0);
  });

  it('fails immediately with StorageIntegrityMismatchError if stored raw evidence has been altered', async () => {
    const caseId = 'case-tamper-04';
    const evId = 'ev-tampered-01';
    const rawKey = getRawKey(caseId, evId);

    // Write original buffer to storage
    await storage.writeStagedBuffer(rawKey, samplePngBuffer);

    // Tamper with storage: alter 1 byte
    const tampered = Buffer.from(samplePngBuffer);
    tampered[10] = 0xff;
    await storage.writeStagedBuffer(rawKey, tampered);

    const originalExpectedHash = hashBuffer(samplePngBuffer).sha256Hex;

    await expect(
      packageDossier(
        {
          caseId,
          title: 'Tamper Detection',
          category: 'EXTORTION',
        },
        [
          {
            evidenceId: evId,
            originalFilename: 'tampered.png',
            mediaType: 'image/png',
            sizeBytes: samplePngBuffer.length,
            sha256: originalExpectedHash, // Registered hash differs from tampered storage bytes
          },
        ],
        {
          storageAdapter: storage,
          signingPrivateKeyPem: testKeys.privateKeyPem,
        }
      )
    ).rejects.toThrow(StorageIntegrityMismatchError);
  });

  it('fails immediately with DossierPackagingError if raw evidence file is missing from storage', async () => {
    const caseId = 'case-missing-05';
    const evId = 'ev-ghost-01';

    await expect(
      packageDossier(
        {
          caseId,
          title: 'Missing File Test',
          category: 'EXTORTION',
        },
        [
          {
            evidenceId: evId,
            originalFilename: 'missing.png',
            mediaType: 'image/png',
            sizeBytes: 100,
            sha256: 'a'.repeat(64),
          },
        ],
        {
          storageAdapter: storage,
          signingPrivateKeyPem: testKeys.privateKeyPem,
        }
      )
    ).rejects.toThrow(DossierPackagingError);
  });

  it('blocks path traversal and archive-entry collision attempts', () => {
    const seen = new Set<string>();

    // Path traversal components
    expect(() => validateAndRegisterEntryPath('evidence/../../etc/passwd', seen)).toThrow(DossierPackagingError);
    expect(() => validateAndRegisterEntryPath('/root/secret.txt', seen)).toThrow(DossierPackagingError);
    expect(() => validateAndRegisterEntryPath('C:\\Windows\\System32\\cmd.exe', seen)).toThrow(DossierPackagingError);
    expect(() => validateAndRegisterEntryPath('evidence/\0nullbyte.png', seen)).toThrow(DossierPackagingError);

    // Duplicate collision
    validateAndRegisterEntryPath('evidence/valid_file.png', seen);
    expect(() => validateAndRegisterEntryPath('evidence/valid_file.png', seen)).toThrow(DossierPackagingError);
  });

  it('enforces honest disclosure of in-memory provenance persistence limitations', async () => {
    const caseId = 'case-audit-disclosure-06';
    const evId = 'ev-audit-01';
    const hash = hashBuffer(sampleTextBuffer).sha256Hex;

    await storage.writeStagedBuffer(getRawKey(caseId, evId), sampleTextBuffer);

    const recorder = getProvenanceRecorder();
    await recorder.recordEvent({
      evidenceId: evId,
      eventType: 'DEVICE_METADATA_EXTRACTED',
      eventOutcome: 'SUCCESS',
      softwareComponent: 'MetadataExtractor',
    });

    const result = await packageDossier(
      {
        caseId,
        title: 'Audit Disclosure Check',
        category: 'HARASSMENT',
      },
      [
        {
          evidenceId: evId,
          originalFilename: 'notes.txt',
          mediaType: 'text/plain',
          sizeBytes: sampleTextBuffer.length,
          sha256: hash,
        },
      ],
      {
        storageAdapter: storage,
        signingPrivateKeyPem: testKeys.privateKeyPem,
      }
    );

    const zipBytes = await storage.readBuffer(result.zipArchiveStorageKey);
    const entries = unpackZipEntries(zipBytes);

    const auditJson = JSON.parse(entries.get('audit/processing_events.json')!.toString('utf8'));
    expect(auditJson.metadata.persistenceModel).toBe('IN_MEMORY_SESSION');
    expect(auditJson.metadata.durableStorage).toBe(false);
    expect(auditJson.metadata.persistenceNotice).toContain('in-memory session recorder');
    expect(auditJson.metadata.persistenceNotice).toContain('PostgreSQL');
    expect(auditJson.events.length).toBeGreaterThanOrEqual(1);

    const indexJson = JSON.parse(entries.get('dossier_index.json')!.toString('utf8'));
    expect(indexJson.provenanceMetadata.persistenceModel).toBe('IN_MEMORY_SESSION');
    expect(indexJson.provenanceMetadata.durableStorage).toBe(false);
  });

  it('cleans up partial storage files if packaging fails during execution', async () => {
    const caseId = 'case-cleanup-07';
    const ev1Id = 'ev-good-01';
    const ev2Id = 'ev-bad-02';

    const hash1 = hashBuffer(samplePngBuffer).sha256Hex;
    await storage.writeStagedBuffer(getRawKey(caseId, ev1Id), samplePngBuffer);
    // ev2 is intentionally NOT written to storage to trigger failure

    const dossierId = 'dossier-cleanup-test-uuid';
    const zipKey = getDossierKey(caseId, dossierId, 'zip');
    const pdfKey = getDossierKey(caseId, dossierId, 'pdf');

    await expect(
      packageDossier(
        {
          caseId,
          title: 'Cleanup Failure Test',
          category: 'EXTORTION',
        },
        [
          {
            evidenceId: ev1Id,
            originalFilename: 'good.png',
            mediaType: 'image/png',
            sizeBytes: samplePngBuffer.length,
            sha256: hash1,
          },
          {
            evidenceId: ev2Id,
            originalFilename: 'bad.png',
            mediaType: 'image/png',
            sizeBytes: 10,
            sha256: 'b'.repeat(64),
          },
        ],
        {
          dossierId,
          storageAdapter: storage,
          signingPrivateKeyPem: testKeys.privateKeyPem,
        }
      )
    ).rejects.toThrow();

    // Confirm that partial dossier artifacts were rolled back / cleaned up
    expect(await storage.exists(zipKey)).toBe(false);
    expect(await storage.exists(pdfKey)).toBe(false);
  });

  it('integrates seamlessly with EvidenceRegister.generateDossier()', async () => {
    const caseId = 'case-store-integration-08';
    const register = new EvidenceRegister(caseId, storage);

    // Ingest sample evidence into the register
    const record = await register.addRecord({
      name: 'evidence_doc.txt',
      buffer: sampleTextBuffer,
    });

    expect(record.evidenceId).toBeDefined();

    // Add a timeline event to the case register
    register.addIncidentEvent({
      caseId,
      label: 'Harassment Chat Message',
      occurredAt: '2026-10-24T18:00:00.000Z',
      timeConfidence: 'confirmed',
      description: 'Harassing text message received on WhatsApp.',
      relatedEvidenceId: record.evidenceId,
    });

    const result = await register.generateDossier(
      {
        title: 'EvidenceRegister Integration Case',
        category: 'HARASSMENT',
        summary: 'Direct integration test from EvidenceRegister service contract.',
      },
      {
        signingPrivateKeyPem: testKeys.privateKeyPem,
        signingKeyId: 'veratrace-ed25519-2026-q4',
      }
    );

    expect(result.caseId).toBe(caseId);
    expect(result.includedEvidenceCount).toBe(1);
    expect(result.includedTimelineEventCount).toBeGreaterThanOrEqual(1);
    expect(result.manifest.files[0].sha256).toBe(record.sha256);
    expect(await storage.exists(result.zipArchiveStorageKey)).toBe(true);
  });
});
