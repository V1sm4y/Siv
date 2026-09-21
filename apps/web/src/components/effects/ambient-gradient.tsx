'use client';
import { cn, useReducedMotionEffective } from '@arena/ui';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// three.js + shadergradient are only fetched when the guard below passes (dynamic, client-only).
const ShaderLayer = dynamic(() => import('./shader-layer'), { ssr: false });

interface NetworkInformation { saveData?: boolean }

const subscribeNever = () => () => {};
const subscribeVisibility = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
};

function detectCapable(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if ((navigator.hardwareConcurrency ?? 8) <= 4 || conn?.saveData) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * WebGL is decoration. It runs only when: motion is allowed, the device is not low-power, the user has
 * not asked to save data, WebGL2 exists, and the tab is visible. Otherwise the CSS gradient stays.
 * (Server snapshot is `false`, so the shader never renders during SSR/hydration.)
 */
function useAmbientAllowed() {
  const reduced = useReducedMotionEffective();
  const capable = useSyncExternalStore(subscribeNever, detectCapable, () => false);
  const visible = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === 'visible', () => true);
  return { allowed: capable && !reduced, visible };
}

/**
 * Mount the heavy layer only once the container is actually on screen (a display:none panel never
 * intersects) and the browser is idle, so three.js never competes with first paint / LCP.
 */
function useWhenVisibleAndIdle(ref: React.RefObject<HTMLElement | null>) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = () => setReady(true);
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(start, { timeout: 2500 });
      else timer = setTimeout(start, 1200);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, [ref]);
  return ready;
}

export function AmbientGradient({
  colors,
  className,
  webgl = true,
}: {
  colors: readonly [string, string, string];
  className?: string;
  /** false = CSS gradient only. Use on data-bearing screens (see docs/DECISIONS.md D-14 / D-41). */
  webgl?: boolean;
}) {
  const { allowed, visible } = useAmbientAllowed();
  const ref = useRef<HTMLDivElement>(null);
  const ready = useWhenVisibleAndIdle(ref);
  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* Always-on fallback: costs nothing, and is what reduced-motion / low-power users see. */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(60% 70% at 15% 10%, ${colors[0]}55, transparent 70%), radial-gradient(50% 60% at 90% 90%, ${colors[1]}88, transparent 70%)`,
        }}
      />
      {webgl && allowed && ready && (
        <div className="absolute inset-0 animate-[overlay-in_600ms_ease-out] opacity-70">
          <ShaderLayer colors={colors} animate={visible} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface-0/40 to-surface-0" />
    </div>
  );
}
