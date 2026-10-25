import { motion, useReducedMotion } from 'motion/react';
import { DISTANCE, EASE } from './tokens';

/**
 * Route entrance.
 *
 * Enter-only and deliberately so: no exit animation means navigation is never
 * delayed, two pages are never stacked, and there is no blank frame between
 * them. The old tree unmounts the moment the router says so.
 */
export function PageTransition({ routeKey, fadeOnly = false, children }) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <motion.div
        key={routeKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1, ease: 'linear' }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      key={routeKey}
      initial={{ opacity: 0, y: fadeOnly ? 0 : DISTANCE.shift }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}
