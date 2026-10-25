import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FileUp, TriangleAlert, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { MAX_FILE_BYTES, hashingAvailable, sha256File } from '../lib/hash';
import { formatBytes, hashBlocks } from '../lib/format';
import { DURATION, EASE, MS, stagger } from '../motion/tokens';
import { Button } from './ui/Button';
import { SealMark } from './SealMark';
import { useToast } from '../store/ToastProvider';

const STATUS_COPY = {
  queued: 'Queued',
  hashing: 'Hashing',
  sealed: 'Sealed',
  rejected: 'Not added',
  error: 'Failed',
};

let seq = 0;

/**
 * The dropzone.
 *
 * Hashing happens here, on the device, over the real bytes of the real file.
 * Each file moves through queued → hashing → sealed in full view, because the
 * whole promise of the product is that this step is not a black box.
 */
export function Dropzone({ onSealed, disabled = false, className }) {
  const [queue, setQueue] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const reduced = useReducedMotion();
  const toast = useToast();

  const patch = useCallback((id, changes) => {
    setQueue((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const process = useCallback(
    async (files) => {
      const accepted = [];

      const entries = Array.from(files).map((file) => {
        seq += 1;
        const id = `q_${Date.now().toString(36)}_${seq}`;
        if (file.size > MAX_FILE_BYTES) {
          return {
            id,
            file,
            status: 'rejected',
            progress: 0,
            error: `This file is ${formatBytes(file.size)}, over the 50 MB limit for this demo.`,
          };
        }
        if (!hashingAvailable()) {
          return {
            id,
            file,
            status: 'error',
            progress: 0,
            error: 'This browser cannot compute SHA-256 locally.',
          };
        }
        accepted.push({ id, file });
        return { id, file, status: 'queued', progress: 0 };
      });

      setQueue((list) => [...entries, ...list].slice(0, 12));

      const refused = entries.filter((entry) => entry.status === 'rejected' || entry.status === 'error');
      if (refused.length) {
        toast(refused.length === 1 ? 'One file was not added' : `${refused.length} files were not added`, {
          tone: 'error',
          detail: refused[0].error,
        });
      }

      // Sequential, so progress means something and a big file cannot starve
      // the UI of the others.
      for (const { id, file } of accepted) {
        patch(id, { status: 'hashing', progress: 0, showIndicator: false });

        // Anything that finishes inside 150ms never shows an indicator at all;
        // a bar that appears and vanishes is noise, not feedback.
        const indicatorTimer = setTimeout(
          () => patch(id, { showIndicator: true }),
          MS.indicatorDelay,
        );

        try {
          // eslint-disable-next-line no-await-in-loop
          const sha256 = await sha256File(file, (ratio) => patch(id, { progress: ratio }));
          clearTimeout(indicatorTimer);
          patch(id, { status: 'sealed', progress: 1, sha256, showIndicator: false });

          seq += 1;
          onSealed?.({
            evidenceId: `ev_${Date.now().toString(36)}${seq}`,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            recordedAt: new Date().toISOString(),
            sha256,
            // Nothing has been re-checked yet — saying otherwise would be a lie.
            verificationStatus: 'UNVERIFIED',
          }, file);
        } catch (error) {
          clearTimeout(indicatorTimer);
          patch(id, { status: 'error', showIndicator: false, error: error.message || 'Hashing failed.' });
        }
      }
    },
    [onSealed, patch, toast],
  );

  const onDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    if (event.dataTransfer?.files?.length) process(event.dataTransfer.files);
  };

  const active = queue.find((item) => item.status === 'hashing');

  return (
    <div className={className}>
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          'relative rounded-lg border-2 border-dashed px-6 py-12 text-center transition-[border-color,background-color] duration-200 ease-[var(--ease-out-soft)] sm:px-10 sm:py-16',
          dragging ? 'border-violet-deep bg-wash' : 'border-lilac bg-wash/40 hover:border-violet',
          disabled && 'opacity-60',
        )}
      >
        <SealMark size={34} className="mx-auto" />
        <h2 className="display-md mt-5 text-plum">
          {dragging ? (
            'Release to add'
          ) : (
            <>
              Drop files here to <em className="italic">seal</em> them
            </>
          )}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Each file is hashed with SHA-256 on this device. Nothing is uploaded, and the original file is never
          altered.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="primary" size="md" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <FileUp aria-hidden="true" strokeWidth={1.5} className="size-4" />
            Choose files
          </Button>
          <p className="mono text-[0.6875rem] text-muted">Up to 50 MB per file</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose files to seal"
          onChange={(event) => {
            if (event.target.files?.length) process(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {/* Hashing is announced, not just animated. */}
      <p role="status" aria-live="polite" className="sr-only">
        {active
          ? `Hashing ${active.file.name}, ${Math.round((active.progress || 0) * 100)} percent complete.`
          : queue.length
            ? `${queue.filter((q) => q.status === 'sealed').length} of ${queue.length} files sealed.`
            : ''}
      </p>

      <AnimatePresence initial={false}>
        {queue.length ? (
          <motion.ul
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-5 divide-y divide-lilac/80 overflow-hidden rounded-md border border-lilac bg-paper"
          >
            <AnimatePresence initial={false}>
              {queue.map((item, index) => (
              <motion.li
                key={item.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: { duration: 0.1 } }
                    : { opacity: 0, height: 0, transition: { duration: 0.15, ease: EASE.inOut } }
                }
                transition={{ duration: DURATION.base, delay: stagger(index), ease: EASE.out }}
                className="flex items-start gap-3 overflow-hidden px-4 py-3"
              >
                <span className="mt-0.5 shrink-0">
                  {item.status === 'sealed' ? (
                    <SealMark size={20} drawIn />
                  ) : item.status === 'rejected' || item.status === 'error' ? (
                    <TriangleAlert aria-hidden="true" strokeWidth={1.5} className="size-[18px] text-alert" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'block size-[18px] rounded-full border border-dashed border-violet',
                        item.status === 'hashing' && item.showIndicator && 'motion-safe:animate-spin',
                      )}
                    />
                  )}
                </span>

                <div
                  className={cn(
                    'min-w-0 flex-1',
                    !reduced && (item.status === 'rejected' || item.status === 'error') && 'anim-shake',
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="min-w-0 truncate text-sm font-medium text-plum">{item.file.name}</p>
                    <p
                      className={cn(
                        'mono text-[0.625rem] tracking-[0.1em] uppercase',
                        item.status === 'rejected' || item.status === 'error' ? 'text-alert' : 'text-muted',
                      )}
                    >
                      {STATUS_COPY[item.status]}
                    </p>
                  </div>

                  {item.status === 'hashing' && item.showIndicator ? (
                    <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-lilac/70">
                      <div
                        className="h-full rounded-full bg-violet-deep transition-[width] duration-150 ease-linear"
                        style={{ width: `${Math.round((item.progress || 0) * 100)}%` }}
                      />
                    </div>
                  ) : null}

                  {item.status === 'queued' ? (
                    <p className="mono mt-1 text-[0.6875rem] text-muted">
                      {formatBytes(item.file.size)} · waiting
                    </p>
                  ) : null}

                  {item.status === 'sealed' ? (
                    <p className="mono mt-1.5 text-[0.6875rem] leading-snug break-all text-muted">
                      {hashBlocks(item.sha256).join(' ')}
                    </p>
                  ) : null}

                  {item.error ? <p className="mt-1 text-xs leading-relaxed text-alert">{item.error}</p> : null}
                </div>

                <button
                  type="button"
                  onClick={() => setQueue((list) => list.filter((q) => q.id !== item.id))}
                  className="-m-2 grid size-9 shrink-0 place-items-center rounded-sm text-muted transition-colors hover:text-plum"
                  aria-label={`Clear ${item.file.name} from the list`}
                >
                  <X aria-hidden="true" strokeWidth={1.5} className="size-4" />
                </button>
              </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
