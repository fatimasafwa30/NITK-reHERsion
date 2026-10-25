// Demo only; replace with real services.
import React, { createContext, useContext, useState, useCallback } from 'react';
import { mockCases as initialCases } from '../data/mockCases';
import { mockEvidenceByCase as initialEvidence, VerificationStatus } from '../data/mockEvidence';
import { mockTimelineByCase as initialTimeline } from '../data/mockTimeline';

export async function computeFileSHA256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CaseContext = createContext(null);

export function CaseProvider({ children }) {
  // Demo only; replace with real services.
  const [cases, setCases] = useState(initialCases);
  const [evidenceByCase, setEvidenceByCase] = useState(initialEvidence);
  const [timelineByCase, setTimelineByCase] = useState(initialTimeline);

  const getCase = useCallback((caseId) => {
    return cases.find((c) => c.caseId === caseId) || null;
  }, [cases]);

  const getEvidence = useCallback((caseId) => {
    return evidenceByCase[caseId] || [];
  }, [evidenceByCase]);

  const getTimeline = useCallback((caseId) => {
    return timelineByCase[caseId] || [];
  }, [timelineByCase]);

  const addCase = useCallback(({ title, summary }) => {
    const newId = `case_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const newCase = {
      caseId: newId,
      title: title.trim(),
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
      evidenceCount: 0,
      summary: summary.trim(),
    };
    setCases((prev) => [newCase, ...prev]);
    setEvidenceByCase((prev) => ({ ...prev, [newId]: [] }));
    setTimelineByCase((prev) => ({ ...prev, [newId]: [] }));
    return newCase;
  }, []);

  const addEvidence = useCallback(async (caseId, file) => {
    const sha256 = await computeFileSHA256(file);
    const newRecord = {
      evidenceId: `ev_${Date.now().toString(36)}`,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      recordedAt: new Date().toISOString(),
      sha256,
      verificationStatus: VerificationStatus.MATCH,
    };

    setEvidenceByCase((prev) => ({
      ...prev,
      [caseId]: [newRecord, ...(prev[caseId] || [])],
    }));

    setCases((prev) =>
      prev.map((c) =>
        c.caseId === caseId
          ? { ...c, evidenceCount: (c.evidenceCount || 0) + 1, updatedAt: new Date().toISOString() }
          : c
      )
    );

    return newRecord;
  }, []);

  const reverifyEvidence = useCallback(async (caseId, evidenceId, file) => {
    const computedHash = await computeFileSHA256(file);
    const currentList = evidenceByCase[caseId] || [];
    const target = currentList.find((e) => e.evidenceId === evidenceId);

    const isMatch = target && target.sha256.toLowerCase() === computedHash.toLowerCase();
    const status = isMatch ? VerificationStatus.MATCH : VerificationStatus.MISMATCH;

    setEvidenceByCase((prev) => ({
      ...prev,
      [caseId]: (prev[caseId] || []).map((e) =>
        e.evidenceId === evidenceId ? { ...e, verificationStatus: status } : e
      ),
    }));

    return {
      match: isMatch,
      computedHash,
      originalHash: target ? target.sha256 : '',
    };
  }, [evidenceByCase]);

  const addTimelineEvent = useCallback((caseId, { label, occurredAt, timeConfidence, relatedEvidenceId }) => {
    const newEvent = {
      eventId: `tl_${Date.now().toString(36)}`,
      occurredAt: occurredAt || null,
      timeConfidence: timeConfidence || 'confirmed',
      label: label.trim(),
      relatedEvidenceId: relatedEvidenceId || null,
    };

    setTimelineByCase((prev) => ({
      ...prev,
      [caseId]: [...(prev[caseId] || []), newEvent],
    }));

    setCases((prev) =>
      prev.map((c) =>
        c.caseId === caseId ? { ...c, updatedAt: new Date().toISOString() } : c
      )
    );

    return newEvent;
  }, []);

  const value = {
    cases,
    getCase,
    getEvidence,
    getTimeline,
    addCase,
    addEvidence,
    reverifyEvidence,
    addTimelineEvent,
  };

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

// Demo only; replace with real services.
export function useCaseStore() {
  const context = useContext(CaseContext);
  if (!context) {
    throw new Error('useCaseStore must be used within a CaseProvider');
  }
  return context;
}
