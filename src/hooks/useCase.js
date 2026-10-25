import { getCaseById } from '../data/mockCases';

/**
 * A single case by id. `data` is null when the case does not exist — pages
 * render their "not found" state from that, not from `error`.
 * Replace the mock import with the real service call; pages need no changes.
 * @param {string} caseId
 * @returns {{ data: object|null, loading: boolean, error: Error|null }}
 */
export function useCase(caseId) {
  return { data: getCaseById(caseId), loading: false, error: null };
}

export default useCase;
