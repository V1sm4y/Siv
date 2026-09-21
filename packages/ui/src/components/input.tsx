import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';

const control =
  'w-full rounded-md border border-line-strong bg-surface-1 px-3 text-sm text-fg placeholder:text-fg-subtle ' +
  'transition-colors hover:bg-surface-2 focus-visible:bg-surface-1 disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-10', className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-24 py-2', className)} {...props} />;
}
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  // Native <select>: best keyboard and screen-reader behaviour, styled to match.
  return (
    <select className={cn(control, 'h-10 appearance-none bg-no-repeat pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/** Label + hint + error wired with correct ids and aria attributes. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
