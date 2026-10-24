import { ShieldCheck, Clock3, AlertTriangle, CircleAlert, FolderOpen, FolderClock, FolderCheck } from 'lucide-react';
import styles from './StatusChip.module.css';

/*
  Every status carries an icon AND a word, so the meaning survives for
  colour-blind users, greyscale printing, and low-quality screens.
*/
const CONFIG = {
  // Evidence verification states
  MATCH:      { label: 'Verified',   tone: 'ok',      Icon: ShieldCheck },
  UNVERIFIED: { label: 'Unverified', tone: 'neutral', Icon: Clock3 },
  MISMATCH:   { label: 'Changed',    tone: 'alert',   Icon: AlertTriangle },
  ERROR:      { label: 'Check failed', tone: 'alert', Icon: CircleAlert },
  // Case states
  OPEN:        { label: 'Open',        tone: 'neutral', Icon: FolderOpen },
  IN_PROGRESS: { label: 'In progress', tone: 'pending', Icon: FolderClock },
  CLOSED:      { label: 'Closed',      tone: 'ok',      Icon: FolderCheck },
};

/** @param {{status: string, size?: 'sm'|'md'}} props */
export default function StatusChip({ status, size = 'md' }) {
  const config = CONFIG[status] || { label: status, tone: 'neutral', Icon: Clock3 };
  const { label, tone, Icon } = config;

  return (
    <span className={`${styles.chip} ${styles[tone]} ${styles[size]}`}>
      <Icon className={styles.icon} aria-hidden="true" strokeWidth={2.2} />
      {label}
    </span>
  );
}
