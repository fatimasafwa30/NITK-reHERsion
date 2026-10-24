import { useParams } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { getCaseById, mockEvidenceByCase, mockTimelineByCase } from '../data/mockData';
import styles from './CaseOverview.module.css';

export default function CaseOverview() {
  const { caseId } = useParams();
  const caseRecord = getCaseById(caseId);
  const evidence = mockEvidenceByCase[caseId] || [];
  const timeline = mockTimelineByCase[caseId] || [];

  if (!caseRecord) {
    return (
      <div className="container">
        <div className={styles.topPad}>
          <EmptyState
            title="Case not found"
            description="This case may have been removed, or the link is incorrect."
            action={<Button to="/dashboard">Back to my cases</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className={styles.topPad}>
        <Button to="/dashboard" variant="ghost" className={styles.backLink}>← Back to my cases</Button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{caseRecord.title}</h1>
            <p className={styles.summary}>{caseRecord.summary}</p>
          </div>
          <StatusBadge status={caseRecord.status} />
        </div>

        <div className={styles.grid}>
          <Card>
            <div className={styles.sectionHeader}>
              <h2>Timeline</h2>
            </div>
            {timeline.length === 0 ? (
              <EmptyState title="No events yet" description="Events you add will appear here in order." />
            ) : (
              <ol className={styles.timeline}>
                {timeline.map((event) => (
                  <li key={event.eventId} className={styles.timelineItem}>
                    <div className={styles.timelineDate}>
                      {event.occurredAt
                        ? new Date(event.occurredAt).toLocaleString()
                        : 'Date uncertain'}
                      {event.timeConfidence === 'uncertain' && (
                        <span className={styles.uncertainTag}>uncertain</span>
                      )}
                    </div>
                    <p className={styles.timelineLabel}>{event.label}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <div className={styles.sectionHeader}>
              <h2>Evidence</h2>
              <Button to={`/case/${caseId}/evidence`} variant="secondary">Open evidence workspace</Button>
            </div>
            {evidence.length === 0 ? (
              <EmptyState title="No evidence added yet" />
            ) : (
              <ul className={styles.evidenceList}>
                {evidence.map((item) => (
                  <li key={item.evidenceId} className={styles.evidenceRow}>
                    <span className={styles.evidenceName}>{item.fileName}</span>
                    <StatusBadge status={item.verificationStatus} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
