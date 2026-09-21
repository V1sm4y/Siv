import type { ReactNode } from 'react';

/** Page anatomy: mono eyebrow → big condensed title → one calm line of context. */
export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="title mt-3 text-5xl sm:text-6xl">{title}</h1>
        {description && <p className="mt-4 max-w-2xl text-fg-muted text-pretty">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/**
 * Non-card section: label rail on the left, content on the base plane on the right. Grouping comes from
 * alignment, spacing and a hairline, not from boxes.
 */
export function Section({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id?: string }) {
  const h = id ?? `s-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section aria-labelledby={h} className="grid gap-5 border-t border-line py-8 md:grid-cols-[200px_1fr] md:gap-10">
      <div>
        <h2 id={h} className="eyebrow text-fg-muted">{label}</h2>
        {hint && <p className="mt-2 max-w-[22ch] text-sm text-fg-subtle text-pretty">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A row of headline figures separated by hairlines. Real numbers only. */
export function SignalStrip({ children }: { children: ReactNode }) {
  return <dl className="mb-4 grid grid-cols-2 border-y border-line md:grid-cols-4 [&>div]:border-line [&>div]:px-5 [&>div]:py-6 [&>div:not(:first-child)]:md:border-l [&>div:nth-child(2n)]:max-md:border-l [&>div:nth-child(n+3)]:max-md:border-t first:[&>div]:pl-0">{children}</dl>;
}
