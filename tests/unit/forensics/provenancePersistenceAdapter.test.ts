/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Unit Tests: Provenance Persistence Adapter & Repository Boundary
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 7.4 (processing_events schema), Phase 2 Milestone 3 (Line 1510)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProvenancePersistenceAdapter,
  PersistentProvenanceRecorder,
  ProvenanceRepository,
  InMemoryProvenanceRepository,
  ProvenanceError,
  ProvenancePersistenceError,
  SOFTWARE_COMPONENTS,
  ProcessingEvent,
  sortProcessingEvents,
  getProvenanceRecorder,
  setProvenanceRecorder,
  resetProvenanceRecorder,
  InMemoryProvenanceRecorder,
} from '../../../src/lib/forensics/provenanceRecorder.js';
import { getEvidenceRegister } from '../../../src/services/evidenceStore.js';
import { LocalStorageAdapter } from '../../../src/lib/storage/localStorageAdapter.js';
import { generateEd25519KeyPair } from '../../../src/lib/forensics/manifestSigner.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('ProvenancePersistenceAdapter: Core Persistence & Repository Boundary', () => {
  let repository: InMemoryProvenanceRepository;
  let adapter: ProvenancePersistenceAdapter;

  beforeEach(() => {
    repository = new InMemoryProvenanceRepository();
    adapter = new ProvenancePersistenceAdapter(repository);
  });

  afterEach(() => {
    resetProvenanceRecorder();
  });

  describe('Constructor & Repository Injection', () => {
    it('initializes cleanly with a valid repository and exposes it', () => {
      expect(adapter.getRepository()).toBe(repository);
      expect(adapter.getSequenceCounter()).toBe(0);
    });

    it('supports custom initialSequenceNumber option', () => {
      const customAdapter = new ProvenancePersistenceAdapter(repository, {
        initialSequenceNumber: 100,
      });
      expect(customAdapter.getSequenceCounter()).toBe(100);
    });

    it('rejects initialization when repository is null, undefined, or missing save()', () => {
      expect(() => new ProvenancePersistenceAdapter(null as any)).toThrow(ProvenanceError);
      expect(() => new ProvenancePersistenceAdapter({} as any)).toThrow(ProvenanceError);
      try {
        new ProvenancePersistenceAdapter(null as any);
        expect.unreachable('Should have thrown on null repository');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProvenanceError);
        expect(err.code).toBe('ERR_INVALID_REPOSITORY');
      }
    });

    it('exports PersistentProvenanceRecorder as an alias for ProvenancePersistenceAdapter', () => {
      expect(PersistentProvenanceRecorder).toBe(ProvenancePersistenceAdapter);
    });
  });

  describe('Successful Event Persistence', () => {
    it('persists an event conforming strictly to Blueprint Section 7.4 schema', async () => {
      const event = await adapter.recordEvent({
        evidenceId: 'ev-adapter-001',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        details: JSON.stringify({ filename: 'test_doc.pdf', mimeType: 'application/pdf' }),
      });

      expect(event.id).toBeDefined();
      expect(typeof event.id).toBe('string');
      // UUID v4 format
      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(event.evidenceId).toBe('ev-adapter-001');
      expect(event.eventType).toBe('FILE_INTAKE_RECEIVED');
      expect(event.eventOutcome).toBe('SUCCESS');
      expect(event.softwareComponent).toBe(SOFTWARE_COMPONENTS.INTAKE_ENGINE);
      expect(event.occurredAtUtc).toBeDefined();
      expect(new Date(event.occurredAtUtc).toISOString()).toBe(event.occurredAtUtc);
      expect(event.sequenceNumber).toBe(1);
      expect(adapter.getSequenceCounter()).toBe(1);

      // Verify stored in the injected repository
      const inRepo = await repository.findById(event.id);
      expect(inRepo).not.toBeNull();
      expect(inRepo?.id).toBe(event.id);
      expect(inRepo?.evidenceId).toBe('ev-adapter-001');
    });

    it('preserves caller-supplied event ID and occurredAtUtc timestamp', async () => {
      const customId = '77777777-4444-4444-8888-111111111111';
      const customTime = '2026-10-25T10:00:00.000Z';

      const event = await adapter.recordEvent({
        id: customId,
        evidenceId: 'ev-adapter-custom',
        eventType: 'STREAMING_SHA256_COMPUTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
        occurredAtUtc: customTime,
      });

      expect(event.id).toBe(customId);
      expect(event.occurredAtUtc).toBe(customTime);
    });

    it('enforces append-only immutability and returns frozen defensive copies', async () => {
      const event = await adapter.recordEvent({
        evidenceId: 'ev-freeze-test',
        eventType: 'MAGIC_BYTES_VERIFIED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.CONTENT_SNIFFER,
      });

      expect(Object.isFrozen(event)).toBe(true);
      expect(() => {
        (event as any).eventType = 'MUTATED';
      }).toThrow();

      const events = await adapter.getEventsByEvidenceId('ev-freeze-test');
      expect(Object.isFrozen(events[0])).toBe(true);
      events.pop(); // Mutate array

      const fresh = await adapter.getEventsByEvidenceId('ev-freeze-test');
      expect(fresh).toHaveLength(1);
    });

    it('supports repositories where save() returns void', async () => {
      const voidRepo: ProvenanceRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        findByEvidenceId: vi.fn().mockResolvedValue([]),
        findAll: vi.fn().mockResolvedValue([]),
      };

      const voidAdapter = new ProvenancePersistenceAdapter(voidRepo);
      const event = await voidAdapter.recordEvent({
        evidenceId: 'ev-void-repo',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      });

      expect(event.evidenceId).toBe('ev-void-repo');
      expect(event.sequenceNumber).toBe(1);
      expect(voidRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('Persistence Failures & Rollback Semantics', () => {
    it('throws ProvenancePersistenceError when repository save() fails', async () => {
      const failingRepo: ProvenanceRepository = {
        save: vi.fn().mockRejectedValue(new Error('PostgreSQL connection timeout: pool exhausted')),
        findByEvidenceId: vi.fn().mockResolvedValue([]),
        findAll: vi.fn().mockResolvedValue([]),
      };

      const failingAdapter = new ProvenancePersistenceAdapter(failingRepo);

      await expect(
        failingAdapter.recordEvent({
          evidenceId: 'ev-fail-001',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        })
      ).rejects.toThrow(ProvenancePersistenceError);

      try {
        await failingAdapter.recordEvent({
          evidenceId: 'ev-fail-001',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProvenanceError);
        expect(err).toBeInstanceOf(ProvenancePersistenceError);
        expect(err.code).toBe('ERR_PERSISTENCE_FAILED');
        expect(err.message).toContain('PostgreSQL connection timeout');
        expect(err.cause).toBeDefined();
      }
    });

    it('does NOT advance sequenceCounter when repository save() fails (no phantom increments)', async () => {
      let shouldFail = true;
      const intermittentRepo: ProvenanceRepository = {
        save: vi.fn().mockImplementation(async (event: ProcessingEvent) => {
          if (shouldFail) {
            throw new Error('Database disk full');
          }
          return event;
        }),
        findByEvidenceId: vi.fn().mockResolvedValue([]),
        findAll: vi.fn().mockResolvedValue([]),
      };

      const testAdapter = new ProvenancePersistenceAdapter(intermittentRepo);
      expect(testAdapter.getSequenceCounter()).toBe(0);

      // 1. Attempt fails
      await expect(
        testAdapter.recordEvent({
          evidenceId: 'ev-recover-01',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        })
      ).rejects.toThrow(ProvenancePersistenceError);

      // Counter should remain 0
      expect(testAdapter.getSequenceCounter()).toBe(0);

      // 2. Recovery: repository recovers
      shouldFail = false;
      const recoveredEvent = await testAdapter.recordEvent({
        evidenceId: 'ev-recover-01',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      });

      // The recovered event receives sequenceNumber 1 (no gap created by earlier failure)
      expect(recoveredEvent.sequenceNumber).toBe(1);
      expect(testAdapter.getSequenceCounter()).toBe(1);
    });

    it('throws ProvenancePersistenceError when findByEvidenceId fails', async () => {
      const queryFailRepo: ProvenanceRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        findByEvidenceId: vi.fn().mockRejectedValue(new Error('Connection reset by peer')),
        findAll: vi.fn().mockResolvedValue([]),
      };

      const queryFailAdapter = new ProvenancePersistenceAdapter(queryFailRepo);

      await expect(
        queryFailAdapter.getEventsByEvidenceId('ev-fail')
      ).rejects.toThrow(ProvenancePersistenceError);

      try {
        await queryFailAdapter.getEventsByEvidenceId('ev-fail');
      } catch (err: any) {
        expect(err.code).toBe('ERR_PERSISTENCE_QUERY_FAILED');
      }
    });

    it('throws ProvenancePersistenceError when findAll fails', async () => {
      const queryFailRepo: ProvenanceRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        findByEvidenceId: vi.fn().mockResolvedValue([]),
        findAll: vi.fn().mockRejectedValue(new Error('Query execution cancelled')),
      };

      const queryFailAdapter = new ProvenancePersistenceAdapter(queryFailRepo);

      await expect(queryFailAdapter.getAllEvents()).rejects.toThrow(ProvenancePersistenceError);

      try {
        await queryFailAdapter.getAllEvents();
      } catch (err: any) {
        expect(err.code).toBe('ERR_PERSISTENCE_QUERY_FAILED');
      }
    });

    it('validates input parameters before interacting with repository', async () => {
      const spySave = vi.spyOn(repository, 'save');

      // Empty evidenceId
      await expect(
        adapter.recordEvent({
          evidenceId: '',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        })
      ).rejects.toThrow('ProcessingEvent requires a valid non-empty evidenceId.');

      // Empty eventType
      await expect(
        adapter.recordEvent({
          evidenceId: 'ev-1',
          eventType: '' as any,
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        })
      ).rejects.toThrow('ProcessingEvent requires a valid non-empty eventType.');

      // Invalid eventOutcome
      await expect(
        adapter.recordEvent({
          evidenceId: 'ev-1',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'UNKNOWN' as any,
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        })
      ).rejects.toThrow("Invalid eventOutcome 'UNKNOWN'");

      // Empty softwareComponent
      await expect(
        adapter.recordEvent({
          evidenceId: 'ev-1',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'SUCCESS',
          softwareComponent: '',
        })
      ).rejects.toThrow('ProcessingEvent requires a valid non-empty softwareComponent.');

      // Ensure repository.save was never touched
      expect(spySave).not.toHaveBeenCalled();
    });
  });

  describe('Event Ordering & Chronological Determinism', () => {
    it('records multiple sequential events with strictly increasing monotonic sequence numbers', async () => {
      const evidenceId = 'ev-order-seq';

      const ev1 = await adapter.recordEvent({
        evidenceId,
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
      });

      const ev2 = await adapter.recordEvent({
        evidenceId,
        eventType: 'STREAMING_SHA256_COMPUTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
      });

      const ev3 = await adapter.recordEvent({
        evidenceId,
        eventType: 'MAGIC_BYTES_VERIFIED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.CONTENT_SNIFFER,
      });

      expect(ev1.sequenceNumber).toBe(1);
      expect(ev2.sequenceNumber).toBe(2);
      expect(ev3.sequenceNumber).toBe(3);

      const events = await adapter.getEventsByEvidenceId(evidenceId);
      expect(events.map((e) => e.sequenceNumber)).toEqual([1, 2, 3]);
      expect(events.map((e) => e.eventType)).toEqual([
        'FILE_INTAKE_RECEIVED',
        'STREAMING_SHA256_COMPUTED',
        'MAGIC_BYTES_VERIFIED',
      ]);
    });

    it('sorts events deterministically even if underlying repository returns them out of order', async () => {
      // Simulate an unordered database table query return
      const shuffledEvents: ProcessingEvent[] = [
        {
          id: 'ev-3-uuid',
          evidenceId: 'ev-shuffle',
          eventType: 'RAW_PROMOTION_COMMITTED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.STORAGE_ADAPTER,
          occurredAtUtc: '2026-10-25T12:00:03.000Z',
          sequenceNumber: 3,
        },
        {
          id: 'ev-1-uuid',
          evidenceId: 'ev-shuffle',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
          occurredAtUtc: '2026-10-25T12:00:01.000Z',
          sequenceNumber: 1,
        },
        {
          id: 'ev-2-uuid',
          evidenceId: 'ev-shuffle',
          eventType: 'STREAMING_SHA256_COMPUTED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
          occurredAtUtc: '2026-10-25T12:00:02.000Z',
          sequenceNumber: 2,
        },
      ];

      const unorderedRepo: ProvenanceRepository = {
        save: vi.fn(),
        findByEvidenceId: vi.fn().mockResolvedValue([...shuffledEvents]),
        findAll: vi.fn().mockResolvedValue([...shuffledEvents]),
      };

      const orderingAdapter = new ProvenancePersistenceAdapter(unorderedRepo);

      const orderedByEvidence = await orderingAdapter.getEventsByEvidenceId('ev-shuffle');
      expect(orderedByEvidence.map((e) => e.sequenceNumber)).toEqual([1, 2, 3]);
      expect(orderedByEvidence.map((e) => e.eventType)).toEqual([
        'FILE_INTAKE_RECEIVED',
        'STREAMING_SHA256_COMPUTED',
        'RAW_PROMOTION_COMMITTED',
      ]);

      const orderedAll = await orderingAdapter.getAllEvents();
      expect(orderedAll.map((e) => e.sequenceNumber)).toEqual([1, 2, 3]);
    });

    it('sorts by occurredAtUtc timestamp when sequence numbers are absent or identical', () => {
      const rawEvents: ProcessingEvent[] = [
        {
          id: 'b',
          evidenceId: 'ev-ts',
          eventType: 'MAGIC_BYTES_VERIFIED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.CONTENT_SNIFFER,
          occurredAtUtc: '2026-10-25T14:30:00.000Z',
        },
        {
          id: 'a',
          evidenceId: 'ev-ts',
          eventType: 'FILE_INTAKE_RECEIVED',
          eventOutcome: 'SUCCESS',
          softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
          occurredAtUtc: '2026-10-25T14:00:00.000Z',
        },
      ];

      const sorted = sortProcessingEvents(rawEvents);
      expect(sorted[0].id).toBe('a');
      expect(sorted[1].id).toBe('b');
    });
  });

  describe('Idempotency & Deduplication', () => {
    it('returns existing event when replaying with explicit event ID (via findById)', async () => {
      const explicitId = '88888888-9999-4444-aaaa-bbbbbbbbbbbb';

      const first = await adapter.recordEvent({
        id: explicitId,
        evidenceId: 'ev-idem-01',
        eventType: 'STREAMING_SHA256_COMPUTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
        details: 'digest:abc12345',
      });

      const second = await adapter.recordEvent({
        id: explicitId,
        evidenceId: 'ev-idem-01',
        eventType: 'STREAMING_SHA256_COMPUTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.STREAMING_HASHER,
        details: 'digest:abc12345',
      });

      expect(first.id).toBe(second.id);
      expect(first.sequenceNumber).toBe(second.sequenceNumber);

      const all = await adapter.getEventsByEvidenceId('ev-idem-01');
      expect(all).toHaveLength(1);
    });

    it('returns existing event when replaying with idempotencyKey (via findByIdempotencyKey)', async () => {
      const key = 'intake-idempotency-key-001';

      const evA = await adapter.recordEvent({
        evidenceId: 'ev-idem-02',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        idempotencyKey: key,
      });

      const evB = await adapter.recordEvent({
        evidenceId: 'ev-idem-02',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        idempotencyKey: key,
      });

      expect(evA.id).toBe(evB.id);

      const all = await adapter.getEventsByEvidenceId('ev-idem-02');
      expect(all).toHaveLength(1);
    });

    it('handles idempotency fallback gracefully when findById / findByIdempotencyKey are omitted', async () => {
      const minimalStorage: ProcessingEvent[] = [];

      const minimalRepo: ProvenanceRepository = {
        save: vi.fn().mockImplementation(async (event: ProcessingEvent) => {
          minimalStorage.push(event);
          return event;
        }),
        findByEvidenceId: vi.fn().mockImplementation(async (evId: string) => {
          return minimalStorage.filter((e) => e.evidenceId === evId);
        }),
        findAll: vi.fn().mockImplementation(async () => [...minimalStorage]),
      };

      const fallbackAdapter = new ProvenancePersistenceAdapter(minimalRepo);

      const fixedId = '22222222-3333-4444-5555-666666666666';
      const event1 = await fallbackAdapter.recordEvent({
        id: fixedId,
        evidenceId: 'ev-fallback',
        eventType: 'MANIFEST_SEALED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.MANIFEST_SIGNER,
      });

      const event2 = await fallbackAdapter.recordEvent({
        id: fixedId,
        evidenceId: 'ev-fallback',
        eventType: 'MANIFEST_SEALED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.MANIFEST_SIGNER,
      });

      expect(event1.id).toBe(event2.id);
      expect(minimalStorage).toHaveLength(1);
    });

    it('does not suppress distinct events occurring across different operational steps', async () => {
      const audit1 = await adapter.recordEvent({
        evidenceId: 'ev-distinct',
        eventType: 'VERIFICATION_AUDIT_EXECUTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.OFFLINE_VERIFIER,
        details: 'Audit run 1',
      });

      const audit2 = await adapter.recordEvent({
        evidenceId: 'ev-distinct',
        eventType: 'VERIFICATION_AUDIT_EXECUTED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.OFFLINE_VERIFIER,
        details: 'Audit run 2',
      });

      expect(audit1.id).not.toBe(audit2.id);
      expect(audit1.sequenceNumber).toBe(1);
      expect(audit2.sequenceNumber).toBe(2);

      const list = await adapter.getEventsByEvidenceId('ev-distinct');
      expect(list).toHaveLength(2);
    });
  });

  describe('Global Singleton & Factory Utilities', () => {
    it('allows setting and resetting default singleton provenance recorder', () => {
      const initial = getProvenanceRecorder();
      expect(initial).toBeInstanceOf(InMemoryProvenanceRecorder);

      const customRepo = new InMemoryProvenanceRepository();
      const customAdapter = new ProvenancePersistenceAdapter(customRepo);
      setProvenanceRecorder(customAdapter);

      expect(getProvenanceRecorder()).toBe(customAdapter);

      resetProvenanceRecorder();
      expect(getProvenanceRecorder()).toBeInstanceOf(InMemoryProvenanceRecorder);
      expect(getProvenanceRecorder()).not.toBe(customAdapter);
    });
  });

  describe('InMemoryProvenanceRepository Contract Verification', () => {
    it('supports clear() and independent queries across multiple evidence items', async () => {
      const repo = new InMemoryProvenanceRepository();

      await repo.save({
        id: 'ev1-a',
        evidenceId: 'item-1',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        occurredAtUtc: new Date().toISOString(),
      });

      await repo.save({
        id: 'ev2-a',
        evidenceId: 'item-2',
        eventType: 'FILE_INTAKE_RECEIVED',
        eventOutcome: 'SUCCESS',
        softwareComponent: SOFTWARE_COMPONENTS.INTAKE_ENGINE,
        occurredAtUtc: new Date().toISOString(),
      });

      const item1Events = await repo.findByEvidenceId('item-1');
      expect(item1Events).toHaveLength(1);
      expect(item1Events[0].id).toBe('ev1-a');

      const all = await repo.findAll();
      expect(all).toHaveLength(2);

      repo.clear();
      expect(await repo.findAll()).toHaveLength(0);
      expect(await repo.findByEvidenceId('item-1')).toHaveLength(0);
    });
  });
});

describe('Full Evidence Preservation Pipeline with Persistent Adapter', () => {
  let tempDir: string;
  let storage: LocalStorageAdapter;
  let repository: InMemoryProvenanceRepository;
  let adapter: ProvenancePersistenceAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'veratrace-adapter-pipe-test-'));
    storage = new LocalStorageAdapter(tempDir);
    repository = new InMemoryProvenanceRepository();
    adapter = new ProvenancePersistenceAdapter(repository);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  it('persists complete custody chain through EvidenceRegister into injected repository', async () => {
    const caseId = 'case-persistent-pipe';
    const register = getEvidenceRegister(caseId, storage, adapter);

    // 1. Ingest evidence record
    const record = await register.addRecord({
      name: 'screenshot_evidence.png',
      buffer: validPngBuffer,
    });

    // 2. Generate and sign manifest
    const { keyId, privateKeyPem, keyEntry } = generateEd25519KeyPair({
      keyId: 'seal-persistent-key',
    });
    const signed = await register.generateAndSignManifest(
      { title: 'Persistent Custody Case', category: 'CYBERSTALKING' },
      privateKeyPem,
      { signingKeyId: keyId }
    );

    // 3. Verify manifest
    const report = await register.verifyDossier(signed, [keyEntry], {
      [signed.files[0].packageRelativePath]: validPngBuffer,
    });
    expect(report.overallStatus).toBe('MATCH');

    // 4. Inspect complete chain of custody from adapter
    const adapterEvents = await adapter.getEventsByEvidenceId(record.evidenceId);
    expect(adapterEvents.length).toBeGreaterThanOrEqual(7);

    // 5. Inspect directly from injected repository to prove durable persistence boundary
    const repoEvents = await repository.findByEvidenceId(record.evidenceId);
    expect(repoEvents).toHaveLength(adapterEvents.length);

    // Strict sequence order verification
    const seqs = repoEvents.map((e) => e.sequenceNumber);
    for (let i = 0; i < seqs.length; i++) {
      expect(seqs[i]).toBe(i + 1);
    }

    const types = repoEvents.map((e) => e.eventType);
    expect(types).toContain('FILE_INTAKE_RECEIVED');
    expect(types).toContain('STREAMING_SHA256_COMPUTED');
    expect(types).toContain('MAGIC_BYTES_VERIFIED');
    expect(types).toContain('DEVICE_METADATA_EXTRACTED');
    expect(types).toContain('RAW_PROMOTION_COMMITTED');
    expect(types).toContain('MANIFEST_SEALED');
    expect(types).toContain('VERIFICATION_AUDIT_EXECUTED');
  });
});
