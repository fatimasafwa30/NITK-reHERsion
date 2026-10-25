# VeraTrace

A calm, precise place to preserve evidence and keep an organised, timestamped record.

Files are read and hashed **on the device**. Nothing is uploaded, and no original file is
modified. This build is a front-end demonstration: all state lives in the browser.

## Running it

```bash
npm install
npm run dev     # http://localhost:5176
npm run build
npm run preview
```

The dev server uses `strictPort`, so port 5176 must be free.

## Stack

Vite · React 18 · React Router v7 (declarative) · Tailwind CSS v4 (`@tailwindcss/vite`, `@theme`
tokens) · Radix UI (Dialog, Tooltip) · lucide-react · motion · clsx + tailwind-merge ·
`@fontsource-variable` for Fraunces (display), Inter (UI) and JetBrains Mono (hashes, IDs, times).

## Routes

| Route | What it is |
| --- | --- |
| `/` | Landing — editorial composition, a real evidence sheet as the focal specimen |
| `/dashboard` | Case list with search, status filter and hover-revealed quick actions |
| `/case/:caseId` | Timeline as the main column, sticky summary/action rail |
| `/case/:caseId/evidence` | Evidence studio — dropzone, sealed sheets, detail pane |
| `/case/:caseId/dossier` | Printable dossier + integrity report |
| `/verify` | Side-by-side hash comparison of two files |

## Design system

Tokens are declared once in `src/styles/app.css` under `@theme`. Nothing in the app hard-codes a
colour, font, radius or shadow.

- **Palette** — ivory, lavender wash, lilac, muted violet, violet-deep, plum ink, muted text.
  `--color-violet` is decorative and large-text only (4.4:1 on ivory); `--color-violet-deep`
  (7.8:1) carries every interactive and primary use. All body text passes WCAG AA.
- **Status** is never carried by colour alone — every state is an icon plus a word
  (`src/components/ui/StatusMark.jsx`).
- **Signature pieces** — `EvidenceSheet` (archival sheet), `Timeline` + `TimelineMarker`
  (solid stop for a confirmed date, dashed stop plus a "date uncertain" label otherwise),
  `SealMark` (draws itself in once when a file is sealed or verified), and the dossier.

## Safety behaviour

- **Quick Exit** sits in the top bar at every width, quieter than the primary action, and
  **Escape** triggers it globally — including while a dialog is open. Radix dialogs set
  `onEscapeKeyDown` to `preventDefault()` so they can never swallow the key; they close via
  Cancel, the X, or a scrim click.
- **Honest copy.** A matching hash shows a file has not changed since it was added. It does not
  prove who created it, when the events in it happened, or that it will be accepted as proof.
  This is stated on the landing page, in every comparison result, and in the dossier.

## Demo data

`src/data/` holds the mock cases, evidence and timeline, matching the shapes in
`reference/DATA_CONTRACT.md`. `src/store/VeraStore.jsx` keeps everything in memory and persists
to `localStorage` inside `try/catch`, so a refresh keeps the demo. Every store function is marked
`Demo only; replace with real services.` **Reset demo data** lives in the footer.

Note: three of the four seeded `sha256` values in `reference/` are 63 hex characters rather than
64. The copies in `src/data/mockEvidence.js` are padded to valid 64-character digests; field
names and record shapes are unchanged.

## Known limits

- `Download evidence ZIP` is visibly disabled and marked "Coming with backend" — bundling
  original files needs a server, and this build deliberately keeps every file on the device.
- Hashing is capped at 50 MB per file.
- Case titles, summaries and statuses cannot be edited after creation.
