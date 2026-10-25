import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import { differingBlocks } from '../lib/format';
import { HashDisplay } from './HashDisplay';
import { SealMark } from './SealMark';

/**
 * The result of comparing a file against a recorded hash.
 *
 * A match is a calm confirmation, with a seal. A mismatch is stated plainly
 * and without alarm: it is information about bytes, not an accusation, and the
 * copy says so. Both digests are shown, with the differing blocks marked.
 */
export function HashComparison({ expected, actual, expectedLabel = 'Recorded hash', actualLabel = 'This file', drawSeal = true }) {
  const match = Boolean(expected && actual && expected === actual);
  const differing = useMemo(() => (match ? new Set() : differingBlocks(expected, actual)), [expected, actual, match]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        match ? 'border-violet-deep/35 bg-wash/50' : 'border-alert/35 bg-alert-wash/60',
      )}
      data-print="surface"
    >
      <div className="flex items-start gap-3 border-b px-5 py-4 sm:px-6"
        style={{ borderColor: match ? 'color-mix(in srgb, var(--color-violet-deep) 25%, transparent)' : 'color-mix(in srgb, var(--color-alert) 25%, transparent)' }}
      >
        {match ? (
          <SealMark size={26} drawIn={drawSeal} className="mt-0.5" />
        ) : (
          <TriangleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-6 shrink-0 text-alert" />
        )}
        <div className="min-w-0">
          <h3 className={cn('display-md', match ? 'text-plum' : 'text-alert')}>
            {match ? 'Unchanged' : 'The hashes do not match'}
          </h3>
          <p className="mt-2 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
            {match ? (
              <>
                This file is byte-for-byte identical to the one recorded. That shows it has not changed since it was
                added — it does not prove who created it, or that it will be accepted as legal proof.
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

      <div className="space-y-5 px-5 py-5 sm:px-6">
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
    </div>
  );
}
