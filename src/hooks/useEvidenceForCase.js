import { mockEvidenceByCase } from '../data/mockEvidence';

/**
 * Evidence records belonging to one case, in intake order.
 * Replace the mock import with the real service call; pages need no changes.
 * @param {string} caseId
 * @returns {{ data: object[], loading: boolean, error: Error|null }}
 */
export function useEvidenceForCase(caseId) {
  return { data: mockEvidenceByCase[caseId] || [], loading: false, error: null };
}

export default useEvidenceForCase;
