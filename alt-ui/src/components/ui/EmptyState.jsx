import React from 'react';
import { FileQuestion } from 'lucide-react';
import { cn } from '../../lib/utils';
import Button from './Button';

export default function EmptyState({
  title = 'No items found',
  description = 'There are no records to display at this time.',
  icon: Icon = FileQuestion,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div
      className={cn(
        'text-center py-12 px-6 border border-dashed border-border rounded-lg bg-surface/50 max-w-lg mx-auto my-6',
        className
      )}
    >
      <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center mx-auto mb-3 text-accent">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="font-serif text-lg text-ink font-normal">{title}</h3>
      <p className="text-sm text-muted mt-1.5 max-w-sm mx-auto leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button variant="secondary" onClick={onAction} size="sm">
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
