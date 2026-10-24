import { useEffect, useCallback } from 'react';
import styles from './QuickExit.module.css';

const SAFE_DESTINATION = 'https://www.google.com';

/**
 * Leaves VeraTrace instantly and replaces the current browser history entry
 * so the back button doesn't return here. Available as a persistent button
 * in the nav and bound to the Escape key, since someone needing to leave
 * quickly may not have time to find and click a button.
 */
export default function QuickExit() {
  const exit = useCallback(() => {
    window.location.replace(SAFE_DESTINATION);
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') exit();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exit]);

  return (
    <button type="button" className={styles.quickExit} onClick={exit} aria-label="Quick exit this site (press Escape anytime)">
      Quick exit
    </button>
  );
}
