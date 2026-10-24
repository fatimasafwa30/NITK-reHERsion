// VeraTrace — mock timeline data (Person 2's domain).
//
// The timeline is built from evidence plus user-entered events, so it is
// replaced by the timeline half of src/services/evidenceStore.js (or a
// sibling module) once that lands. See src/services/README.md.

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
