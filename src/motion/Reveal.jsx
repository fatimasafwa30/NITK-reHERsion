import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '../lib/cn';

/**
 * Read the preference at the moment it matters rather than caching it, so a
 * change of setting is honoured by the next reveal without a reload.
 */
function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scroll reveal.
 *
 * Deliberately CSS-driven rather than library-driven, so the failure mode is
 * correct: the markup renders at its final state, and JavaScript only ever
 * *removes* visibility temporarily. Without JS, under `prefers-reduced-motion`,
 * and in print, the content is simply there.
 *
 * Fires once and then stops observing.
 */
export function Reveal({ children, className, as: Tag = 'div', delay = 0, ...props }) {
  const ref = useRef(null);

  // Hide before first paint, never after, so nothing visibly flashes out.
  useLayoutEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    ref.current.dataset.reveal = 'pending';
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      node.dataset.reveal = 'shown';
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          node.style.transitionDelay = delay ? `${delay}ms` : '';
          node.dataset.reveal = 'shown';
          observer.unobserve(entry.target);
        }
      },
      // A low threshold plus a small bottom inset: a section taller than a
      // short phone screen still triggers.
      { threshold: 0.08, rootMargin: '0px 0px -5% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Tag ref={ref} className={cn('vt-reveal', className)} {...props}>
      {children}
    </Tag>
  );
}
