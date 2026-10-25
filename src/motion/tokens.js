// VeraTrace motion tokens.
//
// One place for every duration, curve and distance in the app. Entrances are
// generous enough to read on a recording; nothing overshoots, nothing loops,
// and nothing stands between a person and the control they are reaching for.

/** Seconds, for the motion library. */
export const DURATION = {
  fast: 0.12, // hover, press, focus
  base: 0.28, // UI state changes
  slow: 0.52, // page and section entrances
  hero: 0.6, // the specimen drift in the hero
};

/** Milliseconds, for CSS and timers. */
export const MS = {
  fast: 120,
  base: 280,
  slow: 520,
  hero: 600,
  /** The hero sequence must finish inside this, start to settle. */
  heroTotal: 1400,
  /** Below this, a process finished too fast to be worth announcing visually. */
  indicatorDelay: 150,
};

export const EASE = {
  /** Entrances. */
  out: [0.22, 1, 0.36, 1],
  /** State changes. */
  inOut: [0.65, 0, 0.35, 1],
};

export const DISTANCE = {
  rise: 24, // entrances — far enough to read on a recording
  shift: 6, // route changes, overlays
  nudge: 4, // error shake
};

export const STAGGER = {
  hero: 0.09,
  list: 0.04,
  /** Only the first few items stagger; after that everything lands together. */
  maxItems: 8,
  /**
   * Hero steps stop accumulating here, so a long headline cannot push the
   * sequence past MS.heroTotal: 6 × 90ms + 520ms ≈ 1060ms.
   */
  heroMaxSteps: 6,
};

/** Delay for hero step `index`, capped so the sequence always lands in time. */
export function heroDelay(index) {
  return Math.min(index, STAGGER.heroMaxSteps) * STAGGER.hero;
}

/** Entrance transition. */
export const enter = (delay = 0, duration = DURATION.slow) => ({
  duration,
  delay,
  ease: EASE.out,
});

/** State-change transition. */
export const change = (duration = DURATION.base) => ({
  duration,
  ease: EASE.inOut,
});

/**
 * Rise-and-fade entrance.
 * Under reduced motion this collapses to a short opacity fade with no
 * transform and no stagger.
 */
export function riseIn(reduced, { delay = 0, distance = DISTANCE.rise, duration = DURATION.slow } = {}) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.1, ease: 'linear' },
    };
  }
  return {
    initial: { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: enter(delay, duration),
  };
}

/** Stagger delay for list item `index`, capped so long lists do not crawl. */
export function stagger(index, step = STAGGER.list) {
  return Math.min(index, STAGGER.maxItems - 1) * step;
}
