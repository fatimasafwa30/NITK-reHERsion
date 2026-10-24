# VeraTrace

A private, calm place to collect and organize evidence of harassment or abuse, and to keep a
clear record of what happened.

VeraTrace is a prototype built for a short team sprint. It helps someone gather screenshots,
documents and notes into a case, record a SHA-256 hash for each file so later changes are
detectable, and lay the result out as a timeline and dossier they can bring to someone they trust.

**What it does not do:** a matching hash shows a file hasn't changed since it was added here. It
does not prove who created a file, when an incident happened, or guarantee a record will be
accepted as legal proof. The product language is deliberately honest about this, and so should
any change you make be.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default).

```bash
npm run build     # production build
npm run preview   # serve the production build
```

Requires Node 18+. There is no backend, no database and no network calls — everything runs in
the browser against mock data.

## Quick Exit

Every screen has a **Quick exit** control in the top bar, and **pressing Escape anywhere leaves
the site immediately** (replacing the history entry so the back button doesn't return). This is a
safety feature for people who may be watched while using the app.

If you touch navigation, layout or keyboard handling, re-check that Quick Exit is still visible
at every breakpoint — including mobile, where it must never be hidden inside a menu — and that
Escape still works. The one deliberate exception: while the "Add event" dialog is open, Escape
closes that dialog instead of exiting.

## Project structure

```
src/
  components/    shared UI: Button, Card, StatusChip, StatCard, EmptyState,
                 QuickExit, AddEventDialog, AppNav, Logo, Footer
  layouts/       MarketingLayout (landing), AppLayout (sidebar app shell)
  pages/         Landing, Dashboard, CaseOverview, EvidenceWorkspace, Dossier
  hooks/         useCases, useCase, useEvidenceForCase, useTimelineForCase
                 — the single swap point from mock data to real services
  data/          mock data, split by domain (mockCases / mockEvidence / mockTimeline)
                 mockData.js re-exports all three for backwards compatibility
  services/      empty — see services/README.md for who builds what here
  styles/        tokens.css (single source of truth) + global.css
docs/
  DATA_CONTRACT.md   agreed Case / EvidenceRecord / TimelineEvent shapes
```

Styling is CSS Modules plus design tokens. There is no CSS framework. Never hardcode a colour,
size or spacing value — use the tokens in `src/styles/tokens.css`.

Routes: `/`, `/dashboard`, `/case/:caseId`, `/case/:caseId/evidence`, `/case/:caseId/dossier`.

## Who builds where

| | Owns | Builds in |
|---|---|---|
| **Person 1** | UI/UX, design system, all screens, responsive + accessibility | `src/components`, `src/layouts`, `src/pages`, `src/styles` |
| **Person 2** | Evidence upload, SHA-256 hashing, integrity verification, timeline | `src/services/evidenceStore.js` |
| **Person 3** | Case management, persistence, dossier, PDF/ZIP export | `src/services/caseStore.js` |

Read [`src/services/README.md`](src/services/README.md) before starting on Person 2 or Person 3
work — it lists the exact function names the hooks expect and the UI seams already wired up
(`onNewCase`, `onAddEvidence`, `onAddTimelineEvent`), so you can add real behaviour in new files
without editing page components.

Two rules that keep the three of us from colliding:

1. **Don't change the shapes in `docs/DATA_CONTRACT.md`** without telling the other two.
2. **Swap mocks at the hook layer**, not inside pages. Every page already reads
   `{ data, loading, error }`.
