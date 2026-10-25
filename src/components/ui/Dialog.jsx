import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/**
 * Dialog shell.
 *
 * Escape is deliberately not a close key anywhere in VeraTrace — it belongs to
 * Quick Exit, so a dialog must never swallow it. Closing happens via Cancel,
 * the X, or a click on the scrim.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-plum/35 anim-fade" data-print="hide" />
        <RDialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-60 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-lilac bg-paper shadow-lift anim-dialog',
            SIZES[size],
          )}
          data-print="hide"
        >
          <div className="flex items-start justify-between gap-4 border-b border-lilac bg-wash/55 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <RDialog.Title className="display-md text-plum">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
                  {description}
                </RDialog.Description>
              ) : null}
            </div>
            <RDialog.Close
              className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-paper hover:text-plum"
              aria-label="Close dialog"
            >
              <X aria-hidden="true" strokeWidth={1.5} className="size-[18px]" />
            </RDialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-lilac bg-ivory px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </div>
          ) : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export const DialogClose = RDialog.Close;
