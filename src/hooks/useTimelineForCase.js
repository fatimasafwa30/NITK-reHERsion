import { mockTimelineByCase } from '../data/mockTimeline';
import { getTimelineForCase } from '../services/timelineService';

/**
 * Timeline events for one case, oldest first.
 * Powered by Person 2's Chronological Incident Timeline Processor,
 * with fallback to mock data when case timeline is uninitialized.
 * Surfaces genuine service failures rather than silently hiding them.
 * @param {string} caseId
 * @returns {{ data: object[], loading: boolean, error: Error|null }}
 */
export function useTimelineForCase(caseId) {
  try {
    if (!caseId) {
      return { data: [], loading: false, error: null };
    }
    const realTimeline = getTimelineForCase(caseId);
    if (realTimeline && realTimeline.length > 0) {
      return { data: realTimeline, loading: false, error: null };
    }
    const data = mockTimelineByCase[caseId] || [];
    return { data, loading: false, error: null };
  } catch (err) {
    return {
      data: [],
      loading: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export default useTimelineForCase;
