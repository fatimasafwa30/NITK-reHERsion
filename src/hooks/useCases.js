import { useState, useEffect } from 'react';
import { getCasesSync, subscribeCases } from '../services/caseStore.js';

/**
 * All cases for the current user.
 * Connected to caseStore with localStorage persistence and reactive subscriptions.
 * Works seamlessly both inside React functional components and outside React context.
 *
 * @returns {{ data: object[], loading: boolean, error: Error|null }}
 */
export function useCases() {
  let state;
  let setState;

  try {
    [state, setState] = useState(getCasesSync);
  } catch {
    // Graceful fallback when invoked outside a React component render
    return { data: getCasesSync(), loading: false, error: null };
  }

  useEffect(() => {
    setState(getCasesSync());
    return subscribeCases(() => {
      setState(getCasesSync());
    });
  }, [setState]);

  return { data: state, loading: false, error: null };
}

export default useCases;
