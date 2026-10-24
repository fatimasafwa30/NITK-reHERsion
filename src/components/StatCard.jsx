import styles from './StatCard.module.css';

/**
 * Deliberately NOT the same shape as a case card: flat sand surface, an
 * icon badge, and a large display numeral so the stat row reads as a
 * summary band rather than another list of clickable cards.
 * @param {{label: string, value: string|number, hint?: string, icon?: React.ReactNode, tone?: 'default'|'accent'}} props
 */
export default function StatCard({ label, value, hint, icon, tone = 'default' }) {
  return (
    <div className={`${styles.stat} ${styles[tone]}`}>
      {icon && <span className={styles.iconBadge} aria-hidden="true">{icon}</span>}
      <div className={styles.body}>
        <p className={styles.label}>{label}</p>
        <p className={styles.value}>{value}</p>
        {hint && <p className={styles.hint}>{hint}</p>}
      </div>
    </div>
  );
}
