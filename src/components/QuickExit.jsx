import { useEffect } from 'react';
import { DoorOpen } from 'lucide-react';
import { cn } from '../lib/cn';
import { quickExit } from '../lib/quickExit';

/**
 * Quick Exit.
 *
 * Always present, at every width, and deliberately quieter than the primary
 * action — it is a safety control, not a call to action.
 */
export function QuickExitButton({ className }) {
  return (
    <button
      type="button"
      onClick={quickExit}
      className={cn(
        // Hover may transition; the action itself never does. Nothing here
        // delays the click, and the control is painted on the first frame.
        'inline-flex min-h-11 items-center gap-1.5 rounded-md border border-lilac bg-paper px-3 text-[0.8125rem] font-medium text-plum transition-colors duration-[var(--dur-fast)] hover:border-violet hover:bg-wash/60',
        className,
      )}
    >
      <DoorOpen aria-hidden="true" strokeWidth={1.5} className="size-4 text-violet-deep" />
      Quick Exit
      <kbd className="mono ml-1 hidden rounded-xs border border-lilac bg-ivory px-1 py-px text-[0.625rem] text-muted sm:inline">
        Esc
      </kbd>
      <span className="sr-only">— leaves immediately for a neutral website</span>
    </button>
  );
}

/**
 * Escape belongs to Quick Exit, everywhere, including while a dialog is open.
 * Capture phase, so nothing downstream can get there first.
 */
export function useGlobalQuickExit() {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      quickExit();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
