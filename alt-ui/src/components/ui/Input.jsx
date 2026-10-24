import React from 'react';
import { cn } from '../../lib/utils';

export default function Input({ className = '', id, label, error, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full min-h-[44px] px-3.5 py-2 text-sm bg-surface text-ink border border-border rounded-md',
          'placeholder:text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent',
          'disabled:opacity-50 disabled:bg-[#F7F5F0]',
          error && 'border-mismatch focus-visible:ring-mismatch',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-mismatch mt-1">{error}</p>}
    </div>
  );
}
