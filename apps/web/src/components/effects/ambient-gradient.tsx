'use client';
import { cn } from '@arena/ui';
import dynamic from 'next/dynamic';
import { useRef } from 'react';
import { useWebGLGate } from './webgl-gate';

// three.js + shadergradient are only fetched when the gate passes (dynamic, client-only).
const ShaderLayer = dynamic(() => import('./shader-layer'), { ssr: false });

export function AmbientGradient({
  colors,
  className,
  webgl = true,
  preserveBuffer = false,
}: {
  colors: readonly [string, string, string];
  className?: string;
  /** false = CSS gradient only. Use on data-bearing screens (see docs/DECISIONS.md D-41). */
  webgl?: boolean;
  /** Needed when a liquid-glass surface snapshots the page over this layer. */
  preserveBuffer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { allowed, visible } = useWebGLGate(ref);
  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* Always-on fallback: free, and what reduced-motion / low-power users see. */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(60% 70% at 15% 10%, ${colors[0]}55, transparent 70%), radial-gradient(50% 60% at 90% 90%, ${colors[1]}88, transparent 70%)`,
        }}
      />
      {webgl && allowed && (
        <div className="absolute inset-0 animate-[overlay-in_700ms_ease-out] opacity-80">
          <ShaderLayer colors={colors} animate={visible} preserveBuffer={preserveBuffer} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface-0/50 to-surface-0" />
    </div>
  );
}
