import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus, Filter, ShieldAlert, Calendar, Clock, AlertCircle } from 'lucide-react';
import { useVera } from '../store/VeraStore';
import { Button } from '../components/ui/Button';
import { Timeline } from '../components/Timeline';
import { AddEventDialog } from '../components/AddEventDialog';

export function CaseTimeline() {
  const { caseId } = useParams();
  const { getCase, getTimeline, getEvidence } = useVera();

  const caseData = getCase(caseId);
  const events = getTimeline(caseId) || [];
  const evidenceList = getEvidence(caseId) || [];

  const [addEventOpen, setAddEventOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [activeEvidenceId, setActiveEvidenceId] = useState(null);

  const evidenceById = useMemo(() => {
    const map = {};
    evidenceList.forEach((e) => {
      map[e.evidenceId || e.evidence_id] = e;
    });
    return map;
  }, [evidenceList]);

  const filteredEvents = useMemo(() => {
    if (platformFilter === 'ALL') return events;
    return events.filter((e) => e.platform === platformFilter);
  }, [events, platformFilter]);

  const platforms = useMemo(() => {
    const set = new Set();
    events.forEach((e) => {
      if (e.platform) set.add(e.platform);
    });
    return Array.from(set);
  }, [events]);

  const blockEventsCount = useMemo(() => {
    return events.filter((e) => e.blockedPrior).length;
  }, [events]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Link to={`/case/${caseId}`} className="hover:text-plum">Case {caseId}</Link>
            <span>/</span>
            <span className="text-plum font-medium">Timeline</span>
          </div>
          <h1 className="display-lg text-plum">
            Chronological <em className="italic">Incident Timeline</em>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-xl">
            A continuous chronological ledger of multi-platform touchpoints. Confirmed dates are rendered with solid markers; estimated or uncertain timestamps are explicitly identified.
          </p>
        </div>

        <Button variant="primary" onClick={() => setAddEventOpen(true)}>
          <Plus className="size-4 mr-1.5" />
          Add Incident Event
        </Button>
      </div>

      {/* Metrics Strip */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-lilac bg-paper p-4 shadow-sheet">
          <span className="eyebrow">Total Events</span>
          <p className="display-md text-plum mt-1">{events.length}</p>
        </div>

        <div className="rounded-lg border border-lilac bg-paper p-4 shadow-sheet">
          <span className="eyebrow">Active Channels</span>
          <p className="display-md text-plum mt-1">{platforms.length || 1}</p>
        </div>

        <div className="rounded-lg border border-lilac bg-paper p-4 shadow-sheet col-span-2 sm:col-span-1">
          <span className="eyebrow">Block-Bypass Events</span>
          <p className="display-md text-violet-deep mt-1">{blockEventsCount}</p>
        </div>
      </div>

      {/* Platform Filter Bar */}
      <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs text-muted font-medium mr-1 flex items-center gap-1">
          <Filter className="size-3.5" /> Filter:
        </span>
        <button
          type="button"
          onClick={() => setPlatformFilter('ALL')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            platformFilter === 'ALL'
              ? 'bg-violet-deep text-white shadow-xs'
              : 'bg-paper text-muted border border-lilac hover:bg-wash'
          }`}
        >
          All Events ({events.length})
        </button>
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              platformFilter === p
                ? 'bg-violet-deep text-white shadow-xs'
                : 'bg-paper text-muted border border-lilac hover:bg-wash'
            }`}
          >
            {p} ({events.filter((e) => e.platform === p).length})
          </button>
        ))}
      </div>

      {/* Main Timeline Card */}
      <div className="rounded-lg border border-lilac bg-paper p-6 sm:p-8 shadow-sheet">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-muted text-xs">
            No incident events recorded for this selection.
          </div>
        ) : (
          <Timeline
            events={filteredEvents}
            evidenceById={evidenceById}
            activeEvidenceId={activeEvidenceId}
            onFocusEvidence={setActiveEvidenceId}
          />
        )}
      </div>

      <AddEventDialog
        open={addEventOpen}
        onOpenChange={setAddEventOpen}
        caseId={caseId}
      />
    </div>
  );
}
