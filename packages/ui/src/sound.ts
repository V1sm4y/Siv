'use client';
import { create } from 'zustand';

/**
 * Tasteful UI sound cues, synthesised with WebAudio (no assets, no network).
 * OFF by default; only ever starts after a user gesture; respects the toggle immediately.
 */
export type Cue = 'tick' | 'confirm' | 'switch' | 'notify' | 'error';
const KEY = 'arena.sound';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

interface SoundState {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}
export const useSoundStore = create<SoundState>((set) => ({
  enabled: false,
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    set({ enabled });
    if (enabled) playCue('confirm');
  },
}));
/** Call once on the client to load the saved preference (kept off the server render). */
export const hydrateSoundPreference = () => useSoundStore.setState({ enabled: read() });

let ctx: AudioContext | null = null;
const audio = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  return (ctx ??= new AC());
};

interface Tone { f: number; f2?: number; t: number; d: number; type?: OscillatorType; g?: number }
const CUES: Record<Cue, Tone[]> = {
  tick: [{ f: 1900, t: 0, d: 0.035, type: 'triangle', g: 0.05 }],
  confirm: [{ f: 620, t: 0, d: 0.09, g: 0.07 }, { f: 930, t: 0.07, d: 0.14, g: 0.06 }],
  switch: [{ f: 220, f2: 880, t: 0, d: 0.28, type: 'sawtooth', g: 0.035 }, { f: 1320, t: 0.2, d: 0.16, g: 0.04 }],
  notify: [{ f: 880, t: 0, d: 0.1, g: 0.06 }, { f: 1175, t: 0.1, d: 0.16, g: 0.05 }],
  error: [{ f: 180, t: 0, d: 0.16, type: 'square', g: 0.04 }],
};

export function playCue(cue: Cue) {
  if (!useSoundStore.getState().enabled) return;
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  const now = a.currentTime;
  for (const t of CUES[cue]) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.f, now + t.t);
    if (t.f2) osc.frequency.exponentialRampToValueAtTime(t.f2, now + t.t + t.d);
    gain.gain.setValueAtTime(0.0001, now + t.t);
    gain.gain.exponentialRampToValueAtTime(t.g ?? 0.05, now + t.t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.t + t.d);
    osc.connect(gain).connect(a.destination);
    osc.start(now + t.t);
    osc.stop(now + t.t + t.d + 0.02);
  }
}
