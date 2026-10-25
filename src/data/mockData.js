// VeraTrace — mock data barrel.
//
// The data now lives in domain modules so Person 2 (evidence, timeline) and
// Person 3 (cases) can replace their own half without touching the same file:
//
//   mockCases.js    → src/services/caseStore.js      (Person 3)
//   mockEvidence.js → src/services/evidenceStore.js  (Person 2)
//   mockTimeline.js → timeline service               (Person 2)
//
// This file stays as a thin re-export so existing imports keep working.
// Prefer importing from the hooks in src/hooks/ rather than from here.

export { CaseStatus, mockCases, getCaseById } from './mockCases';
export { VerificationStatus, mockEvidenceByCase } from './mockEvidence';
export { mockTimelineByCase } from './mockTimeline';
