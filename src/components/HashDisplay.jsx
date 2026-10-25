import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../lib/cn';
import { hashBlocks } from '../lib/format';
import { useToast } from '../store/ToastProvider';

/** Copy-to-clipboard with a short, announced confirmation. */
export function CopyButton({ value, what = 'Hash', className, size = 'sm' }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);
  const toast = useToast();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Older browsers: a hidden textarea is the only route.
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setFailed(false);
      setCopied(true);
      toast(`${what} copied`, { duration: 2500 });
    } catch {
      setCopied(false);
      setFailed(true);
      toast(`Could not copy the ${what.toLowerCase()}`, {
        tone: 'error',
        detail: 'Your browser blocked clipboard access. Select the text and copy it manually.',
      });
    }
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  }, [value, what, toast]);

  const Icon = copied ? Check : Copy;

  return (
    <span className={cn('inline-flex items-center', className)}>
      <button
        type="button"
        onClick={copy}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-transparent px-2 py-1.5 text-xs font-medium transition-colors duration-150 sm:min-h-9',
          failed ? 'text-alert' : copied ? 'text-violet-deep' : 'text-muted hover:border-lilac hover:bg-paper hover:text-plum',
          size === 'md' && 'min-h-11 px-2.5',
        )}
        aria-label={copied ? `${what} copied to clipboard` : `Copy ${what} to clipboard`}
      >
        <Icon aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
        <span aria-hidden="true">{failed ? 'Copy failed' : copied ? 'Copied' : 'Copy'}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${what} copied to clipboard` : failed ? `${what} could not be copied` : ''}
      </span>
    </span>
  );
}

/**
 * A SHA-256 digest, set in tabular monospace and grouped in eight-character
 * blocks so a person can actually read and compare it.
 */
export function HashDisplay({ hash, highlight, size = 'md', className, label = 'SHA-256' }) {
  const blocks = hashBlocks(hash);

  return (
    <div className={cn('min-w-0', className)}>
      <span className="sr-only">{`${label}: ${hash}`}</span>
      <div
        aria-hidden="true"
        className={cn(
          'mono flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug text-plum',
          size === 'sm' ? 'text-[0.6875rem]' : 'text-xs sm:text-[0.8125rem]',
        )}
      >
        {blocks.map((block, index) => {
          const differs = highlight?.has(index);
          return (
            <span
              key={`${block}-${index}`}
              className={cn(
                'rounded-xs px-1 py-0.5 transition-colors',
                differs
                  ? 'bg-alert-wash font-semibold text-alert ring-1 ring-alert/35'
                  : 'bg-transparent',
              )}
            >
              {block}
            </span>
          );
        })}
      </div>
    </div>
  );
}
