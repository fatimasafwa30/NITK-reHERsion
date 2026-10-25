/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module F: Provenance Recorder & Processing Audit Logger
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1
 * Sections: 7.4 (processing_events schema, Lines 718-731), Phase 2 Milestone 3 (Line 1510)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Implements an append-only chain of custody recording all lifecycle transitions
 * for digital evidence items from ingestion through verification.
 */

import { ForensicsError } from './forensicsTypes.js';

/**
 * Isomorphic RFC 4122 v4 UUID generator safe for both Node.js and browser runtimes.
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

export class ProvenanceError extends ForensicsError {
  constructor(message: string, code: string = 'ERR_PROVENANCE_ERROR') {
    super(message, code);
    this.name = 'ProvenanceError';
  }
}

/**
 * Specialized error thrown when persistence operations (save, query, transaction) fail.
 */
export class ProvenancePersistenceError extends ProvenanceError {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown, code: string = 'ERR_PERSISTENCE_FAILED') {
    super(message, code);
    this.name = 'ProvenancePersistenceError';
    this.cause = cause;
  }
}

/**
 * Standard Processing Event Types
 * Conforms to Blueprint Section 7.4 (processing_events table)
 */
export type ProcessingEventType =
  | 'FILE_INTAKE_RECEIVED'
  | 'MAGIC_BYTES_VERIFIED'
  | 'STREAMING_SHA256_COMPUTED'
  | 'DEVICE_METADATA_EXTRACTED'
  | 'RAW_PROMOTION_COMMITTED'
  | 'MANIFEST_SEALED'
  | 'VERIFICATION_AUDIT_EXECUTED';

/**
 * Event outcome status matching Blueprint Section 7.4 event_outcome column
 */
export type ProcessingEventOutcome = 'SUCCESS' | 'FAILED';

/**
 * ProcessingEvent record adhering strictly to Blueprint Section 7.4 schema:
 *
 * model ProcessingEvent {
 *   id                 String    @id @default(uuid()) @db.Uuid
 *   evidenceId         String    @map("evidence_id") @db.Uuid
 *   eventType          String    @map("event_type") @db.VarChar(50)
 *   eventOutcome       String    @map("event_outcome") @db.VarChar(20)
 *   softwareComponent  String    @map("software_component") @db.VarChar(100)
 *   details            String?   @db.Text
 *   occurredAtUtc      DateTime  @default(now()) @map("occurred_at_utc")
 * }
 */
export interface ProcessingEvent {
  id: string;
  evidenceId: string;
  eventType: ProcessingEventType;
  eventOutcome: ProcessingEventOutcome;
  softwareComponent: string;
  details?: string;
  occurredAtUtc: string;
  sequenceNumber?: number;
  idempotencyKey?: string;
}

/**
 * Standard Software Component Identifiers
 */
export const SOFTWARE_COMPONENTS = Object.freeze({
  INTAKE_ENGINE: 'VeraTrace Evidence Intake Engine',
  CONTENT_SNIFFER: 'VeraTrace Content Sniffer',
  STREAMING_HASHER: 'VeraTrace Forensic Streaming Hasher',
  METADATA_EXTRACTOR: 'VeraTrace Metadata Extractor',
  STORAGE_ADAPTER: 'VeraTrace Forensics Storage Adapter',
  MANIFEST_SIGNER: 'VeraTrace Ed25519 Manifest Signer',
  OFFLINE_VERIFIER: 'VeraTrace Standalone Verifier',
} as const);

/**
 * Abstract interface for Provenance Recording and Chain-of-Custody Storage.
 * Enables clean separation between in-memory/local development adapters
 * and Person 3's eventual PostgreSQL / Prisma production persistence layer.
 */
export interface ProvenanceRecorder {
  recordEvent(
    event: Omit<ProcessingEvent, 'id' | 'occurredAtUtc'> & {
      id?: string;
      occurredAtUtc?: string;
      sequenceNumber?: number;
      idempotencyKey?: string;
    }
  ): Promise<ProcessingEvent>;

  getEventsByEvidenceId(evidenceId: string): Promise<ProcessingEvent[]>;
  getAllEvents(): Promise<ProcessingEvent[]>;
}

/**
 * In-Memory Append-Only Provenance Recorder
 *
 * NOTE ON DURABILITY:
 * This implementation provides strict in-memory append-only audit tracking suitable for
 * prototype runs, unit tests, and local session processing.
 * Durable, tamper-resistant database auditing requires integration with PostgreSQL / Prisma
 * when Person 3 provides the backend data layer.
 */
export class InMemoryProvenanceRecorder implements ProvenanceRecorder {
  private readonly events: ProcessingEvent[] = [];
  private readonly evidenceIndex: Map<string, ProcessingEvent[]> = new Map();
  private readonly eventsById: Map<string, ProcessingEvent> = new Map();
  private readonly idempotencyIndex: Map<string, ProcessingEvent> = new Map();
  private sequenceCounter: number = 0;

  /**
   * Appends an event to the immutable chain-of-custody log.
   * Modifying or deleting previous events is prohibited.
   *
   * Deduplication Policy:
   * - If an explicit `id` is provided and already exists, it is treated as an operational replay and returns the existing event.
   * - If an explicit `idempotencyKey` is provided and already exists, returns the existing event.
   * - Distinct operational events (e.g. repeated verification audits over time) are preserved as distinct events.
   */
  public async recordEvent(
    input: Omit<ProcessingEvent, 'id' | 'occurredAtUtc'> & {
      id?: string;
      occurredAtUtc?: string;
      idempotencyKey?: string;
    }
  ): Promise<ProcessingEvent> {
    if (!input.evidenceId || typeof input.evidenceId !== 'string') {
      throw new ProvenanceError(
        'ProcessingEvent requires a valid non-empty evidenceId.',
        'ERR_INVALID_EVIDENCE_ID'
      );
    }

    if (!input.eventType || typeof input.eventType !== 'string') {
      throw new ProvenanceError(
        'ProcessingEvent requires a valid non-empty eventType.',
        'ERR_INVALID_EVENT_TYPE'
      );
    }

    if (input.eventOutcome !== 'SUCCESS' && input.eventOutcome !== 'FAILED') {
      throw new ProvenanceError(
        `Invalid eventOutcome '${input.eventOutcome}': must be 'SUCCESS' or 'FAILED'.`,
        'ERR_INVALID_EVENT_OUTCOME'
      );
    }

    if (!input.softwareComponent || typeof input.softwareComponent !== 'string') {
      throw new ProvenanceError(
        'ProcessingEvent requires a valid non-empty softwareComponent.',
        'ERR_INVALID_SOFTWARE_COMPONENT'
      );
    }

    // 1. Idempotency check via explicit event ID
    if (input.id && this.eventsById.has(input.id)) {
      const existing = this.eventsById.get(input.id)!;
      return Object.freeze({ ...existing });
    }

    // 2. Idempotency check via explicit idempotencyKey
    if (input.idempotencyKey && this.idempotencyIndex.has(input.idempotencyKey)) {
      const existing = this.idempotencyIndex.get(input.idempotencyKey)!;
      return Object.freeze({ ...existing });
    }

    this.sequenceCounter++;
    const eventId = input.id || generateUuid();
    const event: ProcessingEvent = Object.freeze({
      id: eventId,
      evidenceId: input.evidenceId.trim(),
      eventType: input.eventType,
      eventOutcome: input.eventOutcome,
      softwareComponent: input.softwareComponent.trim(),
      details: input.details,
      occurredAtUtc: input.occurredAtUtc || new Date().toISOString(),
      sequenceNumber: this.sequenceCounter,
      idempotencyKey: input.idempotencyKey,
    });

    this.events.push(event);
    this.eventsById.set(eventId, event);
    if (input.idempotencyKey) {
      this.idempotencyIndex.set(input.idempotencyKey, event);
    }

    let list = this.evidenceIndex.get(event.evidenceId);
    if (!list) {
      list = [];
      this.evidenceIndex.set(event.evidenceId, list);
    }
    list.push(event);

    return event;
  }

  /**
   * Retrieves all processing events for a specific evidence item in chronological order.
   */
  public async getEventsByEvidenceId(evidenceId: string): Promise<ProcessingEvent[]> {
    const list = this.evidenceIndex.get(evidenceId.trim());
    return list ? [...list] : [];
  }

  /**
   * Retrieves all recorded events across all evidence items in append order.
   */
  public async getAllEvents(): Promise<ProcessingEvent[]> {
    return [...this.events];
  }
}

/**
 * Abstract Repository Interface for durable provenance event persistence.
 * Implemented by database adapters (e.g., Person 3's PostgreSQL/Prisma repository)
 * or mock adapters for isolated unit and integration testing.
 *
 * Conforms to Blueprint Section 7.4 (processing_events schema).
 */
export interface ProvenanceRepository {
  /**
   * Persists a processing event to durable storage.
   * Returns the persisted event or void upon successful completion.
   */
  save(event: ProcessingEvent): Promise<ProcessingEvent | void>;

  /**
   * Retrieves all processing events for a specific evidence item,
   * sorted in chronological / sequence order.
   */
  findByEvidenceId(evidenceId: string): Promise<ProcessingEvent[]>;

  /**
   * Retrieves all recorded processing events across all evidence items,
   * sorted in chronological / sequence order.
   */
  findAll(): Promise<ProcessingEvent[]>;

  /**
   * Optional lookup by unique event ID for deduplicating repeated operations.
   */
  findById?(id: string): Promise<ProcessingEvent | null>;

  /**
   * Optional lookup by idempotency key for deduplicating repeated operations.
   */
  findByIdempotencyKey?(key: string): Promise<ProcessingEvent | null>;
}

/**
 * Type alias conforming to Blueprint Section 7.4.
 */
export type ProcessingEventRepository = ProvenanceRepository;

/**
 * Deterministically sorts processing events in chronological sequence order.
 * Primary criterion: sequenceNumber (ascending).
 * Secondary criterion: occurredAtUtc (ascending ISO-8601).
 */
export function sortProcessingEvents(events: ProcessingEvent[]): ProcessingEvent[] {
  return [...events].sort((a, b) => {
    if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
      if (a.sequenceNumber !== b.sequenceNumber) {
        return a.sequenceNumber - b.sequenceNumber;
      }
    }
    const timeA = new Date(a.occurredAtUtc).getTime();
    const timeB = new Date(b.occurredAtUtc).getTime();
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.occurredAtUtc.localeCompare(b.occurredAtUtc);
  });
}

/**
 * Persistence Adapter for Provenance Recording.
 *
 * Bridges the ProvenanceRecorder contract with an injected ProvenanceRepository.
 * Validates inputs, coordinates idempotency, guarantees monotonic sequence numbering
 * and strict chronological ordering, and routes storage operations through the injected
 * repository boundary without depending directly on PostgreSQL or any specific ORM.
 */
export class ProvenancePersistenceAdapter implements ProvenanceRecorder {
  private readonly repository: ProvenanceRepository;
  private sequenceCounter: number;

  constructor(
    repository: ProvenanceRepository,
    options?: { initialSequenceNumber?: number }
  ) {
    if (!repository || typeof repository.save !== 'function') {
      throw new ProvenanceError(
        'ProvenancePersistenceAdapter requires a valid ProvenanceRepository with a save() method.',
        'ERR_INVALID_REPOSITORY'
      );
    }
    this.repository = repository;
    this.sequenceCounter = options?.initialSequenceNumber ?? 0;
  }

  /**
   * Exposes the underlying injected repository.
   */
  public getRepository(): ProvenanceRepository {
    return this.repository;
  }

  /**
   * Exposes the current sequence counter.
   */
  public getSequenceCounter(): number {
    return this.sequenceCounter;
  }

  /**
   * Records a processing event to durable storage through the injected repository.
   */
  public async recordEvent(
    input: Omit<ProcessingEvent, 'id' | 'occurredAtUtc'> & {
      id?: string;
      occurredAtUtc?: string;
      sequenceNumber?: number;
      idempotencyKey?: string;
    }
  ): Promise<ProcessingEvent> {
    if (!input.evidenceId || typeof input.evidenceId !== 'string') {
      throw new ProvenanceError(
        'ProcessingEvent requires a valid non-empty evidenceId.',
        'ERR_INVALID_EVIDENCE_ID'
      );
    }

    if (!input.eventType || typeof input.eventType !== 'string') {
      throw new ProvenanceError(
        'ProcessingEvent requires a valid non-empty eventType.',
        'ERR_INVALID_EVENT_TYPE'
      );
    }

    if (input.eventOutcome !== 'SUCCESS' && input.eventOutcome !== 'FAILED') {
      throw new ProvenanceError(
        `Invalid eventOutcome '${input.eventOutcome}': must be 'SUCCESS' or 'FAILED'.`,
        'ERR_INVALID_EVENT_OUTCOME'
      );
    }

    if (!input.softwareComponent || typeof input.softwareComponent !== 'string') {
      throw new ProvenanceError(
        'ProcessingEvent requires a valid non-empty softwareComponent.',
        'ERR_INVALID_SOFTWARE_COMPONENT'
      );
    }

    // 1. Idempotency check via explicit event ID
    if (input.id) {
      try {
        if (typeof this.repository.findById === 'function') {
          const existing = await this.repository.findById(input.id);
          if (existing) {
            return Object.freeze({ ...existing });
          }
        } else {
          // Fallback check via evidence query if findById is not implemented
          const events = await this.repository.findByEvidenceId(input.evidenceId.trim());
          const existing = events.find((e) => e.id === input.id);
          if (existing) {
            return Object.freeze({ ...existing });
          }
        }
      } catch (err) {
        if (err instanceof ProvenanceError) throw err;
        throw new ProvenancePersistenceError(
          `Failed during idempotency check for event ID '${input.id}': ${err instanceof Error ? err.message : String(err)}`,
          err,
          'ERR_PERSISTENCE_QUERY_FAILED'
        );
      }
    }

    // 2. Idempotency check via explicit idempotencyKey
    if (input.idempotencyKey) {
      try {
        if (typeof this.repository.findByIdempotencyKey === 'function') {
          const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey);
          if (existing) {
            return Object.freeze({ ...existing });
          }
        } else {
          // Fallback check via evidence query if findByIdempotencyKey is not implemented
          const events = await this.repository.findByEvidenceId(input.evidenceId.trim());
          const existing = events.find((e) => e.idempotencyKey === input.idempotencyKey);
          if (existing) {
            return Object.freeze({ ...existing });
          }
        }
      } catch (err) {
        if (err instanceof ProvenanceError) throw err;
        throw new ProvenancePersistenceError(
          `Failed during idempotency check for key '${input.idempotencyKey}': ${err instanceof Error ? err.message : String(err)}`,
          err,
          'ERR_PERSISTENCE_QUERY_FAILED'
        );
      }
    }

    const assignedSeq = input.sequenceNumber ?? (this.sequenceCounter + 1);
    const eventId = input.id || generateUuid();
    const event: ProcessingEvent = Object.freeze({
      id: eventId,
      evidenceId: input.evidenceId.trim(),
      eventType: input.eventType,
      eventOutcome: input.eventOutcome,
      softwareComponent: input.softwareComponent.trim(),
      details: input.details,
      occurredAtUtc: input.occurredAtUtc || new Date().toISOString(),
      sequenceNumber: assignedSeq,
      idempotencyKey: input.idempotencyKey,
    });

    let saved: ProcessingEvent | void;
    try {
      saved = await this.repository.save(event);
    } catch (err) {
      if (err instanceof ProvenanceError) {
        throw err;
      }
      throw new ProvenancePersistenceError(
        `Failed to persist processing event to repository: ${err instanceof Error ? err.message : String(err)}`,
        err,
        'ERR_PERSISTENCE_FAILED'
      );
    }

    // Advance sequenceCounter only after successful persistence
    if (input.sequenceNumber === undefined) {
      this.sequenceCounter = assignedSeq;
    } else {
      this.sequenceCounter = Math.max(this.sequenceCounter, assignedSeq);
    }

    return Object.freeze({ ...(saved || event) });
  }

  /**
   * Retrieves all processing events for a specific evidence item in strict chronological sequence order.
   */
  public async getEventsByEvidenceId(evidenceId: string): Promise<ProcessingEvent[]> {
    if (!evidenceId || typeof evidenceId !== 'string') {
      return [];
    }

    let events: ProcessingEvent[];
    try {
      events = await this.repository.findByEvidenceId(evidenceId.trim());
    } catch (err) {
      if (err instanceof ProvenanceError) {
        throw err;
      }
      throw new ProvenancePersistenceError(
        `Failed to retrieve processing events for evidence ID '${evidenceId}': ${err instanceof Error ? err.message : String(err)}`,
        err,
        'ERR_PERSISTENCE_QUERY_FAILED'
      );
    }

    return sortProcessingEvents(events).map((e) => Object.freeze({ ...e }));
  }

  /**
   * Retrieves all recorded events across all evidence items in strict chronological sequence order.
   */
  public async getAllEvents(): Promise<ProcessingEvent[]> {
    let events: ProcessingEvent[];
    try {
      events = await this.repository.findAll();
    } catch (err) {
      if (err instanceof ProvenanceError) {
        throw err;
      }
      throw new ProvenancePersistenceError(
        `Failed to retrieve all processing events: ${err instanceof Error ? err.message : String(err)}`,
        err,
        'ERR_PERSISTENCE_QUERY_FAILED'
      );
    }

    return sortProcessingEvents(events).map((e) => Object.freeze({ ...e }));
  }
}

/**
 * Type alias for ProvenancePersistenceAdapter for naming consistency.
 */
export { ProvenancePersistenceAdapter as PersistentProvenanceRecorder };

/**
 * In-memory reference implementation of ProvenanceRepository.
 * Conforms to ProvenanceRepository interface and suitable for unit tests and local runs.
 */
export class InMemoryProvenanceRepository implements ProvenanceRepository {
  private readonly events: ProcessingEvent[] = [];
  private readonly eventsById: Map<string, ProcessingEvent> = new Map();
  private readonly eventsByEvidenceId: Map<string, ProcessingEvent[]> = new Map();
  private readonly eventsByIdempotencyKey: Map<string, ProcessingEvent> = new Map();

  public async save(event: ProcessingEvent): Promise<ProcessingEvent> {
    const clone = Object.freeze({ ...event });
    this.events.push(clone);
    this.eventsById.set(clone.id, clone);

    let evidenceList = this.eventsByEvidenceId.get(clone.evidenceId);
    if (!evidenceList) {
      evidenceList = [];
      this.eventsByEvidenceId.set(clone.evidenceId, evidenceList);
    }
    evidenceList.push(clone);

    if (clone.idempotencyKey) {
      this.eventsByIdempotencyKey.set(clone.idempotencyKey, clone);
    }

    return clone;
  }

  public async findByEvidenceId(evidenceId: string): Promise<ProcessingEvent[]> {
    const list = this.eventsByEvidenceId.get(evidenceId.trim());
    return list ? list.map((e) => ({ ...e })) : [];
  }

  public async findAll(): Promise<ProcessingEvent[]> {
    return this.events.map((e) => ({ ...e }));
  }

  public async findById(id: string): Promise<ProcessingEvent | null> {
    const found = this.eventsById.get(id);
    return found ? { ...found } : null;
  }

  public async findByIdempotencyKey(key: string): Promise<ProcessingEvent | null> {
    const found = this.eventsByIdempotencyKey.get(key);
    return found ? { ...found } : null;
  }

  public clear(): void {
    this.events.length = 0;
    this.eventsById.clear();
    this.eventsByEvidenceId.clear();
    this.eventsByIdempotencyKey.clear();
  }
}

let defaultProvenanceRecorder: ProvenanceRecorder = new InMemoryProvenanceRecorder();

/**
 * Returns the default singleton provenance recorder for the active runtime session.
 */
export function getProvenanceRecorder(): ProvenanceRecorder {
  return defaultProvenanceRecorder;
}

/**
 * Injects a custom singleton provenance recorder (e.g. ProvenancePersistenceAdapter).
 */
export function setProvenanceRecorder(recorder: ProvenanceRecorder): void {
  defaultProvenanceRecorder = recorder;
}

/**
 * Resets the default singleton provenance recorder (useful for isolated tests).
 */
export function resetProvenanceRecorder(): void {
  defaultProvenanceRecorder = new InMemoryProvenanceRecorder();
}
