import { cn } from '../lib/cn';
import { fileKind, formatBytes, formatDateTime } from '../lib/format';
import { CopyButton, HashDisplay } from './HashDisplay';
import { VerificationMark } from './ui/StatusMark';

/**
 * The evidence sheet — VeraTrace's signature surface.
 *
 * One record, presented like a lavender-tinted archival sheet: the file's kind
 * and name at the top, its identifiers set in monospace beneath, and the full
 * digest grouped along the foot. Everything about one file on one surface.
 */
export function EvidenceSheet({
  record,
  onSelect,
  selected = false,
  highlighted = false,
  drawSeal = false,
  actions,
  className,
  tone = 'default',
}) {
  const kind = fileKind(record.mimeType, record.fileName);
  const verified = record.verificationStatus === 'MATCH';
  const changed = record.verificationStatus === 'MISMATCH' || record.verificationStatus === 'ERROR';
  const interactive = typeof onSelect === 'function';

  const body = (
    <>
      {/* Spine: the one place colour alone carries meaning, and it is decorative. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[3px]',
          changed ? 'bg-alert/55' : verified ? 'bg-violet-deep' : 'bg-lilac',
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono text-[0.625rem] font-medium tracking-[0.14em] text-muted">{kind}</p>
          <h3
            className={cn(
              'mt-1 truncate font-medium text-plum',
              tone === 'specimen' ? 'text-[0.9375rem]' : 'text-sm',
            )}
            title={record.fileName}
          >
            {record.fileName}
          </h3>
        </div>
        <VerificationMark status={record.verificationStatus} drawIn={drawSeal} className="shrink-0 pt-1" />
      </div>

      <dl className="mono mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Evidence ID</dt>
          <dd className="text-plum/80">{record.evidenceId}</dd>
        </div>
        <span aria-hidden="true" className="text-lilac">
          ·
        </span>
        <div>
          <dt className="sr-only">Size</dt>
          <dd>{formatBytes(record.sizeBytes)}</dd>
        </div>
        <span aria-hidden="true" className="text-lilac">
          ·
        </span>
        <div>
          <dt className="sr-only">Recorded by the application at</dt>
          <dd>{formatDateTime(record.recordedAt)}</dd>
        </div>
      </dl>

      <hr className="rule mt-4 border-lilac/70" />

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1.5 text-[0.625rem]">SHA-256</p>
          <HashDisplay hash={record.sha256} size="sm" />
        </div>
        {interactive ? null : <CopyButton value={record.sha256} what="SHA-256 hash" />}
      </div>
    </>
  );

  const surface = cn(
    'relative overflow-hidden rounded-lg border bg-sheet pl-5 pr-4 py-4 text-left shadow-sheet transition-[border-color,box-shadow,background-color] duration-200 ease-[var(--ease-out-soft)]',
    selected
      ? 'border-violet-deep bg-paper shadow-lift'
      : highlighted
        ? 'border-violet bg-paper'
        : 'border-lilac',
    interactive && 'w-full cursor-pointer hover:border-violet hover:bg-paper hover:shadow-lift',
    className,
  );

  if (interactive) {
    return (
      <div className="group relative">
        <button
          type="button"
          onClick={() => onSelect(record)}
          aria-pressed={selected}
          className={surface}
          data-print="sheet"
        >
          {body}
        </button>
        {actions ? (
          <div
            className="absolute bottom-3 right-3 flex items-center gap-1 rounded-sm bg-paper/92 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
            data-print="hide"
          >
            {actions}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <article className={surface} data-print="sheet">
      {body}
      {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </article>
  );
}
