// VeraTrace — mock evidence data
export const VerificationStatus = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  ERROR: 'ERROR',
});

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
