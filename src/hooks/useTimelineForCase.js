import { mockTimelineByCase } from '../data/mockTimeline';

/**
 * Timeline events for one case, oldest first.
 * Replace the mock import with the real service call; pages need no changes.
 * @param {string} caseId
 * @returns {{ data: object[], loading: boolean, error: Error|null }}
 */
export function useTimelineForCase(caseId) {
  return { data: mockTimelineByCase[caseId] || [], loading: false, error: null };
}

export default useTimelineForCase;
