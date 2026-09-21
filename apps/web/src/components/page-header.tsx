import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-semibold text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted text-pretty">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
