import Card from './Card';
import styles from './StatCard.module.css';

/** @param {{label: string, value: string|number, hint?: string}} props */
export default function StatCard({ label, value, hint }) {
  return (
    <Card className={styles.statCard}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
    </Card>
  );
}
