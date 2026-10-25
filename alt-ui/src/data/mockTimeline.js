// VeraTrace — mock timeline data
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
