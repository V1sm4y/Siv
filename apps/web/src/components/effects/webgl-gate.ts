'use client';
import { useReducedMotionEffective } from '@arena/ui';
import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

interface NetworkInformation { saveData?: boolean }

const subscribeNever = () => () => {};
const subscribeVisibility = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
};

// useSyncExternalStore calls this on EVERY render, and probing creates a WebGL context, so the answer
// is computed once and the probe context is released immediately (browsers cap live contexts at ~16).
let capableCache: boolean | undefined;
function detectCapable(): boolean {
  if (capableCache !== undefined) return capableCache;
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if ((navigator.hardwareConcurrency ?? 8) <= 4 || conn?.saveData) return (capableCache = false);
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return (capableCache = Boolean(gl));
  } catch {
    return (capableCache = false);
  }
}

/** Device can afford WebGL decoration (server snapshot is false, so SSR/hydration never renders it). */
export const useWebGLCapable = () => useSyncExternalStore(subscribeNever, detectCapable, () => false);
export const usePageVisible = () =>
  useSyncExternalStore(subscribeVisibility, () => document.visibilityState === 'visible', () => true);

/**
 * Mount heavy layers only once the container is actually on screen (a display:none panel never
 * intersects) and the browser is idle, so they never compete with first paint / LCP.
 */
export function useWhenVisibleAndIdle(ref: RefObject<HTMLElement | null>, extraDelayMs = 0) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = () => {
        timer = setTimeout(() => setReady(true), extraDelayMs);
      };
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(start, { timeout: 2500 });
      else start();
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, [ref, extraDelayMs]);
  return ready;
}

/** capable device + motion allowed + on screen + idle. */
export function useWebGLGate(ref: RefObject<HTMLElement | null>, extraDelayMs = 0) {
  const reduced = useReducedMotionEffective();
  const capable = useWebGLCapable();
  const ready = useWhenVisibleAndIdle(ref, extraDelayMs);
  const visible = usePageVisible();
  return { allowed: capable && !reduced && ready, allowedNoIdle: capable && !reduced, visible };
}
