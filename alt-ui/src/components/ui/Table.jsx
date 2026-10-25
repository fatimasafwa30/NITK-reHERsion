import React from 'react';
import { cn } from '../../lib/utils';

export function Table({ className = '', ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm text-left border-collapse', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className = '', ...props }) {
  return <thead className={cn('border-b border-border bg-[#F7F5F0]', className)} {...props} />;
}

export function TableBody({ className = '', ...props }) {
  return <tbody className={cn('divide-y divide-border bg-surface', className)} {...props} />;
}

export function TableRow({ className = '', ...props }) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-[#FBF9F5] focus-within:bg-[#FBF9F5]',
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className = '', ...props }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider',
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className = '', ...props }) {
  return (
    <td className={cn('px-4 py-3.5 text-sm text-ink align-middle', className)} {...props} />
  );
}
