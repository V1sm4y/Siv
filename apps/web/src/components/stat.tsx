'use client';
import { AnimatedNumber } from '@arena/ui';

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-fg-subtle uppercase">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-semibold"><AnimatedNumber value={value} /></dd>
    </div>
  );
}
