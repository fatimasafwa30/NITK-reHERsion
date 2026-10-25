/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Module: Chronological Incident Timeline Processor
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 (Section 1.3 & Module G)
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Synthesizes user incident claims and preserved evidence records into a unified,
 * deterministic chronological timeline. Follows the Four-Tier Timestamp Taxonomy,
 * preserves raw provenance, detects conflicts between sources without silent overwrite,
 * and maintains strict contract compatibility with Person 1's frontend.
 */

import {
  TimestampTier,
  TimePrecision,
  UserIncidentEvent,
  TimelineEntry,
  TimestampDiscrepancy,
  EvidenceRecordSummary,
  TimelineProcessingOptions,
  TimelineEvidenceInput,
} from './timelineTypes.js';

/**
 * Priority order for deterministic tie-breaking when two events share the exact same millisecond.
 * Tier 1 (Victim assertion) -> Tier 2 (Device metadata) -> Tier 3 (Server receipt) -> Tier 4 (Audit)
 */
const TIER_PRIORITY: Record<TimestampTier, number> = {
  [TimestampTier.TIER_1_USER_REPORTED]: 1,
  [TimestampTier.TIER_2_FILE_EMBEDDED]: 2,
  [TimestampTier.TIER_3_SYSTEM_RECEIPT]: 3,
  [TimestampTier.TIER_4_AUDIT_PROCESSING]: 4,
};

/**
 * Normalizes an untrusted date input into a standard UTC ISO-8601 string,
 * classifying its precision without mutating the original representation.
 */
export function normalizeTimestamp(input: string | Date | null | undefined): {
  iso: string | null;
  precision: TimePrecision;
  isValid: boolean;
  rawString: string | null;
} {
  if (input === null || input === undefined || input === '') {
    return { iso: null, precision: 'UNKNOWN', isValid: true, rawString: null };
  }

  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      return { iso: null, precision: 'UNKNOWN', isValid: false, rawString: 'Invalid Date' };
    }
    return { iso: input.toISOString(), precision: 'EXACT', isValid: true, rawString: input.toISOString() };
  }

  const trimmed = String(input).trim();
  if (trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'null') {
    return { iso: null, precision: 'UNKNOWN', isValid: true, rawString: trimmed };
  }

  // Check for Date-Only format (YYYY-MM-DD)
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const d = new Date(`${trimmed}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) {
      return { iso: d.toISOString(), precision: 'DATE_ONLY', isValid: true, rawString: trimmed };
    }
  }

  // Attempt standard parse
  const parsedMillis = Date.parse(trimmed);
  if (isNaN(parsedMillis)) {
    return { iso: null, precision: 'UNKNOWN', isValid: false, rawString: trimmed };
  }

  const d = new Date(parsedMillis);
  return {
    iso: d.toISOString(),
    precision: 'EXACT',
    isValid: true,
    rawString: trimmed,
  };
}

/**
 * Builds a chronological incident timeline combining user-entered incident events
 * and preserved evidence records according to Blueprint Section 1.3.
 */
export function buildChronologicalTimeline(
  incidentEvents: UserIncidentEvent[],
  evidenceRecords: TimelineEvidenceInput[] = [],
  options: TimelineProcessingOptions = {}
): TimelineEntry[] {
  const undatedPlacement = options.undatedPlacement || 'END';
  const discrepancyThresholdMs = (options.discrepancyThresholdMinutes ?? 15) * 60 * 1000;
  const includeStandaloneEvidence = options.includeStandaloneEvidence !== false;

  // 1. Index evidence records for fast linkage lookup
  const evidenceMap = new Map<string, TimelineEvidenceInput>();
  for (const ev of evidenceRecords) {
    evidenceMap.set(ev.evidenceId, ev);
  }

  const linkedEvidenceIds = new Set<string>();
  const timelineEntries: TimelineEntry[] = [];

  // 2. Process User Incident Events
  for (const event of incidentEvents) {
    const norm = normalizeTimestamp(event.occurredAt);
    const rawTimeStr = event.rawUserEnteredTime || norm.rawString;
    const isExplicitlyUncertain =
      event.isTimeUncertain === true ||
      event.timeConfidence === 'uncertain' ||
      !norm.isValid ||
      norm.iso === null;

    const evidenceSummaries: EvidenceRecordSummary[] = [];
    const discrepancies: TimestampDiscrepancy[] = [];

    // Check linked evidence
    if (event.relatedEvidenceId) {
      const linkedRecord = evidenceMap.get(event.relatedEvidenceId);
      if (linkedRecord) {
        linkedEvidenceIds.add(linkedRecord.evidenceId);
        const deviceTime = linkedRecord.extractedMetadata?.extractedFileTimeUtc || null;
        const deviceTz = linkedRecord.extractedMetadata?.extractedFileTimezone || null;

        evidenceSummaries.push({
          evidenceId: linkedRecord.evidenceId,
          fileName: linkedRecord.fileName,
          mimeType: linkedRecord.mimeType,
          sizeBytes: linkedRecord.sizeBytes,
          sha256: linkedRecord.sha256,
          storageKey: linkedRecord.storageKey,
          recordedAtUtc: linkedRecord.recordedAt,
          extractedDeviceTimeUtc: deviceTime,
          extractedTimezone: deviceTz,
        });

        // FORENSIC INTEGRITY RULE: Check for conflict between user-claimed time and device metadata
        if (norm.iso && deviceTime) {
          const userMillis = Date.parse(norm.iso);
          const deviceMillis = Date.parse(deviceTime);
          if (!isNaN(userMillis) && !isNaN(deviceMillis)) {
            const deltaMs = Math.abs(userMillis - deviceMillis);
            if (deltaMs > discrepancyThresholdMs) {
              const deltaMinutes = Math.round(deltaMs / (60 * 1000));
              discrepancies.push({
                type: 'TIER_1_TIER_2_MISMATCH',
                sourceA: {
                  tier: TimestampTier.TIER_1_USER_REPORTED,
                  label: 'User Claimed Incident Time',
                  value: norm.iso,
                },
                sourceB: {
                  tier: TimestampTier.TIER_2_FILE_EMBEDDED,
                  label: 'Device File-Embedded Time (EXIF/Metadata)',
                  value: deviceTime,
                },
                deltaMinutes,
                description: `User-reported time differs from file-embedded device time by ${deltaMinutes} minutes. Device timestamps remain unverified client metadata.`,
              });
            }
          }
        }
      }
    }

    // Determine confidence: if discrepancies exist or explicitly uncertain -> 'uncertain'
    const finalConfidence = isExplicitlyUncertain || discrepancies.length > 0 ? 'uncertain' : 'confirmed';

    timelineEntries.push({
      eventId: event.eventId || `tl_auto_${timelineEntries.length + 1}`,
      caseId: event.caseId,
      occurredAt: norm.iso,
      timeConfidence: finalConfidence,
      label: (event.label || (event as any).title || 'Incident Event').trim(),
      relatedEvidenceId: event.relatedEvidenceId || null,
      entrySource: evidenceSummaries.length > 0 ? 'HYBRID_LINKED' : 'USER_INCIDENT_EVENT',
      timestampTier: TimestampTier.TIER_1_USER_REPORTED,
      timePrecision: norm.precision,
      isTimeUncertain: finalConfidence === 'uncertain',
      rawUserEnteredTime: rawTimeStr,
      timezone: event.claimedTimezone || null,
      evidenceRecords: evidenceSummaries,
      discrepancies,
    });
  }

  // 3. Process Standalone Preserved Evidence (Not linked to any user incident event)
  if (includeStandaloneEvidence) {
    for (const record of evidenceRecords) {
      if (linkedEvidenceIds.has(record.evidenceId)) {
        continue; // Already included as linked evidence
      }

      // Check if evidence has Tier 2 device-embedded timestamp
      const deviceTime = record.extractedMetadata?.extractedFileTimeUtc;
      const deviceTz = record.extractedMetadata?.extractedFileTimezone;

      let occurredAt: string | null = null;
      let timestampTier: TimestampTier;
      let timeConfidence: 'confirmed' | 'uncertain';

      if (deviceTime) {
        // Use Tier 2 device timestamp as occurredAt
        // INVARIANT: Device metadata is ALWAYS marked unverified/uncertain
        occurredAt = deviceTime;
        timestampTier = TimestampTier.TIER_2_FILE_EMBEDDED;
        timeConfidence = 'uncertain';
      } else {
        // Use Tier 3 system receipt time
        occurredAt = record.recordedAt;
        timestampTier = TimestampTier.TIER_3_SYSTEM_RECEIPT;
        timeConfidence = 'confirmed';
      }

      const summary: EvidenceRecordSummary = {
        evidenceId: record.evidenceId,
        fileName: record.fileName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        sha256: record.sha256,
        storageKey: record.storageKey,
        recordedAtUtc: record.recordedAt,
        extractedDeviceTimeUtc: deviceTime,
        extractedTimezone: deviceTz,
      };

      timelineEntries.push({
        eventId: `tl_ev_${record.evidenceId}`,
        caseId: record.caseId,
        occurredAt,
        timeConfidence,
        label: `Preserved Evidence: ${record.fileName}`,
        relatedEvidenceId: record.evidenceId,
        entrySource: 'PRESERVED_EVIDENCE',
        timestampTier,
        timePrecision: 'EXACT',
        isTimeUncertain: timeConfidence === 'uncertain',
        rawUserEnteredTime: null,
        timezone: deviceTz || 'UTC',
        evidenceRecords: [summary],
        discrepancies: [],
      });
    }
  }

  // 4. Chronological Sorting & Deterministic Tie-Breaking
  const datedEntries: TimelineEntry[] = [];
  const undatedEntries: TimelineEntry[] = [];

  for (const entry of timelineEntries) {
    if (entry.occurredAt !== null) {
      datedEntries.push(entry);
    } else {
      undatedEntries.push(entry);
    }
  }

  // Sort dated entries: Oldest first (asc)
  datedEntries.sort((a, b) => {
    const timeA = Date.parse(a.occurredAt!);
    const timeB = Date.parse(b.occurredAt!);

    // Primary: Chronological time
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    // Secondary Tie-Breaker: Timestamp Tier Priority (Tier 1 -> Tier 2 -> Tier 3 -> Tier 4)
    const priorityA = TIER_PRIORITY[a.timestampTier] || 99;
    const priorityB = TIER_PRIORITY[b.timestampTier] || 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Tertiary Tie-Breaker: Deterministic alphanumeric event ID
    return a.eventId.localeCompare(b.eventId);
  });

  // Sort undated entries deterministically by eventId
  undatedEntries.sort((a, b) => a.eventId.localeCompare(b.eventId));

  // Combine according to placement option
  if (undatedPlacement === 'START') {
    return [...undatedEntries, ...datedEntries];
  }
  return [...datedEntries, ...undatedEntries];
}
