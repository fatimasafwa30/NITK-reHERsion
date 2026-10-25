import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/cn';

/**
 * The verification seal.
 *
 * A custom mark rather than a stock icon: an outer ring (the record), a dashed
 * inner ring (the hash), and a check (the comparison). It draws itself in once
 * when a file is sealed or re-verified, and is static at every other time.
 */
export function SealMark({ size = 22, drawIn = false, tone = 'sealed', className, title }) {
  const reduced = useReducedMotion();
  const animate = drawIn && !reduced;

  const ring = tone === 'alert' ? 'var(--color-alert)' : 'var(--color-violet-deep)';
  const inner = tone === 'alert' ? 'var(--color-alert)' : 'var(--color-violet)';

  const draw = (delay) =>
    animate
      ? {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: 0.45, delay, ease: [0.22, 0.61, 0.36, 1] },
        }
      : {};

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      className={cn('shrink-0', className)}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        stroke={ring}
        strokeWidth="1.25"
        {...draw(0)}
      />
      <motion.circle
        cx="12"
        cy="12"
        r="6.75"
        stroke={inner}
        strokeWidth="0.85"
        strokeDasharray="1.4 2.1"
        opacity="0.85"
        {...draw(0.1)}
      />
      {tone === 'alert' ? (
        <motion.path
          d="M12 8.6v4.1M12 15.4h.01"
          stroke={ring}
          strokeWidth="1.6"
          strokeLinecap="round"
          {...draw(0.18)}
        />
      ) : (
        <motion.path
          d="M9.1 12.2 11.2 14.4 15 10.2"
          stroke={ring}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...draw(0.18)}
        />
      )}
    </svg>
  );
}
