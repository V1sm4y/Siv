'use client';
import { MotionConfig, type Variants } from 'framer-motion';
import { create } from 'zustand';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { duration, easingTuple } from './tokens';

export type MotionPreference = 'system' | 'full' | 'reduced';
const KEY = 'arena.motion';

function read(): MotionPreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'full' || v === 'reduced' || v === 'system') return v;
  } catch {
    /* storage can be blocked; fall back to system */
  }
  return 'system';
}

interface MotionState {
  preference: MotionPreference;
  setPreference: (p: MotionPreference) => void;
}
export const useMotionStore = create<MotionState>((set) => ({
  preference: 'system',
  setPreference: (preference) => {
    try {
      localStorage.setItem(KEY, preference);
    } catch {
      /* ignore */
    }
    set({ preference });
  },
}));

const subscribeOS = (cb: () => void) => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const osReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True when motion should be removed: the user forced "reduced", or chose "system" and the OS asks for it. */
export function useReducedMotionEffective(): boolean {
  const pref = useMotionStore((s) => s.preference);
  const os = useSyncExternalStore(subscribeOS, osReduced, () => false);
  return pref === 'reduced' || (pref === 'system' && os);
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const preference = useMotionStore((s) => s.preference);
  useEffect(() => {
    useMotionStore.setState({ preference: read() });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = preference;
  }, [preference]);
  return (
    <MotionConfig reducedMotion={preference === 'reduced' ? 'always' : preference === 'full' ? 'never' : 'user'}>
      {children}
    </MotionConfig>
  );
}

/** Shared presets. Transform + opacity only (GPU-friendly). */
export const ease = easingTuple;
export const dur = { micro: duration.micro / 1000, base: duration.base / 1000, route: duration.route / 1000, slow: duration.slow / 1000 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.out } },
};
export const stagger = (gap = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: 0.02 } },
});
