import styles from './Logo.module.css';

/** @param {{compact?: boolean, inverted?: boolean}} props */
export default function Logo({ compact = false, inverted = false }) {
  return (
    <span className={`${styles.logo} ${inverted ? styles.inverted : ''}`}>
      <span className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.5 4.5 5.8v5.4c0 4.5 3.1 8.7 7.5 10.3 4.4-1.6 7.5-5.8 7.5-10.3V5.8L12 2.5Z" />
          <path d="m8.8 11.8 2.3 2.4 4.1-4.5" />
        </svg>
      </span>
      {!compact && <span className={styles.word}>VeraTrace</span>}
    </span>
  );
}
