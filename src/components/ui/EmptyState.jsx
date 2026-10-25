import { cn } from '../../lib/cn';

/**
 * Empty, no-results and not-found states. Held to the same standard as the
 * populated screens: quiet, specific, and never a shrug.
 */
export function EmptyState({ icon: Icon, title, children, action, className, align = 'center' }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-lilac bg-paper/60 px-6 py-12',
        align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      <div className={cn('mx-auto max-w-sm', align === 'left' && 'mx-0')}>
        {Icon ? (
          <Icon
            aria-hidden="true"
            strokeWidth={1.25}
            className={cn('size-6 text-violet', align === 'center' ? 'mx-auto' : '')}
          />
        ) : null}
        <h3 className="display-md mt-4 text-plum">{title}</h3>
        {children ? <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div> : null}
        {action ? <div className={cn('mt-6 flex gap-2', align === 'center' ? 'justify-center' : '')}>{action}</div> : null}
      </div>
    </div>
  );
}
