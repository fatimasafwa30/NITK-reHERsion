// VeraTrace — mock case data (Person 3's domain).
//
// Replaced by src/services/caseStore.js once case management lands.
// See src/services/README.md for the expected function names.

// CaseStatus is owned by src/services/caseStore.js once it lands;
// this copy is temporary.
export const CaseStatus = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
});

export const mockCases = [
  {
    caseId: 'case_1001',
    title: 'Workplace harassment — messages & emails',
    status: CaseStatus.IN_PROGRESS,
    createdAt: '2026-09-14T10:05:00.000Z',
    updatedAt: '2026-10-20T08:40:00.000Z',
    evidenceCount: 6,
    summary:
      'Repeated unwanted messages from a coworker across chat and email, beginning mid-September.',
  },
  {
    caseId: 'case_1002',
    title: 'Online impersonation — fake profile',
    status: CaseStatus.OPEN,
    createdAt: '2026-10-02T14:22:00.000Z',
    updatedAt: '2026-10-18T09:10:00.000Z',
    evidenceCount: 3,
    summary: 'A fake social media profile using my name and photos was reported but is still active.',
  },
  {
    caseId: 'case_1003',
    title: 'Threatening voicemails',
    status: CaseStatus.CLOSED,
    createdAt: '2026-07-01T09:00:00.000Z',
    updatedAt: '2026-08-11T16:30:00.000Z',
    evidenceCount: 4,
    summary: 'Closed after evidence was shared with local support services.',
  },
];

export function getCaseById(caseId) {
  return mockCases.find((c) => c.caseId === caseId) || null;
}
