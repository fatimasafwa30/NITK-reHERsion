import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EvidenceSheet } from '../components/EvidenceSheet';
import { Timeline } from '../components/Timeline';
import { mockEvidenceByCase } from '../data/mockEvidence';
import { mockTimelineByCase } from '../data/mockTimeline';

const SPECIMEN = mockEvidenceByCase.case_1001[0];
const SPECIMEN_BEHIND = mockEvidenceByCase.case_1001[1];
const SPECIMEN_EVENTS = mockTimelineByCase.case_1001;
const SPECIMEN_EVIDENCE_BY_ID = Object.fromEntries(
  mockEvidenceByCase.case_1001.map((record) => [record.evidenceId, record]),
);

const STEPS = [
  {
    n: '01',
    title: 'Add the file',
    body: 'A screenshot, a recording, an email. It is read on your device and nothing is uploaded.',
  },
  {
    n: '02',
    title: 'It is sealed',
    body: 'VeraTrace computes a SHA-256 hash — a fingerprint of those exact bytes — and records the time.',
  },
  {
    n: '03',
    title: 'Check it later',
    body: 'Compare the file against its hash at any point to show it has not been altered since.',
  },
];

export function Landing() {
  const reduced = useReducedMotion();
  const rise = (delay) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.25, delay, ease: [0.22, 0.61, 0.36, 1] },
        };

  return (
    <>
      {/* ── Hero: deliberately off-balance. Words left, evidence right and low. */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:pt-24">
        <div className="grid items-start gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <motion.p className="eyebrow" {...rise(0)}>
              Evidence preservation
            </motion.p>

            <motion.h1 className="display-xl mt-5 max-w-[19ch] text-plum" {...rise(0.04)}>
              Keep the record <em className="italic">straight</em>, long before anyone asks for it.
            </motion.h1>

            <motion.p className="mt-7 max-w-lg text-[1.0625rem] leading-relaxed text-muted" {...rise(0.09)}>
              VeraTrace is a quiet place to preserve what happened. Every file you add is fingerprinted with
              SHA-256 on your own device and set down in a timestamped record you can read, order, and hand over
              when you choose to.
            </motion.p>

            <motion.div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3" {...rise(0.14)}>
              <Button to="/dashboard" variant="primary" size="lg">
                Open your cases
                <ArrowRight aria-hidden="true" strokeWidth={1.5} className="size-4" />
              </Button>
              <Link
                to="/verify"
                className="min-h-11 inline-flex items-center text-sm text-violet-deep underline decoration-lilac decoration-1 underline-offset-4 transition-colors hover:decoration-violet"
              >
                Or check a file you already have
              </Link>
            </motion.div>

            <motion.p className="mono mt-10 max-w-md text-[0.6875rem] leading-relaxed text-muted" {...rise(0.18)}>
              Press <span className="text-plum">Esc</span> at any moment to leave for a neutral page.
            </motion.p>
          </div>

          {/* The focal visual is the real component, not a picture of one. */}
          <motion.div className="lg:col-span-5 lg:pt-12" {...rise(0.1)}>
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute -right-5 -top-6 hidden w-full rotate-[2.2deg] sm:block"
              >
                <EvidenceSheet record={SPECIMEN_BEHIND} className="opacity-70 shadow-none" />
              </div>
              <div className="relative">
                <EvidenceSheet record={SPECIMEN} tone="specimen" />
              </div>
            </div>
            <p className="mono mt-4 pl-1 text-[0.625rem] tracking-[0.1em] text-muted">
              SPECIMEN · ONE SEALED RECORD, AS STORED
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Process: one rule, three stops. */}
      <section className="border-y border-lilac bg-wash/45" aria-labelledby="process-heading">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 id="process-heading" className="display-lg max-w-md text-plum">
            Three steps, and then it is on the record.
          </h2>

          <div className="relative mt-14">
            <span
              aria-hidden="true"
              className="absolute left-[13px] top-2 hidden h-px w-full bg-lilac sm:block"
              style={{ width: 'calc(100% - 26px)' }}
            />
            <ol className="grid gap-10 sm:grid-cols-3 sm:gap-8">
              {STEPS.map((step) => (
                <li key={step.n} className="relative pl-10 sm:pl-0">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 grid size-[26px] place-items-center rounded-full border border-violet-deep bg-ivory sm:static sm:mb-6"
                  >
                    <span className="mono text-[0.625rem] font-medium text-violet-deep">{step.n}</span>
                  </span>
                  <h3 className="display-md text-plum">{step.title}</h3>
                  <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── The second signature element, shown rather than described. */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="eyebrow">The timeline</p>
            <h2 className="display-lg mt-5 max-w-[22ch] text-plum">
              An honest order of events — <em className="italic">including</em> the parts you are unsure about.
            </h2>
            <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-muted">
              Memory is not a clean ledger, and a record that pretends otherwise is weaker, not stronger. Dates you
              are certain of get a solid mark. Dates you are not get a dashed one and are labelled as uncertain, so
              nothing in the record overstates what you know.
            </p>
          </div>

          <div className="lg:col-span-6 lg:col-start-7">
            <div className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet sm:p-8">
              <p className="mono text-[0.625rem] tracking-[0.1em] text-muted">
                SPECIMEN · CASE_1001
              </p>
              <hr className="rule my-5" />
              <Timeline events={SPECIMEN_EVENTS} evidenceById={SPECIMEN_EVIDENCE_BY_ID} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Honest limits, in plain prose. No box, no icon, no reassurance. */}
      <section className="border-t border-lilac" aria-labelledby="limits-heading">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <h2 id="limits-heading" className="eyebrow">
              What this does, and what it does not
            </h2>
            <p className="mt-6 text-[1.0625rem] leading-relaxed text-plum">
              A matching hash shows one thing precisely: this file has not changed since you added it. It does not
              prove who made the file, when the events inside it happened, or that any court, employer or platform
              will accept it as proof. VeraTrace keeps your record orderly and verifiable on its own terms — the
              rest depends on people, and on advice from someone qualified to give it.
            </p>
            <p className="mt-5 text-sm leading-relaxed text-muted">
              If you are in immediate danger, contact your local emergency number first. This is a tool for keeping
              a record, not a substitute for support, legal advice, or safety planning.
            </p>
          </div>
        </div>
      </section>

      {/* ── Closing band. */}
      <section className="border-t border-lilac bg-wash/55">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="display-lg max-w-[20ch] text-plum">
              Start with one file. The record builds itself from there.
            </h2>
            <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
              <Button to="/dashboard" variant="primary" size="lg">
                Open your cases
                <ArrowRight aria-hidden="true" strokeWidth={1.5} className="size-4" />
              </Button>
              <p className="mono text-[0.625rem] tracking-[0.1em] text-muted">NO ACCOUNT · NOTHING UPLOADED</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
