import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FolderOpen, FileDown, FileArchive, ShieldCheck, Info, CircleHelp } from 'lucide-react';
import Button from '../components/Button';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import { useCase } from '../hooks/useCase';
import { useEvidenceForCase } from '../hooks/useEvidenceForCase';
import { useTimelineForCase } from '../hooks/useTimelineForCase';
import styles from './Dossier.module.css';

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Dossier() {
  const { caseId } = useParams();
  const { data: caseRecord } = useCase(caseId);
  const { data: evidence } = useEvidenceForCase(caseId);
  const { data: timeline } = useTimelineForCase(caseId);

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

  const verified = evidence.filter((e) => e.verificationStatus === 'MATCH').length;
  const changed = evidence.filter((e) => e.verificationStatus === 'MISMATCH').length;
  const unverified = evidence.filter((e) => e.verificationStatus === 'UNVERIFIED').length;

  return (
    <div className={styles.wrap}>
      <Link to={`/case/${caseId}`} className={styles.back}>
        <ArrowLeft aria-hidden="true" strokeWidth={2} />
        Back to case
      </Link>

      <header className={styles.header}>
        <div className={styles.headerMain}>
          <p className="eyebrow">Case dossier</p>
          <h1 className={styles.title}>{caseRecord.title}</h1>
          <p className={styles.meta}>
            Opened {formatDate(caseRecord.createdAt)} · Last updated {formatDate(caseRecord.updatedAt)}
          </p>
        </div>
        <StatusChip status={caseRecord.status} />
      </header>

      {/* Export actions — generation belongs to the reporting module. */}
      <section className={styles.exportBar} aria-labelledby="export-heading">
        <div>
          <h2 id="export-heading" className={styles.exportTitle}>Download this dossier</h2>
          <p className={styles.exportNote}>
            <Info aria-hidden="true" strokeWidth={2} />
            Export is coming from the backend — these buttons are not active yet.
          </p>
        </div>
        <div className={styles.exportActions}>
          <Button variant="ghost" iconLeft={<FileDown />} disabled aria-describedby="export-heading">
            Download PDF
          </Button>
          <Button variant="ghost" iconLeft={<FileArchive />} disabled aria-describedby="export-heading">
            Download evidence ZIP
          </Button>
        </div>
      </section>

      {/* ---- Summary ---- */}
      <section className={styles.section} aria-labelledby="summary-heading">
        <h2 id="summary-heading" className={styles.sectionTitle}>Summary</h2>
        <p className={styles.summaryText}>{caseRecord.summary}</p>
      </section>

      {/* ---- Timeline ---- */}
      <section className={styles.section} aria-labelledby="dossier-timeline-heading">
        <h2 id="dossier-timeline-heading" className={styles.sectionTitle}>Timeline of events</h2>
        {timeline.length === 0 ? (
          <EmptyState compact title="No events recorded" />
        ) : (
          <ol className={styles.timeline}>
            {timeline.map((event) => (
              <li key={event.eventId} className={styles.timelineRow}>
                <span className={styles.timelineWhen}>
                  {event.occurredAt ? formatWhen(event.occurredAt) : 'Date not known'}
                  {event.timeConfidence === 'uncertain' && (
                    <span className={styles.uncertain}>
                      <CircleHelp aria-hidden="true" strokeWidth={2.2} />
                      Uncertain
                    </span>
                  )}
                </span>
                <span className={styles.timelineLabel}>{event.label}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---- Evidence index ---- */}
      <section className={styles.section} aria-labelledby="index-heading">
        <h2 id="index-heading" className={styles.sectionTitle}>Evidence index</h2>
        {evidence.length === 0 ? (
          <EmptyState compact title="No evidence recorded" />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">File</th>
                    <th scope="col">Recorded</th>
                    <th scope="col">SHA-256</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((item, i) => (
                    <tr key={item.evidenceId}>
                      <td className={styles.num}>{i + 1}</td>
                      <td className={styles.fileName}>{item.fileName}</td>
                      <td className={styles.muted}>{formatWhen(item.recordedAt)}</td>
                      <td><code className={styles.hash}>{item.sha256}</code></td>
                      <td><StatusChip status={item.verificationStatus} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className={styles.cards}>
              {evidence.map((item, i) => (
                <li key={item.evidenceId} className={styles.card}>
                  <p className={styles.cardTop}>
                    <span className={styles.num}>{i + 1}</span>
                    <span className={styles.fileName}>{item.fileName}</span>
                  </p>
                  <p className={styles.cardMeta}>{formatWhen(item.recordedAt)}</p>
                  <code className={styles.hash}>{item.sha256}</code>
                  <StatusChip status={item.verificationStatus} size="sm" />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ---- Integrity ---- */}
      <section className={styles.section} aria-labelledby="integrity-heading">
        <h2 id="integrity-heading" className={styles.sectionTitle}>Integrity</h2>

        <div className={styles.integrityGrid}>
          <div className={styles.integrityStat}>
            <span className={styles.integrityValue}>{verified}</span>
            <span className={styles.integrityLabel}>Verified</span>
          </div>
          <div className={styles.integrityStat}>
            <span className={styles.integrityValue}>{unverified}</span>
            <span className={styles.integrityLabel}>Not yet checked</span>
          </div>
          <div className={styles.integrityStat}>
            <span className={styles.integrityValue}>{changed}</span>
            <span className={styles.integrityLabel}>Changed since added</span>
          </div>
        </div>

        <div className={styles.integrityNote}>
          <ShieldCheck aria-hidden="true" strokeWidth={2} />
          <p>
            Each file is recorded with a SHA-256 hash taken from its bytes when it was added.
            A <strong>Verified</strong> result means the file still matches that hash — it does not
            prove who created the file, when the incident happened, or that the record will be
            accepted as legal proof. A <strong>Changed</strong> result means the bytes differ from
            what was recorded, not necessarily why.
          </p>
        </div>
      </section>
    </div>
  );
}
