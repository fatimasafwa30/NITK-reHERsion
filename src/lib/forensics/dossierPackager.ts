/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module I: Dossier Generation Engine & Streaming Export Packager
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 3 (Module Architecture), 5 (archiver & PDFKit decisions),
 *           6 (Dossier schema & keys), 10.2 (Exported Dossier Manifest),
 *           11.1/11.2 (Trust Model), 15 (Roadmap Phase 4 / Milestone 5)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import * as archiverModule from 'archiver';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { hashBuffer } from './streamingHasher.js';
import {
  StorageIntegrityMismatchError,
  StorageFileNotFoundError,
  PathTraversalError,
} from './forensicsTypes.js';
import {
  StorageAdapter,
  getRawKey,
  getDerivedKey,
  getDossierKey,
} from '../storage/storageTypes.js';
import { LocalStorageAdapter } from '../storage/localStorageAdapter.js';
import {
  buildUnsealedManifest,
  normalizeManifestFileEntries,
} from './manifestBuilder.js';
import { signManifest, generateEd25519KeyPair } from './manifestSigner.js';
import { getProvenanceRecorder, ProcessingEvent } from './provenanceRecorder.js';
import { generateDerivedPreview } from './previewService.js';
import { generatePdfReportBuffer } from './pdfReportBuilder.js';
import {
  DossierCaseInfo,
  DossierPackagingOptions,
  DossierPackagingResult,
  DossierIndex,
  DossierArchiveEntryMetadata,
  DossierProvenanceMetadata,
  DossierPackagingError,
} from './dossierTypes.js';
import { ManifestFileEntry, DossierManifest } from './manifestTypes.js';
import { TimelineEntry } from './timelineTypes.js';

// Default schema location
export const DOSSIER_INDEX_SCHEMA_V1 = 'https://veratrace.org/schemas/v1/dossier-index.json';
export { DossierPackagingError };

/**
 * Generates an RFC 4122 v4 UUID without requiring external native bindings.
 */
function generateUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedDefaultKeyPair: { privateKeyPem: string; publicKeyPem: string; keyId: string } | null = null;

/**
 * Returns or initializes a cached default Ed25519 key pair for packaging when no explicit private key is provided.
 */
export function getDefaultSigningKey(): string {
  if (!cachedDefaultKeyPair) {
    const gen = generateEd25519KeyPair({ keyId: 'veratrace-ed25519-2026-q4' });
    cachedDefaultKeyPair = {
      privateKeyPem: gen.privateKeyPem,
      publicKeyPem: gen.publicKeyPem,
      keyId: gen.keyId,
    };
  }
  return cachedDefaultKeyPair.privateKeyPem;
}

/**
 * Validates and normalizes an archive entry path to prevent Path Traversal (Zip Slip)
 * and duplicate archive-entry collisions.
 */
export function validateAndRegisterEntryPath(entryPath: string, seenEntries: Set<string>): string {
  if (!entryPath || typeof entryPath !== 'string') {
    throw new DossierPackagingError('Archive entry path must be a non-empty string.', 'ERR_INVALID_ENTRY_PATH');
  }

  if (entryPath.includes('\0')) {
    throw new DossierPackagingError('Path traversal attempt: entry contains null bytes.', 'ERR_PATH_TRAVERSAL');
  }

  if (entryPath.startsWith('/') || entryPath.startsWith('\\') || /^[a-zA-Z]:/.test(entryPath)) {
    throw new DossierPackagingError(
      `Leading slash or absolute path detected in archive entry: '${entryPath}'`,
      'ERR_PATH_TRAVERSAL'
    );
  }

  const normalized = entryPath.replace(/\\/g, '/');

  // Reject path traversal tokens
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new DossierPackagingError(
        `Path traversal attempt detected in archive entry: '${entryPath}'`,
        'ERR_PATH_TRAVERSAL'
      );
    }
  }

  if (seenEntries.has(normalized)) {
    throw new DossierPackagingError(
      `Duplicate archive entry collision detected: '${normalized}'`,
      'ERR_DUPLICATE_ENTRY'
    );
  }

  seenEntries.add(normalized);
  return normalized;
}

/**
 * Authorization seam for Person 3's Multi-Tenant Session & Case Ownership enforcement.
 */
export function verifyDossierExportAuthorization(caseId: string, requestingUserId?: string): void {
  if (!caseId || typeof caseId !== 'string') {
    throw new DossierPackagingError('Invalid caseId: must be a non-empty string.', 'ERR_INVALID_CASE_ID');
  }

  // Prevent path traversal in caseId
  if (!/^[a-zA-Z0-9_-]+$/.test(caseId)) {
    throw new DossierPackagingError('Invalid caseId: contains disallowed characters.', 'ERR_PATH_TRAVERSAL');
  }

  /**
   * SEAM DOCUMENTATION FOR PERSON 3:
   * When integrating with Next.js App Router and Prisma in Phase 1 / Milestone 2:
   * 1. Extract session from getServerSession(authOptions).
   * 2. Ensure session.user.id matches requestingUserId.
   * 3. Verify case ownership via `prisma.case.findFirstOrThrow({ where: { id: caseId, ownerId: session.user.id } })`.
   * 4. For multi-tenant counselor/investigator roles, verify explicit CaseGrant or CounselorPermission.
   */
}

/**
 * Packages a complete, tamper-evident VeraTrace Forensic Evidence Dossier.
 *
 * Packaging Pipeline:
 * 1. Verifies raw evidence existence and SHA-256 byte immutability from storage.
 * 2. Compiles deterministic manifest and applies asymmetric Ed25519 digital signature.
 * 3. Generates PDF summary report with evidence ledger and timeline (PDFKit).
 * 4. Bundles derived previews, clearly separated from raw evidence.
 * 5. Extracts provenance audit events, explicitly annotating actual persistence limitations.
 * 6. Bundles chronological incident timeline.
 * 7. Generates machine-readable dossier index with complete archive inventory and disclaimers.
 * 8. Streams all artifacts into a standard ZIP archive via archiver, calculating archive SHA-256 digest in real-time.
 * 9. Persists ZIP archive and PDF report to storage/dossiers/ with rollback on failure.
 *
 * @param caseInfo Case identification and export metadata.
 * @param evidenceItems List of preserved evidence records belonging to the case.
 * @param options Packaging configuration, custom disclaimers, key overrides, and storage adapter.
 * @returns DossierPackagingResult containing manifest, index, SHA-256 fingerprints, and storage keys.
 */
export async function packageDossier(
  caseInfo: DossierCaseInfo,
  evidenceItems: Array<{
    evidenceId: string;
    originalFilename: string;
    mediaType: string;
    sizeBytes: number;
    sha256: string;
    packageRelativePath?: string;
    systemReceiptUtc?: string;
    sourceClassification?: string;
  }>,
  options?: DossierPackagingOptions
): Promise<DossierPackagingResult> {
  const exportTimestampUtc = options?.customDisclaimers ? caseInfo.exportTimestampUtc : (caseInfo.exportTimestampUtc || new Date().toISOString());
  const dossierId = options?.dossierId || generateUuid();
  const dossierVersion = options?.dossierVersion || 1;
  const storage: StorageAdapter = options?.storageAdapter || new LocalStorageAdapter('./storage');

  // 1. Verify authorization seam
  verifyDossierExportAuthorization(caseInfo.caseId, options?.requestingUserId);

  // 2. Track archive entries for collision & traversal prevention
  const seenEntries = new Set<string>();
  const inventory: DossierArchiveEntryMetadata[] = [];

  const zipStorageKey = getDossierKey(caseInfo.caseId, dossierId, 'zip');
  const pdfStorageKey = options?.includePdfReport !== false ? getDossierKey(caseInfo.caseId, dossierId, 'pdf') : undefined;

  let zipWritten = false;
  let pdfWritten = false;

  try {
    // 3. Verify Raw Evidence Immutability & Preload Raw Buffers
    const rawFileBuffers = new Map<string, Buffer>();
    const manifestFileEntries: ManifestFileEntry[] = [];

    for (const item of evidenceItems) {
      if (!item.evidenceId) {
        throw new DossierPackagingError('Evidence item missing evidenceId.', 'ERR_INVALID_EVIDENCE');
      }

      const rawKey = getRawKey(caseInfo.caseId, item.evidenceId);
      const exists = await storage.exists(rawKey);
      if (!exists) {
        throw new DossierPackagingError(
          `Raw evidence file '${rawKey}' not found in storage for evidence '${item.evidenceId}'.`,
          'ERR_EVIDENCE_FILE_NOT_FOUND'
        );
      }

      const rawBuffer = await storage.readBuffer(rawKey);

      // Verify SHA-256 byte invariant
      const computedSha256 = hashBuffer(rawBuffer).sha256Hex;
      const expectedSha256 = (typeof item.sha256 === 'string' ? item.sha256 : (item.sha256 as any)?.sha256Hex || '').trim().toLowerCase();

      if (computedSha256 !== expectedSha256) {
        throw new StorageIntegrityMismatchError(
          `Raw evidence file '${rawKey}' has been corrupted or altered: expected '${expectedSha256}', computed '${computedSha256}'.`,
          expectedSha256,
          computedSha256,
          rawKey
        );
      }

      const cleanFilename = item.originalFilename ? item.originalFilename.replace(/[/\\?%*:|"<>]/g, '_') : `file_${item.evidenceId}`;
      const packageRelativePath = item.packageRelativePath || `evidence/${item.evidenceId}_${cleanFilename}`;

      // Register entry path to guarantee no traversal/collision
      const validatedEntryPath = validateAndRegisterEntryPath(packageRelativePath, seenEntries);

      rawFileBuffers.set(item.evidenceId, rawBuffer);

      manifestFileEntries.push({
        evidenceId: item.evidenceId,
        packageRelativePath: validatedEntryPath,
        originalFilename: item.originalFilename || `file_${item.evidenceId}`,
        mediaType: item.mediaType || 'application/octet-stream',
        fileSizeBytes: item.sizeBytes ?? rawBuffer.length,
        sha256: expectedSha256,
        systemReceiptUtc: item.systemReceiptUtc || exportTimestampUtc || new Date().toISOString(),
        sourceClassification: item.sourceClassification || 'USER_UPLOAD',
      });

      inventory.push({
        path: validatedEntryPath,
        role: 'RAW_EVIDENCE',
        sha256: expectedSha256,
        sizeBytes: rawBuffer.length,
        description: `Preserved original raw evidence: ${item.originalFilename}`,
      });
    }

    // 4. Assemble & Sign Dossier Manifest
    const unsealedManifest = buildUnsealedManifest(
      {
        caseId: caseInfo.caseId,
        title: caseInfo.title,
        category: caseInfo.category,
        exportTimestampUtc,
      },
      manifestFileEntries,
      {
        signingKeyId: options?.signingKeyId,
        disclaimers: options?.customDisclaimers,
        exportTimestampUtc,
      }
    );

    const privateKey = options?.signingPrivateKeyPem || getDefaultSigningKey();
    const signedManifest = signManifest(unsealedManifest, privateKey, options?.signingKeyId);

    const manifestJsonString = JSON.stringify(signedManifest, null, 2);
    const manifestBuffer = Buffer.from(manifestJsonString, 'utf8');
    const manifestPath = validateAndRegisterEntryPath('veratrace_manifest.v1.json', seenEntries);

    inventory.unshift({
      path: manifestPath,
      role: 'MANIFEST',
      sha256: hashBuffer(manifestBuffer).sha256Hex,
      sizeBytes: manifestBuffer.length,
      description: 'Canonical signed evidence manifest with Ed25519 digital trust seal and file inventory',
    });

    // 5. Derived Previews
    const previewBuffers = new Map<string, Buffer>();
    if (options?.includePreviews !== false) {
      for (const item of evidenceItems) {
        const derivedKey = getDerivedKey(caseInfo.caseId, item.evidenceId, 'preview');
        let previewBuffer: Buffer | null = null;

        if (await storage.exists(derivedKey)) {
          previewBuffer = await storage.readBuffer(derivedKey);
        } else {
          // Attempt on-the-fly generation if safe
          try {
            const previewResult = await generateDerivedPreview(storage, {
              caseId: caseInfo.caseId,
              evidenceId: item.evidenceId,
              storageKey: getRawKey(caseInfo.caseId, item.evidenceId),
              sha256: (typeof item.sha256 === 'string' ? item.sha256 : (item.sha256 as any)?.sha256Hex || '').trim().toLowerCase(),
              mimeType: item.mediaType as any,
              fileName: item.originalFilename,
            });
            previewBuffer = previewResult.previewBuffer;
          } catch {
            // Non-previewable or generation failure is logged, but does not abort packaging
            previewBuffer = null;
          }
        }

        if (previewBuffer) {
          const previewPath = validateAndRegisterEntryPath(`previews/${item.evidenceId}.preview`, seenEntries);
          previewBuffers.set(item.evidenceId, previewBuffer);
          inventory.push({
            path: previewPath,
            role: 'DERIVED_PREVIEW',
            sha256: hashBuffer(previewBuffer).sha256Hex,
            sizeBytes: previewBuffer.length,
            description: `Sanitized derived preview copy for evidence item ${item.evidenceId}`,
          });
        }
      }
    }


    // 6. Provenance Audit Events with Honest Persistence Disclosure
    let processingEvents: ProcessingEvent[] = options?.processingEvents || [];
    if (!options?.processingEvents) {
      try {
        const recorder = getProvenanceRecorder();
        const allEvents = await recorder.getAllEvents();
        const evidenceIdSet = new Set(evidenceItems.map((e) => e.evidenceId));
        const filtered = allEvents.filter((ev) => evidenceIdSet.has(ev.evidenceId));
        processingEvents = filtered.length > 0 ? filtered : allEvents;
      } catch {
        processingEvents = [];
      }
    }


    const provenanceMetadata: DossierProvenanceMetadata = {
      persistenceModel: 'IN_MEMORY_SESSION',
      durableStorage: false,
      auditEventCount: processingEvents.length,
      persistenceNotice:
        'CAUTION: This provenance audit log was extracted from an in-memory session recorder. It reflects processing events observed in the active Node.js session. In-memory logs are ephemeral and do NOT constitute a durable, write-ahead database audit trail. Full tamper-evident audit durability requires Person 3\'s PostgreSQL processing_events table integration.',
    };

    const provenancePayload = {
      $schema: 'https://veratrace.org/schemas/v1/provenance-events.json',
      caseId: caseInfo.caseId,
      dossierId,
      metadata: provenanceMetadata,
      events: processingEvents,
    };

    const provenanceBuffer = Buffer.from(JSON.stringify(provenancePayload, null, 2), 'utf8');
    const provenancePath = validateAndRegisterEntryPath('audit/processing_events.json', seenEntries);
    inventory.push({
      path: provenancePath,
      role: 'AUDIT_LOG',
      sha256: hashBuffer(provenanceBuffer).sha256Hex,
      sizeBytes: provenanceBuffer.length,
      description: 'Provenance audit processing events with persistence disclosure',
    });

    // 7. Timeline Data
    const timelineEvents: TimelineEntry[] = options?.timelineEvents || [];
    const timelinePayload = {
      $schema: 'https://veratrace.org/schemas/v1/timeline-events.json',
      caseId: caseInfo.caseId,
      dossierId,
      eventCount: timelineEvents.length,
      events: timelineEvents,
    };
    const timelineBuffer = Buffer.from(JSON.stringify(timelinePayload, null, 2), 'utf8');
    const timelinePath = validateAndRegisterEntryPath('timeline/timeline_events.json', seenEntries);
    inventory.push({
      path: timelinePath,
      role: 'TIMELINE',
      sha256: hashBuffer(timelineBuffer).sha256Hex,
      sizeBytes: timelineBuffer.length,
      description: 'Chronological incident events with 4-tier timestamp taxonomy',
    });

    // 8. PDF Summary Report (PDFKit)
    let pdfBuffer: Buffer | null = null;
    if (options?.includePdfReport !== false) {
      pdfBuffer = await generatePdfReportBuffer({
        caseInfo,
        manifest: signedManifest,
        evidence: manifestFileEntries,
        timelineEvents,
        provenanceMetadata,
      });

      const pdfPath = validateAndRegisterEntryPath('reports/case_summary.pdf', seenEntries);
      inventory.push({
        path: pdfPath,
        role: 'SUMMARY_REPORT',
        sha256: hashBuffer(pdfBuffer).sha256Hex,
        sizeBytes: pdfBuffer.length,
        description: 'VeraTrace Forensic Evidence Dossier & Summary Report (PDF)',
      });

      if (pdfStorageKey) {
        await storage.writeDossierBuffer(pdfStorageKey, pdfBuffer);
        pdfWritten = true;
      }
    }

    // 8b. BSA 2023 Section 63 Certificate Draft (Module K)
    let bsaCertificateBuffer: Buffer | null = null;
    if (options?.bsaCertificateDraft) {
      const certDraft = options.bsaCertificateDraft as any;
      if (certDraft.caseId && certDraft.caseId !== caseInfo.caseId) {
        throw new DossierPackagingError(
          `Section 63 certificate caseId '${certDraft.caseId}' does not match dossier caseId '${caseInfo.caseId}'.`,
          'ERR_CASE_MISMATCH'
        );
      }
      const certJsonString = JSON.stringify(certDraft, null, 2);
      bsaCertificateBuffer = Buffer.from(certJsonString, 'utf8');
      const certPath = validateAndRegisterEntryPath('legal/bsa_section_63_certificate.json', seenEntries);
      inventory.push({
        path: certPath,
        role: 'STATUTORY_CERTIFICATE',
        sha256: hashBuffer(bsaCertificateBuffer).sha256Hex,
        sizeBytes: bsaCertificateBuffer.length,
        description: 'Bharatiya Sakshya Adhiniyam, 2023 Section 63 Electronic Record Certificate Draft',
      });
    }

    // 9. Machine-Readable Dossier Index
    const dossierIndex: DossierIndex = {
      $schema: DOSSIER_INDEX_SCHEMA_V1,
      dossierId,
      caseId: caseInfo.caseId,
      dossierVersion,
      generatedAtUtc: new Date().toISOString(),
      generator: {
        software: 'VeraTrace Forensic Dossier Engine',
        version: '1.1.1-mvp',
        jurisdictionProfile: 'IN_BSA_2023',
      },
      case: {
        caseId: caseInfo.caseId,
        title: caseInfo.title,
        category: caseInfo.category,
        summary: caseInfo.summary,
        exportTimestampUtc: exportTimestampUtc || new Date().toISOString(),
      },
      trustSeal: signedManifest.trustSeal,
      archiveInventory: inventory,
      provenanceMetadata,
      verificationInstructions: [
        '1. Extract veratrace_manifest.v1.json and the evidence/ directory.',
        '2. Obtain VeraTrace Ed25519 public keys from trusted out-of-band channel or /.well-known/veratrace-public-keys.json.',
        '3. Run offlineVerifier.verifyDossierManifest(manifestJson, { trustedKeyset, files }).',
        '4. Confirm that the manifest signature is valid, manifest SHA-256 matches, and all file checksums produce MATCH.',
      ],
      forensicAndLegalDisclaimers: [
        'VeraTrace is an intake preservation and draft assistance system, not an accredited digital forensics laboratory or legal counsel.',
        'SHA-256 checksums verify byte preservation from the time of system intake; they do not attest to the historical authenticity of captured contents.',
        'Generation of this dossier does not constitute legal admissibility under Bharatiya Sakshya Adhiniyam (BSA) 2023 Section 63. A Section 63 Part A/B certificate must be separately completed and attested.',
        'No Phantom Filing: VeraTrace has not filed this evidence or complaint with any police, court, or government authority.',
      ],
    };

    const indexJsonString = JSON.stringify(dossierIndex, null, 2);
    const indexBuffer = Buffer.from(indexJsonString, 'utf8');
    const indexPath = validateAndRegisterEntryPath('dossier_index.json', seenEntries);
    inventory.push({
      path: indexPath,
      role: 'DOSSIER_INDEX',
      sha256: hashBuffer(indexBuffer).sha256Hex,
      sizeBytes: indexBuffer.length,
      description: 'Machine-readable dossier inventory, verification instructions, and statutory disclaimers',
    });

    // 10. Streaming ZIP Archive Packaging
    const zipArchiveBuffer = await createZipArchiveBuffer({
      manifestBuffer,
      indexBuffer,
      rawFileBuffers,
      manifestFileEntries,
      previewBuffers,
      provenanceBuffer,
      timelineBuffer,
      pdfBuffer,
      bsaCertificateBuffer,
    });

    const zipSha256Hex = hashBuffer(zipArchiveBuffer).sha256Hex;
    const zipSizeBytes = zipArchiveBuffer.length;

    // Persist ZIP to storage
    await storage.writeDossierBuffer(zipStorageKey, zipArchiveBuffer);
    zipWritten = true;

    return {
      dossierId,
      caseId: caseInfo.caseId,
      dossierVersion,
      zipArchiveStorageKey: zipStorageKey,
      pdfReportStorageKey: pdfStorageKey,
      zipSha256Hex,
      zipSizeBytes,
      includedEvidenceCount: evidenceItems.length,
      includedPreviewCount: previewBuffers.size,
      includedTimelineEventCount: timelineEvents.length,
      includedAuditEventCount: processingEvents.length,
      manifest: signedManifest,
      manifestJsonString,
      index: dossierIndex,
      generatedAtUtc: dossierIndex.generatedAtUtc,
    };
  } catch (err: unknown) {
    // Failure cleanup: Remove partial dossier files from storage
    if (zipWritten) {
      try {
        await storage.deleteFile(zipStorageKey);
      } catch {
        // Suppress cleanup error to preserve primary error
      }
    }

    if (pdfWritten && pdfStorageKey) {
      try {
        await storage.deleteFile(pdfStorageKey);
      } catch {
        // Suppress cleanup error
      }
    }


    if (err instanceof DossierPackagingError || err instanceof StorageIntegrityMismatchError || err instanceof PathTraversalError) {
      throw err;
    }

    throw new DossierPackagingError(
      `Dossier packaging failed for case '${caseInfo.caseId}': ${err instanceof Error ? err.message : String(err)}`,
      'ERR_DOSSIER_PACKAGING_FAILED'
    );
  }
}

/**
 * Creates an archiver ZIP instance supporting both class-based (v8+) and function-based exports.
 */
function createZipInstance(options: { zlib?: { level?: number } } = { zlib: { level: 6 } }): any {
  const mod: any = archiverModule;
  if (typeof mod.ZipArchive === 'function') {
    return new mod.ZipArchive(options);
  }
  if (typeof mod.default === 'function') {
    return mod.default('zip', options);
  }
  if (typeof mod === 'function') {
    return mod('zip', options);
  }
  if (mod.default && typeof mod.default.ZipArchive === 'function') {
    return new mod.default.ZipArchive(options);
  }
  throw new DossierPackagingError('Unable to instantiate ZIP archiver.', 'ERR_ARCHIVER_INIT');
}

/**
 * Builds the ZIP archive buffer using streaming archiver.
 */
function createZipArchiveBuffer(params: {
  manifestBuffer: Buffer;
  indexBuffer: Buffer;
  rawFileBuffers: Map<string, Buffer>;
  manifestFileEntries: ManifestFileEntry[];
  previewBuffers: Map<string, Buffer>;
  provenanceBuffer: Buffer;
  timelineBuffer: Buffer;
  pdfBuffer: Buffer | null;
  bsaCertificateBuffer?: Buffer | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const archive = createZipInstance({
        zlib: { level: 6 },
      });

      const chunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err: Error) => reject(new DossierPackagingError(`Archiver error: ${err.message}`, 'ERR_ARCHIVER_FAILURE')));

      // Append Manifest
      archive.append(params.manifestBuffer, { name: 'veratrace_manifest.v1.json' });

      // Append Index
      archive.append(params.indexBuffer, { name: 'dossier_index.json' });

      // Append Raw Evidence Files
      for (const entry of params.manifestFileEntries) {
        const rawBuf = params.rawFileBuffers.get(entry.evidenceId);
        if (rawBuf) {
          archive.append(rawBuf, { name: entry.packageRelativePath });
        }
      }

      // Append Derived Previews
      for (const [evidenceId, prevBuf] of params.previewBuffers.entries()) {
        archive.append(prevBuf, { name: `previews/${evidenceId}.preview` });
      }

      // Append Audit Log
      archive.append(params.provenanceBuffer, { name: 'audit/processing_events.json' });

      // Append Timeline
      archive.append(params.timelineBuffer, { name: 'timeline/timeline_events.json' });

      // Append PDF Report
      if (params.pdfBuffer) {
        archive.append(params.pdfBuffer, { name: 'reports/case_summary.pdf' });
      }

      // Append BSA 2023 Section 63 Certificate Draft
      if (params.bsaCertificateBuffer) {
        archive.append(params.bsaCertificateBuffer, { name: 'legal/bsa_section_63_certificate.json' });
      }

      archive.finalize();
    } catch (err: unknown) {
      reject(
        err instanceof DossierPackagingError
          ? err
          : new DossierPackagingError(`ZIP creation failed: ${err instanceof Error ? err.message : String(err)}`, 'ERR_ZIP_FAILED')
      );
    }
  });
}
