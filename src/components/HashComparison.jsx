import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import { differingBlocks } from '../lib/format';
import { DISTANCE, DURATION, EASE } from '../motion/tokens';
import { HashDisplay } from './HashDisplay';
import { SealMark } from './SealMark';

/**
 * The result of comparing a file against a recorded hash.
 *
 * A match is a calm confirmation with a seal; a mismatch is stated plainly and
 * without alarm — it is information about bytes, not an accusation. Both
 * digests are shown with the differing blocks marked, and that marking is
 * static: hashes never animate, anywhere.
 */
export function HashComparison({
  expected,
  actual,
  expectedLabel = 'Recorded hash',
  actualLabel = 'This file',
  fileName,
  headingRef,
  headingId,
  drawSeal = true,
}) {
  const match = Boolean(expected && actual && expected === actual);
  const differing = useMemo(() => (match ? new Set() : differingBlocks(expected, actual)), [expected, actual, match]);
  const reduced = useReducedMotion();
  const autoId = useId();
  const detailId = `${autoId}-detail`;
  const [open, setOpen] = useState(true);

  // The panel rises into place while its backdrop warms from plain paper to
  // the status tint — a colour change, so it reads even at a glance.
  const tint = match ? 'var(--color-sage-wash)' : 'var(--color-alert-wash)';
  const entrance = reduced
    ? {
        initial: { opacity: 0, backgroundColor: tint },
        animate: { opacity: 1, backgroundColor: tint },
        transition: { duration: 0.1 },
      }
    : {
        initial: { opacity: 0, y: DISTANCE.rise, backgroundColor: 'var(--color-paper)' },
        animate: { opacity: 1, y: 0, backgroundColor: tint },
        transition: { duration: 0.4, ease: EASE.out },
      };

  return (
    <motion.div
      {...entrance}
      className={cn('overflow-hidden rounded-lg border', match ? 'border-sage/35' : 'border-alert/35')}
      data-print="surface"
    >
      <div
        className="flex items-start gap-3 border-b px-5 py-4 sm:px-6"
        style={{
          borderColor: match
            ? 'color-mix(in srgb, var(--color-sage) 25%, transparent)'
            : 'color-mix(in srgb, var(--color-alert) 25%, transparent)',
        }}
      >
        {match ? (
          <SealMark size={26} drawIn={drawSeal} tone="sage" className="mt-0.5" />
        ) : (
          <TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-6 shrink-0 text-alert" />
        )}
        <div className="min-w-0">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className={cn('display-md', match ? 'text-sage' : 'text-alert')}
          >
            {match ? 'Match' : 'Does not match'}
          </h3>
          {fileName ? (
            <p className="mono mt-1.5 break-words text-[0.6875rem] text-muted">{fileName}</p>
          ) : null}
          <p className="mt-2 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
            {match ? (
              <>
                This file is byte-for-byte identical to the one recorded, so it has not changed since it was added.
                That is all a matching hash shows — it does not prove who created the file, or that it will be
                accepted as legal proof.
              </>
            ) : (
              <>
                This file is not the same bytes as the one recorded. That can mean the file was edited, but it very
                often means something ordinary: a re-saved screenshot, a copy sent through a messaging app, or a
                different file with a similar name. It does not by itself mean anything was tampered with.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="px-5 py-4 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={detailId}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-[0.8125rem] font-medium text-plum transition-colors duration-[var(--dur-fast)] hover:bg-paper/70"
        >
          <ChevronRight
            aria-hidden="true"
            strokeWidth={1.5}
            className={cn(
              'size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-state)]',
              open && 'rotate-90',
            )}
          />
          {open ? 'Hide the full comparison' : 'Show the full comparison'}
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={detailId}
              key="detail"
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduced ? 0.1 : DURATION.base, ease: EASE.inOut }}
              className="overflow-hidden"
            >
              <div className="space-y-5 pt-4">
                <div>
                  <p className="eyebrow mb-2 text-[0.625rem]">{expectedLabel}</p>
                  <HashDisplay hash={expected} highlight={differing} label={expectedLabel} />
                </div>
                <div>
                  <p className="eyebrow mb-2 text-[0.625rem]">{actualLabel}</p>
                  <HashDisplay hash={actual} highlight={differing} label={actualLabel} />
                </div>
                {!match ? (
                  <p className="mono text-[0.6875rem] leading-relaxed text-alert">
                    {differing.size} of 8 blocks differ · marked above
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
