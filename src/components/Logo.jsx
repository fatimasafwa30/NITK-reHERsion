import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';

/** The wordmark: a sealed ring, then the name set in the display serif. */
export function Logo({ to = '/', className, size = 'md' }) {
  const content = (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('translate-y-px shrink-0', size === 'lg' ? 'size-6' : 'size-5')}
        fill="none"
      >
        <circle cx="12" cy="12" r="9.5" stroke="var(--color-violet-deep)" strokeWidth="1.25" />
        <circle
          cx="12"
          cy="12"
          r="6"
          stroke="var(--color-violet)"
          strokeWidth="0.8"
          strokeDasharray="1.3 2"
        />
        <path d="M12 7.2v9.6" stroke="var(--color-violet-deep)" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
      <span
        className={cn(
          'font-[family-name:var(--font-display)] tracking-[-0.02em] text-plum',
          size === 'lg' ? 'text-[1.375rem]' : 'text-[1.0625rem]',
        )}
        style={{ fontVariationSettings: "'wght' 500" }}
      >
        VeraTrace
      </span>
    </span>
  );

  if (!to) return content;

  return (
    <Link to={to} className="inline-flex min-h-11 items-center rounded-sm sm:min-h-0" aria-label="VeraTrace — go to the start page">
      {content}
    </Link>
  );
}

export default Logo;
