import { useParams } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { getCaseById, mockEvidenceByCase } from '../data/mockData';
import styles from './EvidenceWorkspace.module.css';

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function EvidenceWorkspace() {
  const { caseId } = useParams();
  const caseRecord = getCaseById(caseId);
  const evidence = mockEvidenceByCase[caseId] || [];

  if (!caseRecord) {
    return (
      <div className="container">
        <div className={styles.topPad}>
          <EmptyState
            title="Case not found"
            action={<Button to="/dashboard">Back to my cases</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className={styles.topPad}>
        <Button to={`/case/${caseId}`} variant="ghost" className={styles.backLink}>
          ← Back to {caseRecord.title}
        </Button>

        <div className={styles.header}>
          <h1 className={styles.title}>Evidence workspace</h1>
          {/* Upload & hashing are owned by Person 2's module; this button is a placeholder
              so the layout is ready for that module to be dropped in. */}
          <Button title="Hooked up once the evidence module is integrated">Add evidence</Button>
        </div>
        <p className={styles.disclaimer}>
          A matching hash shows a file hasn't changed since it was added here — it doesn't on its own prove
          who created it or when the event happened.
        </p>

        {evidence.length === 0 ? (
          <EmptyState title="No evidence added yet" description="Items you add will show up here with their recorded details." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Recorded</th>
                  <th>SHA-256</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((item) => (
                  <tr key={item.evidenceId}>
                    <td className={styles.fileName}>{item.fileName}</td>
                    <td>{item.mimeType}</td>
                    <td>{formatBytes(item.sizeBytes)}</td>
                    <td>{new Date(item.recordedAt).toLocaleString()}</td>
                    <td className={styles.hash} title={item.sha256}>{item.sha256.slice(0, 16)}…</td>
                    <td><StatusBadge status={item.verificationStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
