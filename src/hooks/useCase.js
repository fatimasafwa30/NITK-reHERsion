import { useState, useEffect } from 'react';
import { getCaseByIdSync, subscribeCases } from '../services/caseStore.js';

/**
 * A single case by id. `data` is null when the case does not exist — pages
 * render their "not found" state from that, not from `error`.
 * Connected to caseStore with localStorage persistence and reactive subscriptions.
 * Works seamlessly both inside React functional components and outside React context.
 *
 * @param {string} caseId
 * @returns {{ data: object|null, loading: boolean, error: Error|null }}
 */
export function useCase(caseId) {
  let state;
  let setState;

  try {
    [state, setState] = useState(() => (caseId ? getCaseByIdSync(caseId) : null));
  } catch {
    // Graceful fallback when invoked outside a React component render
    return { data: caseId ? getCaseByIdSync(caseId) : null, loading: false, error: null };
  }

  useEffect(() => {
    setState(caseId ? getCaseByIdSync(caseId) : null);
    return subscribeCases(() => {
      setState(caseId ? getCaseByIdSync(caseId) : null);
    });
  }, [caseId, setState]);

  return { data: state, loading: false, error: null };
}

export default useCase;
