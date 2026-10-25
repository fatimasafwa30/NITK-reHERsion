import React from 'react';
import { cn } from '../../lib/utils';

export default function Card({ children, className = '', as: Component = 'div', ...props }) {
  return (
    <Component
      className={cn(
        'bg-surface border border-border rounded-lg p-6 transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
