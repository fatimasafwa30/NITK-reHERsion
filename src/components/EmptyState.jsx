import styles from './EmptyState.module.css';

/** @param {{title: string, description?: string, action?: React.ReactNode}} props */
export default function EmptyState({ title, description, action }) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action}
    </div>
  );
}
