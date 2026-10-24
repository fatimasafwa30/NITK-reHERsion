import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, FolderOpen, FileText, CircleHelp, ArrowRight, CalendarPlus, FileDown } from 'lucide-react';
import Button from '../components/Button';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import AddEventDialog from '../components/AddEventDialog';
import { useCase } from '../hooks/useCase';
import { useEvidenceForCase } from '../hooks/useEvidenceForCase';
import { useTimelineForCase } from '../hooks/useTimelineForCase';
import styles from './CaseOverview.module.css';

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * @param {{
 *   onAddEvidence?: () => void,
 *   onAddTimelineEvent?: (event: object) => void,
 * }} props
 * Person 2: pass `onAddEvidence` to open your upload flow, and
 * `onAddTimelineEvent` to persist events the user adds here. Without them
 * the page keeps its current local-only behaviour.
 */
export default function CaseOverview({ onAddEvidence, onAddTimelineEvent }) {
  const { caseId } = useParams();
  const { data: caseRecord } = useCase(caseId);
  const { data: evidence } = useEvidenceForCase(caseId);
  const { data: timelineFromStore } = useTimelineForCase(caseId);

  const [dialogOpen, setDialogOpen] = useState(false);
  // Events added in this session only — nothing is persisted yet.
  const [localEvents, setLocalEvents] = useState([]);

  if (!caseRecord) {
    return (
      <EmptyState
        icon={<FolderOpen strokeWidth={1.6} />}
        title="Case not found"
        description="This case may have been removed, or the link is incorrect."
        action={<Button to="/dashboard" iconLeft={<ArrowLeft />}>Back to my cases</Button>}
      />
    );
  }

  const timeline = [...timelineFromStore, ...localEvents];
  const verifiedCount = evidence.filter((e) => e.verificationStatus === 'MATCH').length;

  function handleAddEvent(event) {
    setLocalEvents((prev) => [...prev, event]);
    onAddTimelineEvent?.(event);
  }

  return (
    <div className={styles.wrap}>
      <Link to="/dashboard" className={styles.back}>
        <ArrowLeft aria-hidden="true" strokeWidth={2} />
        Back to my cases
      </Link>

      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{caseRecord.title}</h1>
            <StatusChip status={caseRecord.status} />
          </div>
          <p className={styles.summary}>{caseRecord.summary}</p>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={styles.timelineCol} aria-labelledby="timeline-heading">
          <div className={styles.sectionHead}>
            <h2 id="timeline-heading" className={styles.sectionTitle}>Timeline</h2>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<CalendarPlus />}
              onClick={() => setDialogOpen(true)}
            >
              Add event
            </Button>
          </div>

          {timeline.length === 0 ? (
            <EmptyState compact title="No events yet" description="Events you add will appear here in order." />
          ) : (
            <ol className={styles.timeline}>
              {timeline.map((event) => (
                <li key={event.eventId} className={styles.event}>
                  <span className={styles.dot} aria-hidden="true" />
                  <div className={styles.eventBody}>
                    <p className={styles.eventWhen}>
                      {event.occurredAt ? formatWhen(event.occurredAt) : 'Date not known'}
                      {event.timeConfidence === 'uncertain' && (
                        <span className={styles.uncertain}>
                          <CircleHelp aria-hidden="true" strokeWidth={2.2} />
                          Uncertain
                        </span>
                      )}
                    </p>
                    <p className={styles.eventLabel}>{event.label}</p>
                    {event.relatedEvidenceId && (
                      <p className={styles.eventLink}>
                        <FileText aria-hidden="true" strokeWidth={2} />
                        Linked to evidence
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className={styles.side}>
          <div className={styles.sideInner}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Evidence</h2>
              <p className={styles.panelStat}>
                <strong>{evidence.length}</strong> item{evidence.length === 1 ? '' : 's'}
                {evidence.length > 0 && <> · {verifiedCount} verified</>}
              </p>

              {evidence.length === 0 ? (
                <p className={styles.panelEmpty}>Nothing added yet.</p>
              ) : (
                <ul className={styles.evidenceList}>
                  {evidence.slice(0, 4).map((item) => (
                    <li key={item.evidenceId} className={styles.evidenceItem}>
                      <FileText className={styles.evidenceIcon} aria-hidden="true" strokeWidth={2} />
                      <span className={styles.evidenceName}>{item.fileName}</span>
                      <StatusChip status={item.verificationStatus} size="sm" />
                    </li>
                  ))}
                </ul>
              )}

              <Button to={`/case/${caseId}/evidence`} full iconRight={<ArrowRight />} className={styles.panelCta}>
                Open evidence workspace
              </Button>
            </div>

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Actions</h2>
              <div className={styles.actionStack}>
                <Button variant="ghost" full iconLeft={<Plus />} onClick={onAddEvidence}>
                  Add evidence
                </Button>
                <Button to={`/case/${caseId}/dossier`} variant="ghost" full iconLeft={<FileDown />}>
                  Export dossier
                </Button>
              </div>
              <p className={styles.panelNote}>
                Dossier download arrives with the reporting module.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <AddEventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleAddEvent}
        evidenceOptions={evidence}
      />
    </div>
  );
}
