/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Module F — Provenance Recorder & Processing Audit Logger
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 7.4 (processing_events schema), Phase 2 Milestone 3 (Line 1510)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryProvenanceRecorder,
  ProvenanceError,
  SOFTWARE_COMPONENTS,
  ProcessingEvent,
} from '../../../src/lib/forensics/provenanceRecorder.js';
import {
  ingestEvidence,
  promoteIngestedEvidence,
} from '../../../src/lib/forensics/evidencePipeline.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/localStorageAdapter.js';
import { getEvidenceRegister } from '../../../src/services/evidenceStore.js';
import {
  getEvidenceForCase,
  syncEvidenceRecord,
  clearEvidenceForCase,
} from '../../../src/services/evidenceService.js';
// @ts-ignore
import { useEvidenceForCase } from '../../../src/hooks/useEvidenceForCase.js';
import { generateEd25519KeyPair } from '../../../src/lib/forensics/manifestSigner.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Module F: Provenance Recorder (Core Audit Logic)', () => {
  let recorder: InMemoryProvenanceRecorder;

  beforeEach(() => {
    recorder = new InMemoryProvenanceRecorder();
  });

  it('records an event conforming strictly to Blueprint Section 7.4 schema', async () => {
    const event = await recorder.recordEvent({
      evidenceId: 'ev-test-001',
      eventType: 'FILE_INTAKE_RECEIVED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      details: JSON.stringify({ filename: 'screenshot.png' }),
    });

    expect(event.id).toBeDefined();
    expect(typeof event.id).toBe('string');
    // UUID v4 format
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(event.evidenceId).toBe('ev-test-001');
    expect(event.eventType).toBe('FILE_INTAKE_RECEIVED');
    expect(event.eventOutcome).toBe('SUCCESS');
    expect(event.softwareComponent).toBe(SOFTWARE_COMPONENTS.INTAKE_ENGINE);
    expect(event.occurredAtUtc).toBeDefined();
    expect(new Date(event.occurredAtUtc).toISOString()).toBe(event.occurredAtUtc);
    expect(event.sequenceNumber).toBe(1);
  });

  it('enforces append-only immutability (frozen objects & defensive copies)', async () => {
    const event = await recorder.recordEvent({
      evidenceId: 'ev-test-002',
      eventType: 'MAGIC_BYTES_VERIFIED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.CONTENT_SNIFFER,
    });

    // Object is frozen: attempts to mutate throw in strict mode
    expect(Object.isFrozen(event)).toBe(true);
    expect(() => {
      (event as any).eventType = 'MUTATED';
    }).toThrow();

    // Query result returns defensive copy
    const events = await recorder.getEventsByEvidenceId('ev-test-002');
    events.pop(); // Mutate returned array

    const freshQuery = await recorder.getEventsByEvidenceId('ev-test-002');
    expect(freshQuery).toHaveLength(1);
  });

  it('validates required fields and throws ProvenanceError on invalid input', async () => {
    await expect(
      recorder.recordEvent({
        evidenceId: '',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      })
    ).rejects.toThrow(ProvenanceError);

    await expect(
      recorder.recordEvent({
        evidenceId: 'ev-1',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'MAYBE' as any,
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      })
    ).rejects.toThrow(/Invalid eventOutcome/);

    await expect(
      recorder.recordEvent({
        evidenceId: 'ev-1',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: '',
      })
    ).rejects.toThrow(ProvenanceError);
  });

  it('handles duplicate operational retries idempotently via explicit eventId or idempotencyKey', async () => {
    const eventId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

    const event1 = await recorder.recordEvent({
      id: eventId,
      evidenceId: 'ev-retry-001',
      eventType: 'STREAMING_SHA256_COMPUTED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
      details: 'sha256:abc123',
    });

    const event2 = await recorder.recordEvent({
      id: eventId,
      evidenceId: 'ev-retry-001',
      eventType: 'STREAMING_SHA256_COMPUTED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
      details: 'sha256:abc123',
    });

    expect(event1.id).toBe(event2.id);
    const all = await recorder.getEventsByEvidenceId('ev-retry-001');
    expect(all).toHaveLength(1);

    // Also works with explicit idempotencyKey
    const eventA = await recorder.recordEvent({
      evidenceId: 'ev-retry-002',
      eventType: 'RAW_PROMOTION_COMMITTED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
      idempotencyKey: 'promo-ev-002-try-1',
    });

    const eventB = await recorder.recordEvent({
      evidenceId: 'ev-retry-002',
      eventType: 'RAW_PROMOTION_COMMITTED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
      idempotencyKey: 'promo-ev-002-try-1',
    });

    expect(eventA.id).toBe(eventB.id);
  });

  it('does NOT suppress legitimate repeated events (such as multiple verification audits over time)', async () => {
    // Audit run 1
    const audit1 = await recorder.recordEvent({
      evidenceId: 'ev-multi-audit',
      eventType: 'VERIFICATION_AUDIT_EXECUTED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.OFFLINE_VERIFIER,
      details: JSON.stringify({ status: 'MATCH', run: 1 }),
    });

    // Audit run 2 (e.g. before court submission)
    const audit2 = await recorder.recordEvent({
      evidenceId: 'ev-multi-audit',
      eventType: 'VERIFICATION_AUDIT_EXECUTED',
      eventOutcome: 'SUCCESS',
      softwareComponent: SOFTWARE_COMPONENTS.OFFLINE_VERIFIER,
      details: JSON.stringify({ status: 'MATCH', run: 2 }),
    });

    expect(audit1.id).not.toBe(audit2.id);
    expect(audit1.sequenceNumber).toBe(1);
    expect(audit2.sequenceNumber).toBe(2);

    const events = await recorder.getEventsByEvidenceId('ev-multi-audit');
    expect(events).toHaveLength(2);
  });
});

describe('Pipeline Integration: Chain of Custody Through Ingestion', () => {
  let tempDir: string;
  let storage: LocalStorageAdapter;
  let recorder: InMemoryProvenanceRecorder;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'veratrace-provenance-test-'));
    storage = new LocalStorageAdapter(tempDir);
    recorder = new InMemoryProvenanceRecorder();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 px
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  it('records correct sequence of processing events for successful ingestion & promotion', async () => {
    const caseId = 'case-chain-001';
    const evidenceId = 'ev-chain-success';

    // 1. Ingest
    const ingested = await ingestEvidence(storage, {
      caseId,
      evidenceId,
      originalFilename: 'evidence_screen.png',
      source: validPngBuffer,
      provenanceRecorder: recorder,
    });

    // 2. Promote
    const promoted = await promoteIngestedEvidence(storage, ingested, recorder);
    expect(promoted.intakeStatus).toBe('PROMOTED');

    // 3. Inspect Chain of Custody
    const events = await recorder.getEventsByEvidenceId(evidenceId);
    expect(events).toHaveLength(5);

    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toEqual([
      'FILE_INTAKE_RECEIVED',
      'STREAMING_SHA256_COMPUTED',
      'MAGIC_BYTES_VERIFIED',
      'DEVICE_METADATA_EXTRACTED',
      'RAW_PROMOTION_COMMITTED',
    ]);

    expect(events.every((e) => e.eventOutcome === 'SUCCESS')).toBe(true);

    // Verify software component attribution
    expect(events[0].softwareComponent).toBe(SOFTWARE_COMPONENTS.INTAKE_ENGINE);
    expect(events[1].softwareComponent).toBe(SOFTWARE_COMPONENTS.STREAMING_HASHER);
    expect(events[2].softwareComponent).toBe(SOFTWARE_COMPONENTS.CONTENT_SNIFFER);
    expect(events[3].softwareComponent).toBe(SOFTWARE_COMPONENTS.METADATA_EXTRACTOR);
    expect(events[4].softwareComponent).toBe(SOFTWARE_COMPONENTS.STORAGE_ADAPTER);
  });

  it('records failure event and aborts pipeline on empty 0-byte stream', async () => {
    const evidenceId = 'ev-empty-fail';

    await expect(
      ingestEvidence(storage, {
        caseId: 'case-fail',
        evidenceId,
        originalFilename: 'empty.png',
        source: Buffer.alloc(0),
        provenanceRecorder: recorder,
      })
    ).rejects.toThrow();

    const events = await recorder.getEventsByEvidenceId(evidenceId);
    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe('FILE_INTAKE_RECEIVED');
    expect(events[0].eventOutcome).toBe('SUCCESS');

    expect(events[1].eventType).toBe('STREAMING_SHA256_COMPUTED');
    expect(events[1].eventOutcome).toBe('FAILED');
    expect(events[1].details).toContain('0-byte empty evidence file');
  });

  it('records failure event on magic bytes validation failure (executable script blocked)', async () => {
    const evidenceId = 'ev-exe-blocked';
    const bashScript = Buffer.from('#!/bin/bash\nrm -rf /');

    await expect(
      ingestEvidence(storage, {
        caseId: 'case-blocked',
        evidenceId,
        originalFilename: 'attack.sh',
        source: bashScript,
        provenanceRecorder: recorder,
      })
    ).rejects.toThrow();

    const events = await recorder.getEventsByEvidenceId(evidenceId);
    expect(events).toHaveLength(3);
    expect(events[0].eventType).toBe('FILE_INTAKE_RECEIVED');
    expect(events[1].eventType).toBe('STREAMING_SHA256_COMPUTED');
    expect(events[1].eventOutcome).toBe('SUCCESS');

    // Failed at magic-byte sniffing stage
    expect(events[2].eventType).toBe('MAGIC_BYTES_VERIFIED');
    expect(events[2].eventOutcome).toBe('FAILED');
  });
});

describe('EvidenceRegister Integration & Manifest / Verifier Events', () => {
  let tempDir: string;
  let storage: LocalStorageAdapter;
  let recorder: InMemoryProvenanceRecorder;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'veratrace-reg-prov-test-'));
    storage = new LocalStorageAdapter(tempDir);
    recorder = new InMemoryProvenanceRecorder();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  it('records MANIFEST_SEALED and VERIFICATION_AUDIT_EXECUTED through EvidenceRegister', async () => {
    const caseId = 'case-full-custody';
    const register = getEvidenceRegister(caseId, storage, recorder);

    // 1. Ingest evidence record
    const record = await register.addRecord({
      name: 'screenshot.png',
      buffer: validPngBuffer,
    });

    // 2. Generate and sign manifest
    const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({ keyId: 'seal-key-2026' });
    const signed = await register.generateAndSignManifest(
      { title: 'Custody Case', category: 'HARASSMENT' },
      privateKeyPem,
      { signingKeyId: keyId }
    );

    // 3. Verify manifest
    const report = await register.verifyDossier(signed, [keyEntry], {
      [signed.files[0].packageRelativePath]: validPngBuffer,
    });
    expect(report.overallStatus).toBe('MATCH');

    // 4. Inspect complete chain of custody
    const events = await register.getProcessingEvents(record.evidenceId);
    expect(events.length).toBeGreaterThanOrEqual(7);

    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('FILE_INTAKE_RECEIVED');
    expect(eventTypes).toContain('STREAMING_SHA256_COMPUTED');
    expect(eventTypes).toContain('MAGIC_BYTES_VERIFIED');
    expect(eventTypes).toContain('DEVICE_METADATA_EXTRACTED');
    expect(eventTypes).toContain('RAW_PROMOTION_COMMITTED');
    expect(eventTypes).toContain('MANIFEST_SEALED');
    expect(eventTypes).toContain('VERIFICATION_AUDIT_EXECUTED');

    const manifestEvent = events.find((e) => e.eventType === 'MANIFEST_SEALED')!;
    expect(manifestEvent.softwareComponent).toBe(SOFTWARE_COMPONENTS.MANIFEST_SIGNER);
    expect(manifestEvent.details).toContain('seal-key-2026');

    const auditEvent = events.find((e) => e.eventType === 'VERIFICATION_AUDIT_EXECUTED')!;
    expect(auditEvent.eventOutcome).toBe('SUCCESS');
    expect(auditEvent.softwareComponent).toBe(SOFTWARE_COMPONENTS.OFFLINE_VERIFIER);
  });
});

describe('Evidence Service & Hook Seam (Browser Safe)', () => {
  const caseId = 'case-hook-test';

  beforeEach(() => {
    clearEvidenceForCase(caseId);
  });

  afterEach(() => {
    clearEvidenceForCase(caseId);
  });

  it('synchronizes evidence records and retrieves them via getEvidenceForCase and useEvidenceForCase', () => {
    // 1. When uninitialized, hook returns mock fallback
    const mockResult = useEvidenceForCase(caseId);
    expect(mockResult.loading).toBe(false);

    // 2. Synchronize real evidence record
    syncEvidenceRecord(caseId, {
      evidenceId: 'ev-live-001',
      caseId,
      fileName: 'live_evidence.png',
      originalFilename: 'orig.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      recordedAt: '2026-10-25T01:00:00.000Z',
      sha256: 'abc1234567890123456789012345678901234567890123456789012345678901',
      verificationStatus: 'MATCH',
      storageKey: 'raw/case-hook-test/ev-live-001.raw',
      intakeStatus: 'PROMOTED',
    });

    // 3. Service returns live preserved records
    const liveRecords = getEvidenceForCase(caseId);
    expect(liveRecords).toHaveLength(1);
    expect(liveRecords[0].evidenceId).toBe('ev-live-001');

    // 4. Hook returns live records
    const hookResult = useEvidenceForCase(caseId);
    expect(hookResult.data).toHaveLength(1);
    expect((hookResult.data as any[])[0].evidenceId).toBe('ev-live-001');
  });
});
