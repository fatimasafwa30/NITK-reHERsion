import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Activity, FileDown, FolderClosed, Plus, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { DURATION, EASE, stagger } from '../motion/tokens';
import { Input, Select } from '../components/ui/Field';
import { EmptyState } from '../components/ui/EmptyState';
import { CaseStatusMark } from '../components/ui/StatusMark';
import { NewCaseDialog } from '../components/NewCaseDialog';
import { useVera } from '../store/VeraStore';
import { formatDate, relativeDay } from '../lib/format';

export function Dashboard() {
  const { cases, evidenceByCase, loadDemoCase } = useVera();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  const stats = useMemo(() => {
    const files = Object.values(evidenceByCase).reduce((total, list) => total + list.length, 0);
    const latest = cases.reduce((acc, item) => (!acc || item.updatedAt > acc ? item.updatedAt : acc), null);
    return { cases: cases.length, files, latest };
  }, [cases, evidenceByCase]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases
      .filter((item) => (status === 'ALL' ? true : item.status === status))
      .filter((item) =>
        needle
          ? `${item.title} ${item.summary}`.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [cases, query, status]);

  const filtering = Boolean(query.trim()) || status !== 'ALL';

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <header>
        <p className="eyebrow">Your cases</p>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="display-lg max-w-[24ch] text-plum">
            Everything you have put <em className="italic">on the record</em>.
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 max-sm:w-full">
            <Button
              variant="secondary"
              onClick={() => {
                loadDemoCase?.();
                navigate('/case/VT-DEMO-2026');
              }}
              className="max-sm:flex-1 border-lilac text-plum hover:border-violet"
            >
              <Sparkles aria-hidden="true" strokeWidth={1.5} className="size-4 text-violet-deep" />
              Load Demo Case
            </Button>
            <Button variant="primary" onClick={() => setNewCaseOpen(true)} className="max-sm:flex-1">
              <Plus aria-hidden="true" strokeWidth={1.5} className="size-4" />
              New case
            </Button>
          </div>
        </div>
      </header>

      {/* One quiet line of figures, set like a caption rather than a dashboard. */}
      <dl className="mono mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-2 text-[0.8125rem] text-muted">
        <div className="flex items-baseline gap-2">
          <dt className="sr-only">Cases</dt>
          <dd className="text-plum">{stats.cases}</dd>
          <span>{stats.cases === 1 ? 'case' : 'cases'}</span>
        </div>
        <span aria-hidden="true" className="text-lilac">
          /
        </span>
        <div className="flex items-baseline gap-2">
          <dt className="sr-only">Sealed files</dt>
          <dd className="text-plum">{stats.files}</dd>
          <span>sealed {stats.files === 1 ? 'file' : 'files'}</span>
        </div>
        <span aria-hidden="true" className="text-lilac">
          /
        </span>
        <div className="flex items-baseline gap-2">
          <dt className="sr-only">Last activity</dt>
          <dd className="text-plum">{stats.latest ? relativeDay(stats.latest) : '—'}</dd>
          <span>last activity</span>
        </div>
      </dl>

      <hr className="rule mt-8" />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cases"
            aria-label="Search cases by title or summary"
            className="pl-9"
          />
        </div>
        <div className="relative sm:w-52">
          <SlidersHorizontal
            aria-hidden="true"
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter cases by status"
            className="pl-9"
          >
            <option value="ALL">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {filtering ? `${filtered.length} of ${cases.length} cases shown.` : ''}
      </p>

      {filtered.length ? (
        <ul className="mt-8 border-t border-lilac">
          {filtered.map((item, index) => {
            const count = evidenceByCase[item.caseId]?.length ?? item.evidenceCount;
            return (
              <motion.li
                key={item.caseId}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.base, delay: stagger(index), ease: EASE.out }}
                className="group border-b border-lilac"
              >
                <div
                  onClick={() => navigate(`/case/${item.caseId}`)}
                  className="relative cursor-pointer px-2 py-5 transition-colors duration-[var(--dur-fast)] hover:bg-wash/55 focus-within:bg-wash/40 sm:px-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[1.0625rem] font-medium leading-snug text-plum">
                          <Link
                            to={`/case/${item.caseId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-sm transition-colors group-hover:text-violet-press"
                          >
                            {item.title}
                          </Link>
                        </h2>
                        {(item.isDemo || item.caseId === 'VT-DEMO-2026') && (
                          <span className="mono inline-flex items-center rounded border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-amber-800">
                            Simulated Demo Data
                          </span>
                        )}
                      </div>
                      {item.summary ? (
                        <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-muted">
                          {item.summary}
                        </p>
                      ) : null}
                      <p className="mono mt-2.5 text-[0.6875rem] text-muted">
                        {item.caseId} · opened {formatDate(item.createdAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 sm:w-64 sm:flex-col sm:items-end sm:gap-1.5">
                      <CaseStatusMark status={item.status} />
                      <p className="mono text-[0.6875rem] text-muted">
                        {count} sealed {count === 1 ? 'file' : 'files'}
                      </p>
                      <p className="mono text-[0.6875rem] text-muted">updated {relativeDay(item.updatedAt)}</p>
                    </div>
                  </div>

                  {/* Direct access to workflow steps */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-lilac/40">
                    <Button
                      to={`/case/${item.caseId}`}
                      variant="primary"
                      size="sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open Case
                    </Button>
                    <Button
                      to={`/case/${item.caseId}/evidence`}
                      variant="secondary"
                      size="sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Add Evidence ({count})
                    </Button>
                    <Button
                      to={`/case/${item.caseId}/analysis`}
                      variant="secondary"
                      size="sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Activity aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
                      Analyse Patterns
                    </Button>
                    <Button
                      to={`/case/${item.caseId}/dossier`}
                      variant="outline"
                      size="sm"
                      className="border-lilac text-plum hover:border-violet"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <FileDown aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
                      Generate Evidence Dossier
                    </Button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          className="mt-8"
          icon={FolderClosed}
          title={filtering ? 'Nothing matches that' : 'No cases yet'}
          action={
            filtering ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setStatus('ALL');
                }}
              >
                Clear search and filter
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setNewCaseOpen(true)}>
                <Plus aria-hidden="true" strokeWidth={1.5} className="size-4" />
                Start your first case
              </Button>
            )
          }
        >
          {filtering ? (
            <p>
              No case matches <span className="text-plum">{query.trim() || 'that filter'}</span>. Try a shorter
              search, or widen the status filter.
            </p>
          ) : (
            <p>A case holds the files and the timeline for one situation. You can start one now and add to it later.</p>
          )}
        </EmptyState>
      )}

      <NewCaseDialog open={newCaseOpen} onOpenChange={setNewCaseOpen} />
    </div>
  );
}

export default Dashboard;
