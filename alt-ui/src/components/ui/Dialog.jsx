import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  children,
  title,
  description,
  className = '',
  onClose,
  ...props
}) {
  return (
    <RadixDialog.Portal>
      {/* Scrim overlay */}
      <RadixDialog.Overlay className="fixed inset-0 bg-[#1C1B1A]/40 backdrop-blur-[2px] z-50 transition-opacity" />

      {/* Dialog box: onEscapeKeyDown prevents Radix from consuming Escape, allowing global Quick Exit to catch it */}
      <RadixDialog.Content
        onEscapeKeyDown={(e) => {
          // Prevent Radix from handling Escape so the global Quick Exit window listener catches it
          e.preventDefault();
        }}
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
          'w-full max-w-lg max-h-[90vh] overflow-y-auto',
          'bg-surface border border-border rounded-lg p-6 sm:p-8',
          'focus-visible:outline-none focus:ring-0',
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && (
              <RadixDialog.Title className="font-serif text-2xl font-normal text-ink tracking-tight">
                {title}
              </RadixDialog.Title>
            )}
            {description && (
              <RadixDialog.Description className="text-sm text-muted mt-1 leading-relaxed">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            asChild
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-accent-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <button type="button" aria-label="Close dialog">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </RadixDialog.Close>
        </div>

        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
