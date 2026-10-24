import { useEffect, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import styles from './QuickExit.module.css';

const SAFE_DESTINATION = 'https://www.google.com';

/**
 * Leaves VeraTrace instantly and replaces the current history entry so the
 * back button doesn't return here. Bound to Escape as well as the button,
 * because someone needing to leave fast may not have time to aim at a target.
 *
 * Visual weight is deliberately low — it must be findable at a glance on
 * every screen without out-shouting the page's primary action.
 */
export default function QuickExit({ compact = false }) {
  const exit = useCallback(() => {
    window.location.replace(SAFE_DESTINATION);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') exit();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exit]);

  return (
    <button
      type="button"
      onClick={exit}
      className={`${styles.quickExit} ${compact ? styles.compact : ''}`}
      aria-label="Quick exit this site. You can also press Escape at any time."
      title="Press Escape at any time"
    >
      <LogOut className={styles.icon} aria-hidden="true" strokeWidth={2.2} />
      <span className={styles.text}>Quick exit</span>
    </button>
  );
}
