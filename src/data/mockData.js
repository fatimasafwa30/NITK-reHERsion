// VeraTrace — mock data for frontend development.
//
// This file exists so Person 1 (frontend) is never blocked waiting on
// Person 2 (evidence) or Person 3 (backend/case management). The shapes
// below are a PROPOSED shared contract, not a final one — all three people
// must agree on case/evidence/timeline field names before wiring real data
// in. See docs/DATA_CONTRACT.md for the write-up of this contract.
//
// Evidence record shape matches the schema already used by the evidence
// module (evidenceId, fileName, mimeType, sizeBytes, recordedAt, sha256,
// verificationStatus) so Person 2's real records can drop in with no
// frontend changes.

export const CaseStatus = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
});

export const VerificationStatus = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  ERROR: 'ERROR',
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

export const mockEvidenceByCase = {
  case_1001: [
    {
      evidenceId: 'ev_a1',
      fileName: 'chat-screenshot-1.png',
      mimeType: 'image/png',
      sizeBytes: 482_112,
      recordedAt: '2026-09-14T10:06:00.000Z',
      sha256: '1aa09fc38fed9bfe5d5726bd261038068a4b5ca7d6bf3cab44cb601165bd0b47',
      verificationStatus: VerificationStatus.MATCH,
    },
    {
      evidenceId: 'ev_a2',
      fileName: 'email-thread.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 198_240,
      recordedAt: '2026-09-16T11:30:00.000Z',
      sha256: 'df4cec96e425c6be3f585acc287b66e7dc7123f83bdacb8a57d95c1773e00bf',
      verificationStatus: VerificationStatus.UNVERIFIED,
    },
    {
      evidenceId: 'ev_a3',
      fileName: 'chat-screenshot-2.png',
      mimeType: 'image/png',
      sizeBytes: 511_904,
      recordedAt: '2026-10-01T08:12:00.000Z',
      sha256: 'cd5459e251ee97922e2c7e13dfd28ca5a83e60686da91a499efe5f3ef24c9d8',
      verificationStatus: VerificationStatus.MISMATCH,
    },
  ],
  case_1002: [
    {
      evidenceId: 'ev_b1',
      fileName: 'fake-profile-screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 702_341,
      recordedAt: '2026-10-02T14:25:00.000Z',
      sha256: 'a9e8908882d237e9a77b862b7b430964dcc87832ba98dbeeddba5ccb5824db8',
      verificationStatus: VerificationStatus.MATCH,
    },
  ],
};

export const mockTimelineByCase = {
  case_1001: [
    { eventId: 'tl_1', occurredAt: '2026-09-14T09:40:00.000Z', timeConfidence: 'confirmed', label: 'First unwanted message received', relatedEvidenceId: 'ev_a1' },
    { eventId: 'tl_2', occurredAt: '2026-09-16T11:00:00.000Z', timeConfidence: 'confirmed', label: 'Follow-up email sent to HR', relatedEvidenceId: 'ev_a2' },
    { eventId: 'tl_3', occurredAt: null, timeConfidence: 'uncertain', label: 'Approximate date of a verbal incident (exact time not recalled)', relatedEvidenceId: null },
  ],
  case_1002: [
    { eventId: 'tl_4', occurredAt: '2026-10-02T14:20:00.000Z', timeConfidence: 'confirmed', label: 'Fake profile discovered', relatedEvidenceId: 'ev_b1' },
  ],
};

export function getCaseById(caseId) {
  return mockCases.find((c) => c.caseId === caseId) || null;
}
