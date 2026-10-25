import { useMemo, useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Clock3, FileSearch, Plus, ScrollText } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { CaseStatusMark } from '../components/ui/StatusMark';
import { EvidenceSheet } from '../components/EvidenceSheet';
import { Timeline } from '../components/Timeline';
import { AddEventDialog } from '../components/AddEventDialog';
import { useVera } from '../store/VeraStore';
import { formatDate, relativeDay } from '../lib/format';
import { mockCases } from '../data/mockCases';
import { getEvidenceForCase } from '../services/evidenceService';
import {
  getTimelineForCase,
  addTimelineEventForCase,
  subscribeTimeline,
} from '../services/timelineService';

export function CaseOverview({ onAddEvidence, onAddTimelineEvent } = {}) {
  const { caseId } = useParams();

  let vera = null;
  try {
    vera = useVera();
  } catch {
    vera = null;
  }

  const [, setTimelineTick] = useState(0);

  // Subscribe to live timeline state updates
  useEffect(() => {
    if (!caseId) return undefined;
    return subscribeTimeline(caseId, () => {
      setTimelineTick((t) => t + 1);
    });
  }, [caseId]);

  const record =
    vera?.getCase(caseId) ||
    mockCases.find((c) => c.caseId === caseId) ||
    (caseId ? { caseId, title: 'Case Record', status: 'OPEN', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), summary: '' } : null);

  const evidenceFromStore = vera?.getEvidence(caseId) || [];
  const serviceEvidence = caseId ? getEvidenceForCase(caseId) : [];
  const evidence = serviceEvidence.length > 0 ? serviceEvidence : evidenceFromStore;

  const timelineFromStore = vera?.getTimeline(caseId) || [];
  const serviceTimeline = caseId ? getTimelineForCase(caseId) : [];
  const allEvents = [...timelineFromStore, ...serviceTimeline];
  const seen = new Set();
  const events = allEvents.filter((e) => {
    const key = e.eventId || `${e.label}_${e.occurredAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

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
            The case <span className="mono text-plum">{caseId}</span> is not in this browser.
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

      <header className="max-w-3xl">
        <h1 className="display-lg text-plum">{record.title}</h1>
        <div className="mono mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.6875rem] text-muted">
          <span className="text-plum/80">{record.caseId}</span>
          <span aria-hidden="true" className="text-lilac">·</span>
          <span>opened {formatDate(record.createdAt)}</span>
          <span aria-hidden="true" className="text-lilac">·</span>
          <span>updated {relativeDay(record.updatedAt)}</span>
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Rail */}
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

              <div className="mt-6 flex flex-col gap-2">
                <Button
                  to={`/case/${record.caseId}/evidence`}
                  variant="primary"
                  onClick={onAddEvidence}
                >
                  <Plus aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Add evidence
                </Button>
                <Link
                  to={`/case/${record.caseId}/evidence`}
                  className="mt-1 inline-flex min-h-11 items-center text-[0.8125rem] text-violet-deep underline decoration-lilac decoration-1 underline-offset-4 hover:decoration-violet"
                >
                  Open evidence workspace
                </Link>
                <Button variant="secondary" onClick={() => setEventOpen(true)}>
                  <Clock3 aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Add timeline event
                </Button>
                <Button to={`/case/${record.caseId}/dossier`} variant="ghost">
                  <ScrollText aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Export dossier
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

        {/* The record itself */}
        <section className="lg:col-span-8" aria-labelledby="timeline-heading">
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
        </section>
      </div>

      <AddEventDialog
        open={eventOpen}
        onOpenChange={setEventOpen}
        caseId={record.caseId}
        evidence={evidence}
      />
    </div>
  );
}

export default CaseOverview;
