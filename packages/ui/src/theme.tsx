'use client';
import { create } from 'zustand';
import { useEffect, type ReactNode } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
const KEY = 'arena.theme';

/** Runs before paint (inline in <head>) so there is no flash of the wrong theme or motion mode. */
export const NO_FLASH_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${KEY}')||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}d.dataset.theme=t;var m=localStorage.getItem('arena.motion');if(m)d.dataset.motion=m}catch(e){document.documentElement.dataset.theme='dark'}})();`;

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}
export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'dark',
  setPreference: (preference) => {
    try {
      localStorage.setItem(KEY, preference);
    } catch {
      /* ignore */
    }
    set({ preference });
  },
}));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemeStore((s) => s.preference);
  useEffect(() => {
    useThemeStore.setState({ preference: read() });
  }, []);
  useEffect(() => {
    const apply = () => {
      const resolved =
        preference === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : preference;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (preference !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [preference]);
  return <>{children}</>;
}
