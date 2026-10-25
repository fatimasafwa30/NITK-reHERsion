import { describe, it, expect } from 'vitest';
import {
  buildChronologicalTimeline,
  normalizeTimestamp,
} from '../../../src/lib/forensics/timelineProcessor.js';
import {
  TimestampTier,
  UserIncidentEvent,
} from '../../../src/lib/forensics/timelineTypes.js';
import { EvidenceRecord } from '../../../src/services/evidenceStore.js';

describe('Forensics: Chronological Incident Timeline Processor', () => {
  describe('Timestamp Normalization & Precision Classification', () => {
    it('normalizes valid ISO-8601 strings to EXACT precision UTC strings', () => {
      const result = normalizeTimestamp('2026-09-14T09:40:00.000Z');
      expect(result.isValid).toBe(true);
      expect(result.precision).toBe('EXACT');
      expect(result.iso).toBe('2026-09-14T09:40:00.000Z');
    });

    it('classifies Date-Only strings (YYYY-MM-DD) as DATE_ONLY precision', () => {
      const result = normalizeTimestamp('2026-09-14');
      expect(result.isValid).toBe(true);
      expect(result.precision).toBe('DATE_ONLY');
      expect(result.iso).toBe('2026-09-14T00:00:00.000Z');
    });

    it('handles null, undefined, empty, and "unknown" without error', () => {
      expect(normalizeTimestamp(null).iso).toBeNull();
      expect(normalizeTimestamp(undefined).iso).toBeNull();
      expect(normalizeTimestamp('').iso).toBeNull();
      expect(normalizeTimestamp('unknown').iso).toBeNull();
      expect(normalizeTimestamp('null').precision).toBe('UNKNOWN');
    });

    it('safely handles invalid / corrupt date strings and preserves raw string', () => {
      const result = normalizeTimestamp('not-a-valid-date-string');
      expect(result.isValid).toBe(false);
      expect(result.iso).toBeNull();
      expect(result.precision).toBe('UNKNOWN');
      expect(result.rawString).toBe('not-a-valid-date-string');
    });
  });

  describe('Chronological Ordering & Deterministic Tie-Breaking', () => {
    it('sorts events in chronological order (oldest first)', () => {
      const events: UserIncidentEvent[] = [
        { caseId: 'c1', eventId: 'ev3', label: 'Third event', occurredAt: '2026-10-01T12:00:00.000Z' },
        { caseId: 'c1', eventId: 'ev1', label: 'First event', occurredAt: '2026-08-01T10:00:00.000Z' },
        { caseId: 'c1', eventId: 'ev2', label: 'Second event', occurredAt: '2026-09-15T08:30:00.000Z' },
      ];

      const timeline = buildChronologicalTimeline(events);

      expect(timeline.map((t) => t.eventId)).toEqual(['ev1', 'ev2', 'ev3']);
      expect(timeline[0].occurredAt).toBe('2026-08-01T10:00:00.000Z');
      expect(timeline[1].occurredAt).toBe('2026-09-15T08:30:00.000Z');
      expect(timeline[2].occurredAt).toBe('2026-10-01T12:00:00.000Z');
    });

    it('deterministically breaks ties when two events share the exact same timestamp', () => {
      const sameTime = '2026-09-14T10:00:00.000Z';
      const events: UserIncidentEvent[] = [
        { caseId: 'c1', eventId: 'tl_z', label: 'Event Z', occurredAt: sameTime },
        { caseId: 'c1', eventId: 'tl_a', label: 'Event A', occurredAt: sameTime },
        { caseId: 'c1', eventId: 'tl_m', label: 'Event M', occurredAt: sameTime },
      ];

      // Run multiple times to verify 100% deterministic ordering across runs
      for (let run = 0; run < 5; run++) {
        const timeline = buildChronologicalTimeline(events);
        expect(timeline.map((t) => t.eventId)).toEqual(['tl_a', 'tl_m', 'tl_z']);
      }
    });

    it('places undated events at the end by default with uncertain confidence', () => {
      const events: UserIncidentEvent[] = [
        { caseId: 'c1', eventId: 'tl_dated_1', label: 'Dated Event', occurredAt: '2026-09-14T10:00:00.000Z' },
        { caseId: 'c1', eventId: 'tl_undated_1', label: 'Undated Event', occurredAt: null, timeConfidence: 'uncertain' },
        { caseId: 'c1', eventId: 'tl_dated_2', label: 'Later Dated Event', occurredAt: '2026-09-16T15:00:00.000Z' },
      ];

      const timeline = buildChronologicalTimeline(events);

      expect(timeline[0].eventId).toBe('tl_dated_1');
      expect(timeline[1].eventId).toBe('tl_dated_2');
      expect(timeline[2].eventId).toBe('tl_undated_1');
      expect(timeline[2].occurredAt).toBeNull();
      expect(timeline[2].timeConfidence).toBe('uncertain');
      expect(timeline[2].isTimeUncertain).toBe(true);
    });

    it('can place undated events at the start if configured', () => {
      const events: UserIncidentEvent[] = [
        { caseId: 'c1', eventId: 'tl_dated', label: 'Dated Event', occurredAt: '2026-09-14T10:00:00.000Z' },
        { caseId: 'c1', eventId: 'tl_undated', label: 'Undated Event', occurredAt: null },
      ];

      const timeline = buildChronologicalTimeline(events, [], { undatedPlacement: 'START' });
      expect(timeline[0].eventId).toBe('tl_undated');
      expect(timeline[1].eventId).toBe('tl_dated');
    });
  });

  describe('Timestamp Discrepancy & Conflict Detection', () => {
    it('detects conflict between user-claimed time (Tier 1) and device EXIF time (Tier 2)', () => {
      const userClaimedTime = '2026-10-01T10:00:00.000Z';
      const deviceExifTime = '2026-10-01T14:30:00.000Z'; // 4.5 hours (270 min) later

      const incidentEvent: UserIncidentEvent = {
        caseId: 'c1',
        eventId: 'tl_conflict',
        label: 'Threatening chat screenshot',
        occurredAt: userClaimedTime,
        relatedEvidenceId: 'ev_screenshot_1',
      };

      const mockEvidence: EvidenceRecord = {
        evidenceId: 'ev_screenshot_1',
        caseId: 'c1',
        fileName: 'chat.png',
        originalFilename: 'chat.png',
        mimeType: 'image/png',
        sizeBytes: 120_000,
        recordedAt: '2026-10-02T08:00:00.000Z', // Tier 3 receipt time
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        verificationStatus: 'MATCH',
        storageKey: 'raw/c1/ev_screenshot_1.raw',
        intakeStatus: 'PROMOTED',
        extractedMetadata: {
          status: 'SUCCESS',
          detectedMimeType: 'image/png',
          extractedFileTimeUtc: deviceExifTime,
          extractedFileTimezone: 'UTC',
          embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA',
          metadata: {},
          warnings: [],
        },
      };

      const timeline = buildChronologicalTimeline([incidentEvent], [mockEvidence]);
      expect(timeline).toHaveLength(1);

      const entry = timeline[0];
      expect(entry.eventId).toBe('tl_conflict');
      // Preserves primary user claimed occurredAt
      expect(entry.occurredAt).toBe(userClaimedTime);
      // Flags confidence as uncertain due to conflict!
      expect(entry.timeConfidence).toBe('uncertain');
      expect(entry.isTimeUncertain).toBe(true);

      // Documents discrepancy without silent overwrite
      expect(entry.discrepancies).toHaveLength(1);
      const disc = entry.discrepancies[0];
      expect(disc.type).toBe('TIER_1_TIER_2_MISMATCH');
      expect(disc.deltaMinutes).toBe(270);
      expect(disc.sourceA.tier).toBe(TimestampTier.TIER_1_USER_REPORTED);
      expect(disc.sourceB.tier).toBe(TimestampTier.TIER_2_FILE_EMBEDDED);
      expect(disc.description).toContain('270 minutes');
    });

    it('does not flag discrepancy when difference is within tolerance threshold', () => {
      const userClaimedTime = '2026-10-01T10:00:00.000Z';
      const deviceExifTime = '2026-10-01T10:05:00.000Z'; // only 5 minutes difference

      const incidentEvent: UserIncidentEvent = {
        caseId: 'c1',
        eventId: 'tl_near',
        label: 'Minor clock delta event',
        occurredAt: userClaimedTime,
        relatedEvidenceId: 'ev_near_1',
      };

      const mockEvidence: EvidenceRecord = {
        evidenceId: 'ev_near_1',
        caseId: 'c1',
        fileName: 'near.jpg',
        originalFilename: 'near.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 80_000,
        recordedAt: '2026-10-01T11:00:00.000Z',
        sha256: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
        verificationStatus: 'MATCH',
        storageKey: 'raw/c1/ev_near_1.raw',
        intakeStatus: 'PROMOTED',
        extractedMetadata: {
          status: 'SUCCESS',
          detectedMimeType: 'image/jpeg',
          extractedFileTimeUtc: deviceExifTime,
          extractedFileTimezone: 'UTC',
          embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA',
          metadata: {},
          warnings: [],
        },
      };

      const timeline = buildChronologicalTimeline([incidentEvent], [mockEvidence], {
        discrepancyThresholdMinutes: 15,
      });

      expect(timeline[0].discrepancies).toHaveLength(0);
      expect(timeline[0].timeConfidence).toBe('confirmed');
    });
  });

  describe('Standalone Evidence Integration & Timestamp Taxonomy', () => {
    it('synthesizes standalone evidence items into timeline with Tier 2 device timestamp', () => {
      const standaloneEvidence: EvidenceRecord = {
        evidenceId: 'ev_standalone_photo',
        caseId: 'c1',
        fileName: 'unlinked_camera_photo.jpg',
        originalFilename: 'unlinked_camera_photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 950_000,
        recordedAt: '2026-10-10T12:00:00.000Z',
        sha256: 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
        verificationStatus: 'MATCH',
        storageKey: 'raw/c1/ev_standalone_photo.raw',
        intakeStatus: 'PROMOTED',
        extractedMetadata: {
          status: 'SUCCESS',
          detectedMimeType: 'image/jpeg',
          extractedFileTimeUtc: '2026-09-01T08:15:00.000Z', // Prior camera timestamp
          extractedFileTimezone: 'UTC',
          embeddedTimeConfidence: 'UNVERIFIED_DEVICE_METADATA',
          metadata: {},
          warnings: [],
        },
      };

      const timeline = buildChronologicalTimeline([], [standaloneEvidence]);

      expect(timeline).toHaveLength(1);
      const entry = timeline[0];
      expect(entry.eventId).toBe('tl_ev_ev_standalone_photo');
      expect(entry.occurredAt).toBe('2026-09-01T08:15:00.000Z');
      expect(entry.timestampTier).toBe(TimestampTier.TIER_2_FILE_EMBEDDED);
      // Invariant: embedded device timestamps are strictly uncertain
      expect(entry.timeConfidence).toBe('uncertain');
      expect(entry.entrySource).toBe('PRESERVED_EVIDENCE');
      expect(entry.relatedEvidenceId).toBe('ev_standalone_photo');
    });

    it('falls back to Tier 3 system receipt time when evidence has no embedded timestamp', () => {
      const plainTextEvidence: EvidenceRecord = {
        evidenceId: 'ev_plain_text',
        caseId: 'c1',
        fileName: 'chat_export.txt',
        originalFilename: 'chat_export.txt',
        mimeType: 'text/plain',
        sizeBytes: 15_000,
        recordedAt: '2026-10-20T18:00:00.000Z', // System receipt time
        sha256: '1aa09fc38fed9bfe5d5726bd261038068a4b5ca7d6bf3cab44cb601165bd0b47',
        verificationStatus: 'MATCH',
        storageKey: 'raw/c1/ev_plain_text.raw',
        intakeStatus: 'PROMOTED',
        extractedMetadata: {
          status: 'SUCCESS',
          detectedMimeType: 'text/plain',
          extractedFileTimeUtc: null,
          extractedFileTimezone: null,
          embeddedTimeConfidence: 'NOT_APPLICABLE',
          metadata: {},
          warnings: [],
        },
      };

      const timeline = buildChronologicalTimeline([], [plainTextEvidence]);

      expect(timeline).toHaveLength(1);
      const entry = timeline[0];
      expect(entry.occurredAt).toBe('2026-10-20T18:00:00.000Z');
      expect(entry.timestampTier).toBe(TimestampTier.TIER_3_SYSTEM_RECEIPT);
      expect(entry.timeConfidence).toBe('confirmed');
    });
  });

  describe('Frontend DATA_CONTRACT.md Compatibility', () => {
    it('adheres strictly to the required frontend TimelineEvent contract fields', () => {
      const event: UserIncidentEvent = {
        caseId: 'case_1001',
        eventId: 'tl_contract',
        label: 'Verbal threat outside office',
        occurredAt: '2026-09-14T09:40:00.000Z',
        relatedEvidenceId: 'ev_123',
      };

      const [entry] = buildChronologicalTimeline([event]);

      // Exactly matches DATA_CONTRACT.md properties:
      expect(typeof entry.eventId).toBe('string');
      expect(typeof entry.occurredAt).toBe('string');
      expect(['confirmed', 'uncertain']).toContain(entry.timeConfidence);
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.relatedEvidenceId).toBe('string');
    });
  });
});
