/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Service: Isomorphic Timeline Service (timelineService.ts)
 *
 * Source of Truth: veratrace_system_architecture_blueprint.md v1.1.1 & docs/DATA_CONTRACT.md
 * Person 2 Responsibility: Evidence Collection & Digital Forensics
 *
 * Provides isomorphic case-scoped timeline state management that functions cleanly
 * both in the Node.js runtime and in Vite client-side browser components.
 */

import {
  UserIncidentEvent,
  TimelineEntry,
  TimelineEvidenceInput,
  TimelineProcessingOptions,
} from '../lib/forensics/timelineTypes.js';
import { buildChronologicalTimeline } from '../lib/forensics/timelineProcessor.js';

export * from '../lib/forensics/timelineTypes.js';
export { buildChronologicalTimeline } from '../lib/forensics/timelineProcessor.js';

// Case-scoped in-memory incident events map
const caseEventsMap = new Map<string, Map<string, UserIncidentEvent>>();

// Case-scoped in-memory evidence records map
const caseEvidenceMap = new Map<string, Map<string, TimelineEvidenceInput>>();

const TIMELINE_STORAGE_KEY = 'veratrace_timeline_events_v1';

function loadPersistedTimeline(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(TIMELINE_STORAGE_KEY);
    if (raw) {
      const events: UserIncidentEvent[] = JSON.parse(raw);
      for (const ev of events) {
        if (!caseEventsMap.has(ev.caseId)) {
          caseEventsMap.set(ev.caseId, new Map());
        }
        caseEventsMap.get(ev.caseId)!.set(ev.eventId, ev);
      }
    }
  } catch {
    // Ignore corrupt storage
  }
}

function persistTimeline(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const allEvents: UserIncidentEvent[] = [];
    for (const map of caseEventsMap.values()) {
      for (const ev of map.values()) {
        allEvents.push(ev);
      }
    }
    window.localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(allEvents));
  } catch {
    // Ignore storage quota
  }
}

loadPersistedTimeline();

// Timeline change listeners: caseId -> Set<listener>
type TimelineListener = () => void;
const timelineListeners = new Map<string, Set<TimelineListener>>();

/**
 * Subscribes a listener to timeline updates for a specific case.
 */
export function subscribeTimeline(caseId: string, listener: TimelineListener): () => void {
  const normCaseId = caseId.trim();
  let set = timelineListeners.get(normCaseId);
  if (!set) {
    set = new Set();
    timelineListeners.set(normCaseId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

function notifyTimelineSubscribers(caseId: string): void {
  const normCaseId = caseId.trim();
  const set = timelineListeners.get(normCaseId);
  if (set) {
    for (const listener of set) {
      try {
        listener();
      } catch (err) {
        console.error('Error in timeline listener:', err);
      }
    }
  }
  const wildcard = timelineListeners.get('*');
  if (wildcard) {
    for (const listener of wildcard) {
      try {
        listener();
      } catch (err) {
        console.error('Error in wildcard timeline listener:', err);
      }
    }
  }
}

/**
 * Adds an incident event to a case timeline and returns the synthesized timeline entry.
 */
export function addTimelineEventForCase(
  caseId: string,
  event: UserIncidentEvent
): TimelineEntry {
  const normCaseId = caseId.trim();
  let events = caseEventsMap.get(normCaseId);
  if (!events) {
    events = new Map();
    caseEventsMap.set(normCaseId, events);
  }

  const eventId = event.eventId || `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const normalizedEvent: UserIncidentEvent = {
    ...event,
    eventId,
    caseId: normCaseId,
  };
  events.set(eventId, normalizedEvent);
  persistTimeline();
  notifyTimelineSubscribers(normCaseId);

  const timeline = getTimelineForCase(normCaseId);
  return timeline.find((t) => t.eventId === eventId)!;
}

/**
 * Registers / syncs a preserved evidence item into the case timeline state.
 */
export function syncEvidenceToTimeline(
  caseId: string,
  evidence: TimelineEvidenceInput
): void {
  const normCaseId = caseId.trim();
  let evidenceStore = caseEvidenceMap.get(normCaseId);
  if (!evidenceStore) {
    evidenceStore = new Map();
    caseEvidenceMap.set(normCaseId, evidenceStore);
  }
  evidenceStore.set(evidence.evidenceId, evidence);
  notifyTimelineSubscribers(normCaseId);
}

/**
 * Builds and returns the chronological incident timeline for a given case.
 */
export function getTimelineForCase(
  caseId: string,
  options?: TimelineProcessingOptions
): TimelineEntry[] {
  if (!caseId) return [];
  const normCaseId = caseId.trim();

  const events = caseEventsMap.get(normCaseId);
  const evidenceStore = caseEvidenceMap.get(normCaseId);

  const eventList = events ? Array.from(events.values()) : [];
  const evidenceList = evidenceStore ? Array.from(evidenceStore.values()) : [];

  return buildChronologicalTimeline(eventList, evidenceList, options);
}

/**
 * Clears timeline state for a case (useful for test resets).
 */
export function clearTimelineForCase(caseId: string): void {
  const normCaseId = caseId.trim();
  caseEventsMap.delete(normCaseId);
  caseEvidenceMap.delete(normCaseId);
  persistTimeline();
  notifyTimelineSubscribers(normCaseId);
}
