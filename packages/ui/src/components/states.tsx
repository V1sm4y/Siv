import { AlertTriangle, Inbox, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Every screen needs an empty state that says what this is, why it's empty, and what to do. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <div className="grid size-12 place-items-center rounded-full border border-line-strong bg-surface-2 text-fg-muted" aria-hidden="true">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <div className="grid size-12 place-items-center rounded-full border border-danger/50 bg-danger/10 text-danger" aria-hidden="true">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}

export { WifiOff };
