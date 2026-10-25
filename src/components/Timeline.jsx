import { Paperclip } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/cn';
import { formatDate, formatDateTime } from '../lib/format';
import { DURATION, EASE, STAGGER, stagger } from '../motion/tokens';

/**
 * Timeline marker.
 *
 * A confirmed time gets a solid stop on the rule. An uncertain one gets a
 * hollow, dashed stop — different in shape, not only in colour — and the
 * record says so in words beside it.
 */
export function TimelineMarker({ uncertain = false, active = false }) {
  if (uncertain) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'block size-[13px] rounded-full border border-dashed bg-ivory transition-colors duration-200',
          active ? 'border-violet-deep' : 'border-violet',
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block size-[9px] rounded-full ring-3 ring-ivory transition-colors duration-200',
        active ? 'bg-violet-press' : 'bg-violet-deep',
      )}
    />
  );
}

export function Timeline({ events, evidenceById, activeEvidenceId, onFocusEvidence, className }) {
  const reduced = useReducedMotion();

  return (
    <ol className={cn('relative', className)}>
      {/* The rule itself: one hairline, drawn behind every stop. */}
      <span aria-hidden="true" className="absolute bottom-2 left-[6px] top-2 w-px bg-lilac" />

      {events.map((event, index) => {
        const uncertain = event.timeConfidence === 'uncertain' || !event.occurredAt;
        const related = event.relatedEvidenceId ? evidenceById[event.relatedEvidenceId] : null;
        const active = Boolean(related && activeEvidenceId === related.evidenceId);

        return (
          <motion.li
            key={event.eventId}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, delay: stagger(index, STAGGER.list), ease: EASE.out }}
            className="relative pb-7 pl-7 last:pb-0"
            data-print="section"
          >
            <motion.span
              className="absolute left-0 top-[7px] grid w-[13px] place-items-center"
              initial={reduced ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DURATION.base, delay: stagger(index, STAGGER.list), ease: EASE.out }}
            >
              <TimelineMarker uncertain={uncertain} active={active} />
            </motion.span>

            <div
              className={cn(
                '-mx-2 rounded-md px-2 py-1 transition-colors duration-[var(--dur-fast)]',
                active && 'bg-wash/70',
              )}
              onMouseEnter={related ? () => onFocusEvidence?.(related.evidenceId) : undefined}
              onMouseLeave={related ? () => onFocusEvidence?.(null) : undefined}
            >
              <p className="mono flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] text-muted">
                <time dateTime={event.occurredAt || undefined}>
                  {event.occurredAt ? formatDateTime(event.occurredAt) : 'Time not recorded'}
                </time>
                {uncertain ? (
                  <span className="rounded-xs border border-dashed border-violet px-1.5 py-px not-italic text-violet-deep">
                    date uncertain
                  </span>
                ) : null}
              </p>

              <p className="mt-1 text-sm leading-relaxed text-plum">{event.label}</p>

              {related ? (
                <button
                  type="button"
                  onFocus={() => onFocusEvidence?.(related.evidenceId)}
                  onBlur={() => onFocusEvidence?.(null)}
                  onClick={() => onFocusEvidence?.(related.evidenceId)}
                  className={cn(
                    'mt-2 inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-1.5 text-xs transition-colors duration-[var(--dur-fast)]',
                    active
                      ? 'border-violet-deep bg-paper text-violet-deep'
                      : 'border-lilac bg-paper/70 text-muted hover:border-violet hover:text-plum',
                  )}
                >
                  <Paperclip aria-hidden="true" strokeWidth={1.5} className="size-3.5 shrink-0" />
                  <span className="truncate">{related.fileName}</span>
                  <span className="sr-only">— highlight this related evidence</span>
                </button>
              ) : null}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** Print-friendly, text-only rendering of the same events for the dossier. */
export function TimelineTable({ events, evidenceById }) {
  return (
    <table className="w-full border-collapse text-left text-[0.8125rem]">
      <thead>
        <tr className="border-b border-lilac">
          <th scope="col" className="eyebrow py-2 pr-4 font-semibold">
            When
          </th>
          <th scope="col" className="eyebrow py-2 pr-4 font-semibold">
            Confidence
          </th>
          <th scope="col" className="eyebrow py-2 font-semibold">
            Event
          </th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const related = event.relatedEvidenceId ? evidenceById[event.relatedEvidenceId] : null;
          return (
            <tr key={event.eventId} className="border-b border-lilac/70 align-top">
              <td className="mono py-2.5 pr-4 text-xs text-plum whitespace-nowrap">
                {event.occurredAt ? formatDate(event.occurredAt) : '—'}
              </td>
              <td className="py-2.5 pr-4 text-xs text-muted">
                {event.timeConfidence === 'uncertain' || !event.occurredAt ? 'Date uncertain' : 'Confirmed'}
              </td>
              <td className="py-2.5 text-plum">
                {event.label}
                {related ? (
                  <span className="mono mt-1 block text-[0.6875rem] text-muted">
                    Related: {related.fileName} ({related.evidenceId})
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
