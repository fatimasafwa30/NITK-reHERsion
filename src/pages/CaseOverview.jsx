import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowRight, ChevronRight, Clock3, FileDown, FileSearch, Plus, ScrollText } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { CaseStatusMark } from '../components/ui/StatusMark';
import { EvidenceSheet } from '../components/EvidenceSheet';
import { Timeline } from '../components/Timeline';
import { AddEventDialog } from '../components/AddEventDialog';
import { PatternAnalysis } from '../components/PatternAnalysis';
import { useVera } from '../store/VeraStore';
import { formatDate, relativeDay } from '../lib/format';
import { isDemoCase } from '../data/demoCaseData';

export function CaseOverview() {
  const { caseId } = useParams();
  const { getCase, getEvidence, getTimeline } = useVera();

  const record = getCase(caseId);
  const evidence = getEvidence(caseId);
  const events = getTimeline(caseId);

  const [eventOpen, setEventOpen] = useState(false);
  const [activeEvidenceId, setActiveEvidenceId] = useState(null);

  const evidenceById = useMemo(
    () => Object.fromEntries(evidence.map((item) => [item.evidenceId, item])),
    [evidence],
  );

  if (!record) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8">
        <EmptyState
          icon={FileSearch}
          title="That case is not here"
          action={<Button to="/dashboard" variant="primary">Back to your cases</Button>}
        >
          <p>
            The case <span className="mono text-plum">{caseId}</span> is not in this browser. If you reset the demo
            data, cases you added earlier were discarded.
          </p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
          <li>
            <Link to="/dashboard" className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-plum sm:min-h-0">
              Cases
            </Link>
          </li>
          <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-lilac" />
          <li aria-current="page" className="min-w-0 truncate text-plum">
            {record.title}
          </li>
        </ol>
      </nav>

      {(isDemoCase(caseId) || record.isDemo) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="mono font-bold uppercase tracking-wider text-amber-800">Simulated Demo Case</span>
            <span className="text-amber-700/80">·</span>
            <span>All entities, messages, accounts, and evidence in this case are fictional demonstration artifacts.</span>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-lilac pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="display-lg text-plum">{record.title}</h1>
            {(isDemoCase(caseId) || record.isDemo) && (
              <span className="mono inline-flex items-center rounded border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-amber-800">
                Simulated Demo Data
              </span>
            )}
          </div>
          <div className="mono mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.6875rem] text-muted">
            <span className="text-plum/80">{record.caseId}</span>
            <span aria-hidden="true" className="text-lilac">·</span>
            <span>opened {formatDate(record.createdAt)}</span>
            <span aria-hidden="true" className="text-lilac">·</span>
            <span>updated {relativeDay(record.updatedAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button to={`/case/${record.caseId}/analysis`} variant="secondary" size="sm">
            <Activity aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            Analyse Patterns
          </Button>
          <Button to={`/case/${record.caseId}/dossier`} variant="primary" size="sm">
            <FileDown aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
            Generate Evidence Dossier
          </Button>
        </div>
      </header>

      {/* Workflow Navigation Banner */}
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-lilac/70 bg-wash/50 px-4 py-3 text-xs text-plum">
        <span className="mono font-semibold uppercase tracking-wider text-muted mr-1">Journey:</span>
        <span className="rounded border border-violet-deep/30 bg-paper px-2 py-0.5 font-semibold text-violet-deep shadow-xs">
          1. Case Overview
        </span>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <Link to={`/case/${record.caseId}/evidence`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper">
          2. Add Evidence
        </Link>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <Link to={`/case/${record.caseId}/analysis`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper">
          3. Analyse Patterns
        </Link>
        <ArrowRight className="size-3 text-lilac shrink-0" aria-hidden="true" />
        <Link to={`/case/${record.caseId}/dossier`} className="rounded px-2 py-0.5 text-muted hover:text-plum hover:bg-paper font-medium">
          4. Export Dossier
        </Link>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Rail. On a phone the actions come first, because that is what a
            person reaches for; on a desktop it sits beside the record. */}
        <aside className="order-first lg:order-last lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <div className="rounded-lg border border-lilac bg-paper p-5 shadow-sheet sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="eyebrow">This case</p>
                <CaseStatusMark status={record.status} />
              </div>

              {record.summary ? (
                <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">{record.summary}</p>
              ) : (
                <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">No summary written yet.</p>
              )}

              <hr className="rule my-5" />

              <dl className="mono space-y-2 text-[0.6875rem] text-muted">
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Sealed files</dt>
                  <dd className="text-plum">{evidence.length}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Timeline events</dt>
                  <dd className="text-plum">{events.length}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Uncertain dates</dt>
                  <dd className="text-plum">
                    {events.filter((e) => e.timeConfidence === 'uncertain' || !e.occurredAt).length}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-col gap-2.5">
                <Button to={`/case/${record.caseId}/evidence`} variant="primary">
                  <Plus aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Add evidence
                </Button>
                <Button to={`/case/${record.caseId}/evidence`} variant="outline" className="border-lilac text-plum">
                  Open evidence workspace
                </Button>
                <Button to={`/case/${record.caseId}/analysis`} variant="secondary">
                  <Activity aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Cross-Platform Analysis
                </Button>
                <Button
                  to={`/case/${record.caseId}/dossier`}
                  variant="outline"
                  className="border-violet-deep/50 bg-wash/60 text-violet-deep font-semibold hover:border-violet-deep hover:bg-wash"
                >
                  <FileDown aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Generate Evidence Dossier
                </Button>
                <Button variant="ghost" onClick={() => setEventOpen(true)}>
                  <Clock3 aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Add timeline event
                </Button>
              </div>
            </div>

            {evidence.length ? (
              <div className="mt-6">
                <p className="eyebrow">Recently sealed</p>
                <div className="mt-4 space-y-3">
                  {evidence.slice(0, 2).map((item) => (
                    <EvidenceSheet
                      key={item.evidenceId}
                      record={item}
                      highlighted={activeEvidenceId === item.evidenceId}
                    />
                  ))}
                </div>
                {evidence.length > 2 ? (
                  <Link
                    to={`/case/${record.caseId}/evidence`}
                    className="mt-4 inline-flex min-h-11 items-center text-[0.8125rem] text-violet-deep underline decoration-lilac decoration-1 underline-offset-4 hover:decoration-violet"
                  >
                    See all {evidence.length} files
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        {/* The record itself. */}
        <section className="lg:col-span-8 space-y-10">
          {/* Prominent Cross-Platform Feature Spotlight */}
          <div className="rounded-lg border border-lilac bg-paper p-6 shadow-sheet">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-lilac/70 pb-4">
              <div>
                <span className="mono text-[0.625rem] font-bold uppercase tracking-wider text-violet-deep">
                  Core Analysis & Forensic Intelligence
                </span>
                <h2 className="font-serif text-xl font-semibold text-plum mt-1">
                  Cross-Platform Harassment Pattern Analysis
                </h2>
                <p className="mt-1 text-xs text-muted max-w-xl">
                  Automatically correlates multi-channel contact across WhatsApp, Instagram, Email, Calls, and SMS. Identifies shared handles, block bypasses, and escalation indicators.
                </p>
              </div>
              <Button
                to={`/case/${record.caseId}/analysis`}
                variant="primary"
                size="sm"
                className="shrink-0"
              >
                <Activity aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
                View Full Analysis & Graph
                <ArrowRight aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
              </Button>
            </div>

            {/* Embedded Pattern Analysis Summary */}
            <div className="mt-5">
              <PatternAnalysis caseRecord={record} evidence={evidence} timeline={events} />
            </div>
          </div>

          <div aria-labelledby="timeline-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="timeline-heading" className="display-md text-plum">
                  Timeline
                </h2>
                <p className="mt-1.5 text-[0.8125rem] text-muted">
                  In the order things happened, as far as is known.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEventOpen(true)} className="shrink-0">
                <Plus aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
                Add event
              </Button>
            </div>

            <hr className="rule mt-6" />

            {events.length ? (
              <Timeline
                className="mt-8"
                events={events}
                evidenceById={evidenceById}
                activeEvidenceId={activeEvidenceId}
                onFocusEvidence={setActiveEvidenceId}
              />
            ) : (
              <EmptyState
                className="mt-8"
                align="left"
                icon={Clock3}
                title="The timeline is empty"
                action={
                  <Button variant="primary" onClick={() => setEventOpen(true)}>
                    <Plus aria-hidden="true" strokeWidth={1.5} className="size-4" />
                    Add the first event
                  </Button>
                }
              >
                <p>
                  Start wherever you remember most clearly. You can add earlier events later, and mark any date you
                  are unsure of as uncertain.
                </p>
              </EmptyState>
            )}
          </div>
        </section>
      </div>

      <AddEventDialog open={eventOpen} onOpenChange={setEventOpen} caseId={record.caseId} evidence={evidence} />
    </div>
  );
}

export default CaseOverview;
