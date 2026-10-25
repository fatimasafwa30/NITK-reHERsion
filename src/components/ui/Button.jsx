import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

const VARIANTS = {
  // One strong violet for primary actions, used sparingly.
  primary:
    'bg-violet-deep text-white border border-violet-deep hover:bg-violet-press hover:border-violet-press active:bg-violet-press',
  secondary:
    'bg-paper text-plum border border-lilac hover:border-violet hover:bg-wash/60 active:bg-wash',
  quiet:
    'bg-transparent text-violet-deep border border-transparent hover:bg-wash/70 underline decoration-lilac decoration-1 underline-offset-4 hover:decoration-violet',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-wash/70 hover:text-plum',
  danger:
    'bg-paper text-alert border border-alert/40 hover:border-alert hover:bg-alert-wash active:bg-alert-wash',
};

const SIZES = {
  // 44px on touch, tighter on pointer screens.
  sm: 'min-h-11 sm:min-h-9 px-3 text-[0.8125rem] gap-1.5 rounded-sm',
  md: 'min-h-11 px-4 text-sm gap-2 rounded-md',
  lg: 'min-h-12 px-6 text-[0.9375rem] gap-2 rounded-md',
  icon: 'size-11 rounded-md justify-center',
};

const BASE =
  'inline-flex items-center justify-center font-medium transition-[color,background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-soft)] disabled:cursor-not-allowed disabled:opacity-55 select-none';

export const Button = forwardRef(function Button(
  { as, to, href, variant = 'secondary', size = 'md', className, children, ...props },
  ref,
) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a ref={ref} href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }
  const Tag = as || 'button';
  return (
    <Tag ref={ref} type={Tag === 'button' ? props.type || 'button' : undefined} className={classes} {...props}>
      {children}
    </Tag>
  );
});
