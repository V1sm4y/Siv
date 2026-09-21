'use client';
import { GameIcon, dur, ease, playCue, useReducedMotionEffective } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface Overlay {
  href: string;
  gameId: string;
  x: number;
  y: number;
  phase: 'in' | 'out';
}
const Ctx = createContext<{ go: (href: string, gameId: string | null, origin?: { x: number; y: number }) => void }>({
  go: () => {},
});
export const useGameTransition = () => useContext(Ctx);

/**
 * Switching game containers: the target game's accent floods out from the control that was clicked,
 * carrying its glyph and name, the route changes underneath, then it fades as the shell's --accent and
 * background art morph. Reduced motion: plain navigation (the CSS morph is instant too).
 */
export function GameTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotionEffective();
  const [ov, setOv] = useState<Overlay | null>(null);

  const go = useCallback<(href: string, gameId: string | null, origin?: { x: number; y: number }) => void>(
    (href, gameId, origin) => {
      playCue('switch');
      if (reduced || !gameId || href === pathname) return router.push(href);
      setOv({ href, gameId, x: origin?.x ?? innerWidth / 2, y: origin?.y ?? innerHeight / 2, phase: 'in' });
    },
    [reduced, pathname, router],
  );

  // Derived: once the new route is showing the overlay is no longer visible and fades out.
  const landed = ov?.phase === 'out' && pathname === ov.href.split('?')[0];
  // A timeout guards against a navigation that never lands (setState in a timer callback).
  useEffect(() => {
    if (ov?.phase !== 'out') return;
    const t = setTimeout(() => setOv(null), 4000);
    return () => clearTimeout(t);
  }, [ov?.phase]);

  const game = ov ? getGame(ov.gameId) : null;
  return (
    <Ctx.Provider value={{ go }}>
      {children}
      <AnimatePresence onExitComplete={() => setOv(null)}>
        {ov && game && !landed && (
          <motion.div
            key={ov.href}
            aria-hidden="true"
            data-testid="game-transition"
            data-no-snapshot=""
            className="pointer-events-none fixed inset-0 z-[90] grid place-items-center overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${game.theme.accent}, ${game.theme.gradient[1]} 78%)` }}
            initial={{ clipPath: `circle(0px at ${ov.x}px ${ov.y}px)` }}
            animate={{ clipPath: `circle(150vmax at ${ov.x}px ${ov.y}px)` }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.route, ease: ease.inOut }}
            onAnimationComplete={(def) => {
              if (ov.phase === 'in' && typeof def === 'object' && 'clipPath' in def) {
                setOv({ ...ov, phase: 'out' });
                router.push(ov.href);
              }
            }}
          >
            {/* Oversized glyph as the cover art, then the name. One motion channel each. */}
            <motion.div
              className="absolute -right-24 -bottom-24 opacity-15"
              style={{ color: game.theme.accentFg }}
              initial={{ scale: 0.8, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, ease: ease.out }}
            >
              <GameIcon icon={game.theme.icon} className="size-[46rem]" />
            </motion.div>
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.08, duration: dur.base, ease: ease.out }}
              className="relative flex flex-col items-center gap-2"
              style={{ color: game.theme.accentFg }}
            >
              <GameIcon icon={game.theme.icon} className="size-12" />
              <span className="title text-6xl">{game.name}</span>
              <span className="eyebrow" style={{ color: game.theme.accentFg }}>Loading container</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
