# src/services — where Person 2 and Person 3 build

This folder is empty on purpose. The frontend currently reads mock data through
hooks in `src/hooks/`. Each hook has one mock import to swap for a real call —
**no page component needs to change** when you do.

The canonical field names live in `docs/DATA_CONTRACT.md`. Don't change them
without telling the other two people.

---

## Person 2 — `evidenceStore.js`

Owns evidence intake, SHA-256 hashing, integrity verification, and the timeline
built from evidence plus user-entered events.

Expected exports (this matches the already-tested reference implementation):

```js
export const VerificationStatus = Object.freeze({ UNVERIFIED, MATCH, MISMATCH, ERROR });
export class EvidenceError extends Error {}   // has a stable .code
export async function hashFile(file): Promise<string>        // 64-char lowercase hex
export class EvidenceRegister {
  async addRecord(file): Promise<EvidenceRecord>
  getRecord(evidenceId): EvidenceRecord | null
  getAllRecords(): EvidenceRecord[]
  getFileRef(evidenceId): File | null
  async verify(evidenceId, file): Promise<{ evidenceId, status, candidateHash, referenceHash }>
}
```

**Open design question:** `EvidenceRegister` has no `caseId` concept, but the UI
is case-scoped. Simplest fix is one register instance per case
(`Map<caseId, EvidenceRegister>`) rather than adding a field to the record.
Agree this with Person 3 before building.

### Hooks you replace

| Hook | File | Currently returns | Should return |
|---|---|---|---|
| `useEvidenceForCase(caseId)` | `src/hooks/useEvidenceForCase.js` | `mockEvidenceByCase[caseId]` | that case's `EvidenceRecord[]` |
| `useTimelineForCase(caseId)` | `src/hooks/useTimelineForCase.js` | `mockTimelineByCase[caseId]` | that case's `TimelineEvent[]`, oldest first |

Also replaces: `src/data/mockEvidence.js`, `src/data/mockTimeline.js`.

### UI seams already wired for you

- `<EvidenceWorkspace onAddEvidence={fn} />` — fires from the dropzone's "Choose files" button.
- `<CaseOverview onAddEvidence={fn} onAddTimelineEvent={fn} />` — `onAddTimelineEvent` receives a complete `TimelineEvent` from the "Add event" dialog. The dialog already keeps the event in local state, so persisting it is all that's left.

---

## Person 3 — `caseStore.js`

Owns case creation/editing/retrieval, persistence, and the dossier + PDF/ZIP export.

Expected exports:

```js
export const CaseStatus = Object.freeze({ OPEN, IN_PROGRESS, CLOSED });
export async function getCases(): Promise<Case[]>
export async function getCaseById(caseId): Promise<Case | null>
export async function createCase({ title, summary }): Promise<Case>
export async function updateCase(caseId, patch): Promise<Case>
```

For the dossier page (`/case/:caseId/dossier`), which is built and rendering
from mocks today:

```js
export async function generateDossier(caseId): Promise<{
  caseSummary: Case,
  timeline: TimelineEvent[],
  evidenceIndex: EvidenceRecord[],
  integrityDetails: { evidenceId, sha256, verificationStatus }[],
}>
export async function exportDossierPdf(caseId): Promise<Blob>
export async function exportEvidenceZip(caseId): Promise<Blob>
```

### Hooks you replace

| Hook | File | Currently returns | Should return |
|---|---|---|---|
| `useCases()` | `src/hooks/useCases.js` | `mockCases` | `Case[]` |
| `useCase(caseId)` | `src/hooks/useCase.js` | `getCaseById(caseId)` | one `Case`, or `null` if missing |

Also replaces: `src/data/mockCases.js`.

### UI seams already wired for you

- `<Dashboard onNewCase={fn} />` — fires from the "New case" button.
- The dossier page's "Download PDF" / "Download evidence ZIP" buttons are
  disabled placeholders in `src/pages/Dossier.jsx`, waiting on the two export
  functions above.

---

## Making the hooks async

All four hooks return `{ data, loading, error }` today with `loading: false` and
`error: null`. When you swap in a real async call, set those properly — the
shape is already what the pages consume, but note that **pages currently only
render a "not found" state, not loading or error states**. Tell Person 1 when
you go async so those states get designed.
