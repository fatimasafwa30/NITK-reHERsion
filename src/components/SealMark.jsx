import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/cn';
import { EASE } from '../motion/tokens';

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

  // `sage` is the verifier's match status only; the seal is violet everywhere else.
  const ring =
    tone === 'alert'
      ? 'var(--color-alert)'
      : tone === 'sage'
        ? 'var(--color-sage)'
        : 'var(--color-violet-deep)';
  const inner =
    tone === 'alert'
      ? 'var(--color-alert)'
      : tone === 'sage'
        ? 'var(--color-sage)'
        : 'var(--color-violet)';

  const draw = (delay) =>
    animate
      ? {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          // Draws once, over 600ms, via stroke-dash animation.
          transition: { duration: 0.6, delay, ease: EASE.out },
        }
      : {};

  const Svg = animate ? motion.svg : 'svg';
  const scaleIn = animate
    ? {
        initial: { scale: 0.92, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: { duration: 0.6, ease: EASE.out },
      }
    : {};

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      className={cn('shrink-0', className)}
      {...scaleIn}
    >
      {/* One soft ring, once, after the seal has drawn. Opacity only, and it
          leaves nothing behind. */}
      {animate ? (
        <circle
          cx="12"
          cy="12"
          r="11"
          stroke={ring}
          strokeWidth="1.5"
          className="anim-glow"
          style={{ opacity: 0 }}
        />
      ) : null}
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
        {...draw(0.08)}
      />
      {tone === 'alert' ? (
        <motion.path
          d="M12 8.6v4.1M12 15.4h.01"
          stroke={ring}
          strokeWidth="1.6"
          strokeLinecap="round"
          {...draw(0.16)}
        />
      ) : (
        <motion.path
          d="M9.1 12.2 11.2 14.4 15 10.2"
          stroke={ring}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...draw(0.16)}
        />
      )}
    </Svg>
  );
}
