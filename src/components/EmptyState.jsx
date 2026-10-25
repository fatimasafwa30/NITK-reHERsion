import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

/** @param {{title: string, description?: string, action?: React.ReactNode, icon?: React.ReactNode, compact?: boolean}} props */
export default function EmptyState({ title, description, action, icon, compact = false }) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ''}`}>
      <span className={styles.icon} aria-hidden="true">
        {icon || <Inbox strokeWidth={1.6} />}
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
