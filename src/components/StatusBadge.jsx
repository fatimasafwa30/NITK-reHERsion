import styles from './StatusBadge.module.css';

const LABELS = {
  // Evidence verification states
  UNVERIFIED: 'Unverified',
  MATCH: 'Match',
  MISMATCH: 'Mismatch',
  ERROR: 'Error',
  // Case states
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  CLOSED: 'Closed',
};

/** @param {{status: string}} props */
export default function StatusBadge({ status }) {
  const tone = styles[status] || styles.UNVERIFIED;
  return <span className={`${styles.badge} ${tone}`}>{LABELS[status] || status}</span>;
}
