import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full min-h-11 rounded-md border border-lilac bg-paper px-3 py-2.5 text-sm text-plum placeholder:text-muted/70 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-state)] hover:border-violet focus:border-violet-deep';

export function Label({ children, htmlFor, hint }) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-3 pb-1.5">
      <span className="text-[0.8125rem] font-medium text-plum">{children}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** Label + control + help/error text, wired up with the right aria attributes. */
export function Field({ label, hint, error, help, children, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ');

  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {help && !error ? (
        <p id={helpId} className="mt-1.5 text-xs leading-relaxed text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(CONTROL, props['aria-invalid'] && 'border-alert hover:border-alert', className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'resize-y leading-relaxed', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(CONTROL, 'cursor-pointer pr-9', className)} {...props}>
      {children}
    </select>
  );
});
