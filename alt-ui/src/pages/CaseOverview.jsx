import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCaseStore } from '../hooks/useCaseStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import { Dialog, DialogContent, DialogTrigger } from '../components/ui/Dialog';
import EmptyState from '../components/ui/EmptyState';
import { formatDateTime, formatDate } from '../lib/utils';
import { Plus, Clock, FileText, Layers, Archive, ArrowRight, ShieldAlert, Paperclip } from 'lucide-react';

export default function CaseOverview() {
  const { caseId } = useParams();
  const { getCase, getTimeline, getEvidence, addTimelineEvent } = useCaseStore();

  const caseData = getCase(caseId);
  const timeline = getTimeline(caseId);
  const evidence = getEvidence(caseId);

  const [openAddEvent, setOpenAddEvent] = useState(false);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [confidence, setConfidence] = useState('confirmed');
  const [relatedEvidenceId, setRelatedEvidenceId] = useState('');
  const [error, setError] = useState('');

  if (!caseData) {
    return (
      <EmptyState
        title="Case not found"
        description="The requested case identifier does not exist or has been removed."
        actionLabel="Return to Cases"
        onAction={() => window.location.href = '/dashboard'}
      />
    );
  }

  function handleAddEvent(e) {
    e.preventDefault();
    if (!label.trim()) {
      setError('Event description is required.');
      return;
    }

    const occurredAt = date
      ? new Date(`${date}T${time || '00:00'}`).toISOString()
      : null;

    addTimelineEvent(caseId, {
      label,
      occurredAt,
      timeConfidence: confidence,
      relatedEvidenceId: relatedEvidenceId || null,
    });

    setLabel('');
    setDate('');
    setTime('');
    setConfidence('confirmed');
    setRelatedEvidenceId('');
    setError('');
    setOpenAddEvent(false);
  }

  // Sort timeline chronologically (or reverse if desired, chronological is best for legal timelines)
  const sortedTimeline = [...timeline].sort((a, b) => {
    if (!a.occurredAt) return 1;
    if (!b.occurredAt) return -1;
    return new Date(a.occurredAt) - new Date(b.occurredAt);
  });

  return (
    <div className="space-y-8">
      {/* Case Header */}
      <div className="border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Badge status={caseData.status} />
          <span className="text-xs font-mono text-muted">{caseData.caseId}</span>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl text-ink font-normal tracking-tight">
          {caseData.title}
        </h1>
        {caseData.summary && (
          <p className="text-base text-muted mt-2 max-w-2xl leading-relaxed">
            {caseData.summary}
          </p>
        )}
      </div>

      {/* Main Grid: On mobile, actions/summary first, on desktop main timeline left & sticky side column right */}
      <div className="flex flex-col-reverse lg:grid lg:grid-cols-12 gap-8 items-start">
        {/* Main Column: Timeline (lg:col-span-8) */}
        <section className="w-full lg:col-span-8 space-y-6" aria-labelledby="timeline-heading">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="timeline-heading" className="font-serif text-2xl text-ink font-normal tracking-tight">
                Timeline of events
              </h2>
              <p className="text-xs text-muted mt-0.5">Chronological log of verified and recalled occurrences.</p>
            </div>

            <Dialog open={openAddEvent} onOpenChange={setOpenAddEvent}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Add event</span>
                </Button>
              </DialogTrigger>

              <DialogContent
                title="Add a timeline event"
                description="Record something that happened. If you are unsure of the exact time, mark it as uncertain."
              >
                <form onSubmit={handleAddEvent} className="space-y-4 mt-4" noValidate>
                  <Textarea
                    id="event-description"
                    label="What happened *"
                    placeholder="e.g. Received an abusive phone call from an unlisted number"
                    rows={3}
                    value={label}
                    onChange={(e) => {
                      setLabel(e.target.value);
                      if (error) setError('');
                    }}
                    error={error}
                    autoFocus
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id="event-date"
                      type="date"
                      label="Date (optional)"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                    <Input
                      id="event-time"
                      type="time"
                      label="Time (optional)"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      disabled={!date}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                      Time certainty
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                        <input
                          type="radio"
                          name="confidence"
                          value="confirmed"
                          checked={confidence === 'confirmed'}
                          onChange={() => setConfidence('confirmed')}
                          className="accent-accent"
                        />
                        <span>Confident / verified</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                        <input
                          type="radio"
                          name="confidence"
                          value="uncertain"
                          checked={confidence === 'uncertain'}
                          onChange={() => setConfidence('uncertain')}
                          className="accent-accent"
                        />
                        <span>Approximate date</span>
                      </label>
                    </div>
                  </div>

                  {evidence.length > 0 && (
                    <div>
                      <label htmlFor="event-evidence" className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                        Link evidence file (optional)
                      </label>
                      <select
                        id="event-evidence"
                        value={relatedEvidenceId}
                        onChange={(e) => setRelatedEvidenceId(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-surface text-ink border border-border rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <option value="">No linked file</option>
                        {evidence.map((ev) => (
                          <option key={ev.evidenceId} value={ev.evidenceId}>
                            {ev.fileName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                    <Button variant="ghost" onClick={() => setOpenAddEvent(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Add to timeline</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Timeline List */}
          {sortedTimeline.length === 0 ? (
            <EmptyState
              title="No events in this timeline yet"
              description="Add the first logged event or incident to establish the sequence of events."
              actionLabel="Add event"
              onAction={() => setOpenAddEvent(true)}
            />
          ) : (
            <div className="relative border-l border-border pl-6 ml-3 space-y-8">
              {sortedTimeline.map((item, index) => {
                const linkedFile = evidence.find((e) => e.evidenceId === item.relatedEvidenceId);
                return (
                  <div key={item.eventId || index} className="relative group">
                    {/* Timeline bullet dot */}
                    <div className="absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-paper" />

                    <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{formatDateTime(item.occurredAt)}</span>
                        </div>
                        {item.timeConfidence === 'uncertain' && (
                          <Badge status="uncertain" />
                        )}
                      </div>

                      <p className="text-sm sm:text-base text-ink font-normal leading-relaxed">
                        {item.label}
                      </p>

                      {linkedFile && (
                        <div className="pt-2 border-t border-border/60">
                          <Link
                            to={`/case/${caseId}/evidence`}
                            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline font-mono"
                          >
                            <Paperclip className="w-3 h-3" aria-hidden="true" />
                            <span>Linked file: {linkedFile.fileName}</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Side Column: Sticky Summary & Actions (lg:col-span-4) */}
        <aside className="w-full lg:col-span-4 lg:sticky lg:top-20 space-y-6" aria-label="Case Summary & Quick Actions">
          <Card className="space-y-5">
            <h3 className="font-serif text-lg text-ink font-normal border-b border-border pb-3">
              Case summary
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted">Status</span>
                <Badge status={caseData.status} />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted">Started</span>
                <span className="text-ink font-mono text-xs">{formatDate(caseData.createdAt)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted">Preserved files</span>
                <span className="text-ink font-mono text-xs font-semibold">{evidence.length}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted">Timeline events</span>
                <span className="text-ink font-mono text-xs font-semibold">{timeline.length}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border space-y-2.5">
              <Link to={`/case/${caseId}/evidence`} className="block">
                <Button variant="secondary" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-muted" aria-hidden="true" />
                    <span>Evidence workspace</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted" aria-hidden="true" />
                </Button>
              </Link>

              <Link to={`/case/${caseId}/dossier`} className="block">
                <Button variant="secondary" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted" aria-hidden="true" />
                    <span>Generate dossier</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </Card>

          <div className="p-4 rounded-lg border border-border bg-[#F7F5F0] text-xs text-muted space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              <ShieldAlert className="w-4 h-4 text-accent" aria-hidden="true" />
              <span>Preservation reminder</span>
            </div>
            <p className="leading-relaxed">
              Always add original, uncompressed files directly. Modifying or re-saving an image changes its SHA-256 fingerprint.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
