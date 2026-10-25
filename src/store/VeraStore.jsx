import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CaseStatus, mockCases } from '../data/mockCases';
import { VerificationStatus, mockEvidenceByCase } from '../data/mockEvidence';
import { mockTimelineByCase } from '../data/mockTimeline';
import {
  getCasesSync,
  createCase as storeCreateCase,
  subscribeCases,
} from '../services/caseStore';
import {
  getEvidenceForCase,
  syncEvidenceRecord,
  deleteEvidenceRecord,
  updateEvidenceVerificationStatus,
  subscribeEvidence,
  recheckEvidenceIntegrity,
  processEvidenceFile,
} from '../services/evidenceService';
import {
  getTimelineForCase,
  addTimelineEventForCase,
  subscribeTimeline,
} from '../services/timelineService';
import {
  DEMO_CASE_ID,
  isDemoCase,
  seedDemoCase,
} from '../data/demoCaseData';

const VeraStoreContext = createContext(null);

/** Events are ordered chronologically; undated ones sit at the end. */
function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (!a.occurredAt && !b.occurredAt) return 0;
    if (!a.occurredAt) return 1;
    if (!b.occurredAt) return -1;
    return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
  });
}

function loadFromServices() {
  try {
    const cases = getCasesSync();
    const evidenceByCase = {};
    const timelineByCase = {};
    for (const c of cases) {
      evidenceByCase[c.caseId] = getEvidenceForCase(c.caseId);
      timelineByCase[c.caseId] = sortEvents(getTimelineForCase(c.caseId));
    }
    return { cases, evidenceByCase, timelineByCase };
  } catch {
    return {
      cases: mockCases.map((c) => ({ ...c })),
      evidenceByCase: Object.fromEntries(
        Object.entries(mockEvidenceByCase).map(([id, list]) => [id, list.map((e) => ({ ...e }))]),
      ),
      timelineByCase: Object.fromEntries(
        Object.entries(mockTimelineByCase).map(([id, list]) => [id, list.map((e) => ({ ...e }))]),
      ),
    };
  }
}

export function VeraStoreProvider({ children }) {
  const [state, setState] = useState(loadFromServices);

  // Subscribe to live mutations from all services
  useEffect(() => {
    const unsubCases = subscribeCases(() => {
      setState(loadFromServices());
    });
    const unsubEvidence = subscribeEvidence('*', () => {
      setState(loadFromServices());
    });
    const unsubTimeline = subscribeTimeline('*', () => {
      setState(loadFromServices());
    });
    return () => {
      unsubCases();
      unsubEvidence();
      unsubTimeline();
    };
  }, []);

  const createCase = useCallback(async (input) => {
    const created = await storeCreateCase({
      title: input.title.trim(),
      summary: (input.summary || '').trim(),
      status: input.status || CaseStatus.OPEN,
    });
    setState(loadFromServices());
    return created.caseId;
  }, []);

  const addEvidence = useCallback(
    async (caseId, record, file) => {
      if (file) {
        await processEvidenceFile(caseId, file);
      } else {
        syncEvidenceRecord(caseId, record);
      }
      setState(loadFromServices());
    },
    [],
  );

  const removeEvidence = useCallback(
    (caseId, evidenceId) => {
      deleteEvidenceRecord(caseId, evidenceId);
      setState(loadFromServices());
    },
    [],
  );

  const setVerificationStatus = useCallback(
    (caseId, evidenceId, status) => {
      updateEvidenceVerificationStatus(evidenceId, status);
      setState(loadFromServices());
    },
    [],
  );

  const addEvent = useCallback(
    (caseId, input) => {
      const event = addTimelineEventForCase(caseId, {
        caseId,
        occurredAt: input.occurredAt || null,
        timeConfidence: input.timeConfidence === 'uncertain' ? 'uncertain' : 'confirmed',
        label: input.label.trim(),
        relatedEvidenceId: input.relatedEvidenceId || null,
        platform: input.platform || undefined,
        senderHandle: input.senderHandle || undefined,
        blockedPrior: Boolean(input.blockedPrior),
      });
      setState(loadFromServices());
      return event;
    },
    [],
  );

  // Ensure demo case is seeded on mount
  useEffect(() => {
    seedDemoCase();
  }, []);

  const loadDemoCase = useCallback(() => {
    const id = seedDemoCase({ overwrite: true });
    setState(loadFromServices());
    return id;
  }, []);

  const resetDemo = useCallback(() => {
    try {
      window.localStorage.removeItem('veratrace_cases_v1');
      window.localStorage.removeItem('veratrace_evidence_records_v1');
      window.localStorage.removeItem('veratrace_timeline_events_v1');
    } catch {}
    seedDemoCase();
    setState(loadFromServices());
  }, []);

  const value = useMemo(
    () => ({
      cases: state.cases,
      evidenceByCase: state.evidenceByCase,
      timelineByCase: state.timelineByCase,
      getCase: (caseId) => state.cases.find((c) => c.caseId === caseId) || null,
      getEvidence: (caseId) => getEvidenceForCase(caseId),
      getTimeline: (caseId) => sortEvents(getTimelineForCase(caseId)),
      createCase,
      addEvidence,
      removeEvidence,
      setVerificationStatus,
      addEvent,
      resetDemo,
      loadDemoCase,
    }),
    [state, createCase, addEvidence, removeEvidence, setVerificationStatus, addEvent, resetDemo, loadDemoCase],
  );

  return <VeraStoreContext.Provider value={value}>{children}</VeraStoreContext.Provider>;
}

export function useVera() {
  const ctx = useContext(VeraStoreContext);
  if (!ctx) {
    const fallback = loadFromServices();
    return {
      cases: fallback.cases,
      evidenceByCase: fallback.evidenceByCase,
      timelineByCase: fallback.timelineByCase,
      getCase: (caseId) =>
        fallback.cases.find((c) => c.caseId === caseId) || {
          caseId,
          title: 'Case ' + caseId,
          summary: '',
          status: CaseStatus.OPEN,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      getEvidence: (caseId) => getEvidenceForCase(caseId),
      getTimeline: (caseId) => sortEvents(getTimelineForCase(caseId)),
      createCase: async (input) => storeCreateCase(input),
      addEvidence: (caseId, record) => syncEvidenceRecord(caseId, record),
      removeEvidence: () => {},
      setVerificationStatus: (caseId, evidenceId, status) => updateEvidenceVerificationStatus(evidenceId, status),
      addEvent: (caseId, input) =>
        addTimelineEventForCase(caseId, {
          caseId,
          occurredAt: input.occurredAt || null,
          timeConfidence: input.timeConfidence === 'uncertain' ? 'uncertain' : 'confirmed',
          label: input.label,
          relatedEvidenceId: input.relatedEvidenceId || null,
        }),
      resetDemo: () => {},
      loadDemoCase: () => seedDemoCase(),
    };
  }
  return ctx;
}

export { CaseStatus, VerificationStatus };
