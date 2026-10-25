import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CaseStatus, mockCases } from '../data/mockCases';
import { VerificationStatus, mockEvidenceByCase } from '../data/mockEvidence';
import { mockTimelineByCase } from '../data/mockTimeline';

const STORAGE_KEY = 'veratrace.demo.v1';

const VeraStoreContext = createContext(null);

function seed() {
  // Demo only; replace with real services. Deep-copied so the mock modules
  // stay pristine and "Reset demo data" can always return to this state.
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

/** Demo only; replace with real services. Reads persisted demo state. */
function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cases)) return seed();
    return {
      cases: parsed.cases,
      evidenceByCase: parsed.evidenceByCase || {},
      timelineByCase: parsed.timelineByCase || {},
    };
  } catch {
    return seed();
  }
}

/** Demo only; replace with real services. Writes persisted demo state. */
function save(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or a full quota — the demo still works in memory */
  }
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Events are ordered chronologically; undated ones sit at the end. */
function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (!a.occurredAt && !b.occurredAt) return 0;
    if (!a.occurredAt) return 1;
    if (!b.occurredAt) return -1;
    return new Date(a.occurredAt) - new Date(b.occurredAt);
  });
}

export function VeraStoreProvider({ children }) {
  const [state, setState] = useState(load);

  useEffect(() => {
    save(state);
  }, [state]);

  /** Demo only; replace with real services. Keeps counts and timestamps honest. */
  const touchCase = useCallback((draft, caseId) => {
    const evidence = draft.evidenceByCase[caseId] || [];
    draft.cases = draft.cases.map((c) =>
      c.caseId === caseId
        ? { ...c, evidenceCount: evidence.length, updatedAt: new Date().toISOString() }
        : c,
    );
    return draft;
  }, []);

  /** Demo only; replace with real services. Creates a case and returns its id. */
  const createCase = useCallback((input) => {
    const caseId = newId('case');
    const now = new Date().toISOString();
    const record = {
      caseId,
      title: input.title.trim(),
      status: input.status || CaseStatus.OPEN,
      createdAt: now,
      updatedAt: now,
      evidenceCount: 0,
      summary: (input.summary || '').trim(),
    };
    setState((prev) => ({
      ...prev,
      cases: [record, ...prev.cases],
      evidenceByCase: { ...prev.evidenceByCase, [caseId]: [] },
      timelineByCase: { ...prev.timelineByCase, [caseId]: [] },
    }));
    return caseId;
  }, []);

  /** Demo only; replace with real services. Appends a sealed evidence record. */
  const addEvidence = useCallback(
    (caseId, record) => {
      setState((prev) => {
        const draft = {
          ...prev,
          evidenceByCase: {
            ...prev.evidenceByCase,
            [caseId]: [record, ...(prev.evidenceByCase[caseId] || [])],
          },
        };
        return touchCase(draft, caseId);
      });
    },
    [touchCase],
  );

  /** Demo only; replace with real services. Removes a record and its timeline links. */
  const removeEvidence = useCallback(
    (caseId, evidenceId) => {
      setState((prev) => {
        const draft = {
          ...prev,
          evidenceByCase: {
            ...prev.evidenceByCase,
            [caseId]: (prev.evidenceByCase[caseId] || []).filter((e) => e.evidenceId !== evidenceId),
          },
          timelineByCase: {
            ...prev.timelineByCase,
            [caseId]: (prev.timelineByCase[caseId] || []).map((e) =>
              e.relatedEvidenceId === evidenceId ? { ...e, relatedEvidenceId: null } : e,
            ),
          },
        };
        return touchCase(draft, caseId);
      });
    },
    [touchCase],
  );

  /** Demo only; replace with real services. Records the outcome of a re-check. */
  const setVerificationStatus = useCallback(
    (caseId, evidenceId, status) => {
      setState((prev) => {
        const draft = {
          ...prev,
          evidenceByCase: {
            ...prev.evidenceByCase,
            [caseId]: (prev.evidenceByCase[caseId] || []).map((e) =>
              e.evidenceId === evidenceId ? { ...e, verificationStatus: status } : e,
            ),
          },
        };
        return touchCase(draft, caseId);
      });
    },
    [touchCase],
  );

  /** Demo only; replace with real services. Adds a timeline event in order. */
  const addEvent = useCallback(
    (caseId, input) => {
      const event = {
        eventId: newId('tl'),
        occurredAt: input.occurredAt || null,
        timeConfidence: input.timeConfidence === 'uncertain' ? 'uncertain' : 'confirmed',
        label: input.label.trim(),
        relatedEvidenceId: input.relatedEvidenceId || null,
      };
      setState((prev) => {
        const draft = {
          ...prev,
          timelineByCase: {
            ...prev.timelineByCase,
            [caseId]: sortEvents([...(prev.timelineByCase[caseId] || []), event]),
          },
        };
        return touchCase(draft, caseId);
      });
      return event;
    },
    [touchCase],
  );

  /** Demo only; replace with real services. Returns the demo to its seeded state. */
  const resetDemo = useCallback(() => {
    const fresh = seed();
    setState(fresh);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
  }, []);

  const value = useMemo(
    () => ({
      cases: state.cases,
      evidenceByCase: state.evidenceByCase,
      timelineByCase: state.timelineByCase,
      getCase: (caseId) => state.cases.find((c) => c.caseId === caseId) || null,
      getEvidence: (caseId) => state.evidenceByCase[caseId] || [],
      getTimeline: (caseId) => sortEvents(state.timelineByCase[caseId] || []),
      createCase,
      addEvidence,
      removeEvidence,
      setVerificationStatus,
      addEvent,
      resetDemo,
    }),
    [state, createCase, addEvidence, removeEvidence, setVerificationStatus, addEvent, resetDemo],
  );

  return <VeraStoreContext.Provider value={value}>{children}</VeraStoreContext.Provider>;
}

export function useVera() {
  const ctx = useContext(VeraStoreContext);
  if (!ctx) throw new Error('useVera must be used inside <VeraStoreProvider>');
  return ctx;
}

export { CaseStatus, VerificationStatus };
