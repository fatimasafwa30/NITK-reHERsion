import React from 'react';
import { cn } from '../../lib/utils';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-md transition-colors min-h-[44px] px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none';

  const variants = {
    primary: 'bg-accent text-white hover:bg-[#0c4e4b] active:bg-[#0a403d] border border-transparent shadow-none',
    secondary: 'bg-surface text-ink border border-border hover:bg-[#F3EFE8] active:bg-[#ECE6DC]',
    ghost: 'bg-transparent text-ink hover:bg-accent-soft active:bg-[#D5E6E3] border border-transparent',
  };

  const sizes = {
    sm: 'min-h-[36px] px-3 py-1.5 text-xs',
    md: 'min-h-[44px] px-4 py-2 text-sm',
    lg: 'min-h-[48px] px-5 py-2.5 text-base',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
