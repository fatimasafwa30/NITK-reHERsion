import { mockEvidenceByCase } from '../data/mockEvidence';
import { getEvidenceForCase } from '../services/evidenceService';

/**
 * Evidence records belonging to one case, in intake order.
 * Powered by Person 2's Forensic Evidence Ingestion Pipeline,
 * with fallback to mock data when case evidence is uninitialized.
 * Surfaces genuine service failures rather than silently hiding them.
 * @param {string} caseId
 * @returns {{ data: object[], loading: boolean, error: Error|null }}
 */
export function useEvidenceForCase(caseId) {
  try {
    if (!caseId) {
      return { data: [], loading: false, error: null };
    }
    const realEvidence = getEvidenceForCase(caseId);
    if (realEvidence && realEvidence.length > 0) {
      return { data: realEvidence, loading: false, error: null };
    }
    const mockData = mockEvidenceByCase[caseId] || [];
    return { data: mockData, loading: false, error: null };
  } catch (err) {
    return {
      data: [],
      loading: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export default useEvidenceForCase;
