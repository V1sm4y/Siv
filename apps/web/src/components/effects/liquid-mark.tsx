'use client';
import { cn } from '@arena/ui';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { useWebGLGate } from './webgl-gate';

const Canvas = dynamic(() => import('./liquid-mark-canvas'), { ssr: false });

/** Static SVG version: the always-available fallback and the SSR/first-paint render. */
export function MarkGlyph({ className, tint = 'var(--accent)' }: { className?: string; tint?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 28 9v14L16 30 4 23V9z" fill="none" stroke={tint} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 9l7 4v6l-7 4-7-4v-6z" fill={tint} />
    </svg>
  );
}

/**
 * The Arena mark as a liquid-metal emblem (R3F, shader ported from liquid-logo).
 *  - activate="idle"  : mounts once the container is visible and the browser is idle (brand screens).
 *  - activate="hover" : loads three.js ONLY on first hover/focus, then animates while hovered. Used in the
 *    app shell so the 235 KB WebGL chunk never touches first load (measured: it cost ~1 s of LCP).
 * Falls back to the SVG glyph whenever WebGL is not appropriate (reduced motion, low-power, Save-Data).
 */
export function LiquidMark({
  size = 96,
  tint,
  animate = true,
  activate = 'idle',
  className,
  delayMs = 0,
}: {
  size?: number;
  /** Hex colour to tint toward (usually the current game accent). */
  tint: string;
  animate?: boolean;
  activate?: 'idle' | 'hover';
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gate = useWebGLGate(ref, delayMs);
  const [armed, setArmed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const capableAndCalm = gate.allowedNoIdle;
  const mount = activate === 'hover' ? armed && capableAndCalm : gate.allowed;
  const running = activate === 'hover' ? hovered && gate.visible : animate && gate.visible;
  return (
    <div
      ref={ref}
      data-no-snapshot=""
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
      onPointerEnter={activate === 'hover' ? () => { setArmed(true); setHovered(true); } : undefined}
      onPointerLeave={activate === 'hover' ? () => setHovered(false) : undefined}
    >
      <MarkGlyph className={cn('absolute inset-0 size-full transition-opacity duration-300', mount && 'opacity-0')} tint={tint} />
      {mount && (
        <div className="absolute inset-0 animate-[overlay-in_500ms_ease-out]">
          <Canvas tint={tint} animate={running} />
        </div>
      )}
    </div>
  );
}

/**
 * Zero-WebGL "liquid" sheen for moments that must not load three.js (the first-visit intro): the glyph
 * with a light band sweeping across it, clipped to the hexagons. CSS/SVG only.
 */
export function SheenMark({ size = 160, tint, className }: { size?: number; tint: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true">
      <defs>
        <clipPath id="sheen-clip">
          <path d="M16 1.2 28.8 8.6v14.8L16 30.8 3.2 23.4V8.6z M16 3.5 6 9.2v13.6l10 5.7 10-5.7V9.2z" clipRule="evenodd" />
          <path d="M16 9l7 4v6l-7 4-7-4v-6z" />
        </clipPath>
        <linearGradient id="sheen-band" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M16 2 28 9v14L16 30 4 23V9z" fill="none" stroke={tint} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 9l7 4v6l-7 4-7-4v-6z" fill={tint} />
      <g clipPath="url(#sheen-clip)">
        <rect x="-14" y="-4" width="12" height="40" fill="url(#sheen-band)" transform="skewX(-18)" className="animate-[sheen_1.7s_0.45s_cubic-bezier(0.65,0,0.35,1)_both]" />
      </g>
    </svg>
  );
}
