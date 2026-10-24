import { mockCases } from '../data/mockCases';

/**
 * All cases for the current user.
 * Replace the mock import with the real service call; pages need no changes.
 * @returns {{ data: object[], loading: boolean, error: Error|null }}
 */
export function useCases() {
  return { data: mockCases, loading: false, error: null };
}

export default useCases;
