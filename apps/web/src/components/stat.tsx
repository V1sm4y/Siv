'use client';
import { AnimatedNumber } from '@arena/ui';
import type { ReactNode } from 'react';

export function Stat({ label, value, suffix, children }: { label: string; value?: number; suffix?: string; children?: ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-3">
        {value !== undefined && (
          <span className="title text-6xl">
            <AnimatedNumber value={value} />
            {suffix && <span className="ml-2 text-lg text-fg-subtle normal-case">{suffix}</span>}
          </span>
        )}
        {children}
      </dd>
    </div>
  );
}
