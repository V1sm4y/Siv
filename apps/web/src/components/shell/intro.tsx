'use client';
import { dur, ease, useReducedMotionEffective } from '@arena/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { SheenMark } from '../effects/liquid-mark';

/**
 * Signature intro: the liquid mark resolves, the wordmark tracks in, an accent sweep closes it.
 * 2.4 s total, once per browser session, skippable (button, Esc, Enter, Space, click), never shown
 * under reduced motion, and never blocks: it fades and hands focus back to the page.
 */
const KEY = 'arena.intro';
const DURATION_MS = 2400;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const seen = () => { try { return sessionStorage.getItem(KEY) === 'seen'; } catch { return true; } };
function markSeen() {
  try { sessionStorage.setItem(KEY, 'seen'); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function IntroSequence({ tint, label }: { tint: string; label: string }) {
  const reduced = useReducedMotionEffective();
  // Server snapshot = "seen" so nothing renders during SSR/hydration; the client decides afterwards.
  const alreadySeen = useSyncExternalStore(subscribe, seen, () => true);
  const show = !alreadySeen && !reduced;
  const skip = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => markSeen(), []);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(dismiss, DURATION_MS);
    const onKey = (e: KeyboardEvent) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); dismiss(); } };
    window.addEventListener('keydown', onKey);
    skip.current?.focus({ preventScroll: true });
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [show, dismiss]);

  // Reduced-motion users never see it; record that so it doesn't flash if they later switch motion on.
  useEffect(() => { if (reduced && !alreadySeen) markSeen(); }, [reduced, alreadySeen]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="dialog"
          aria-label="Welcome to Arena OS"
          data-testid="intro"
          data-no-snapshot=""
          className="fixed inset-0 z-[100] grid place-items-center bg-surface-0"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: dur.route, ease: ease.inOut } }}
          onClick={dismiss}
        >
          <div className="absolute inset-0 aurora" aria-hidden="true" />
          {/* Fixed width: text metrics (late font swap) can never re-centre the column and cause layout shift. */}
          <div className="relative flex w-[min(92vw,30rem)] flex-col items-center gap-6">
            <motion.div initial={{ scale: 0.82, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.9, ease: ease.out }}>
              <SheenMark size={168} tint={tint} />
            </motion.div>
            <h2 className="title flex justify-center overflow-hidden text-6xl whitespace-nowrap" aria-label="Arena OS">
              {'ARENA OS'.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  className={ch === ' ' ? 'w-4' : i > 5 ? 'text-fg-subtle' : undefined}
                  initial={{ y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.55 + i * 0.045, duration: 0.5, ease: ease.out }}
                >
                  {ch}
                </motion.span>
              ))}
            </h2>
            <motion.p className="eyebrow max-w-full truncate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.05, duration: 0.4 }}>
              {label}
            </motion.p>
            <motion.div
              aria-hidden="true"
              className="h-px w-56 origin-left bg-accent"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 1.5, ease: ease.inOut }}
            />
          </div>
          <button
            ref={skip}
            type="button"
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="eyebrow absolute top-5 right-5 rounded-md border border-line-strong px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Skip · Esc
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
