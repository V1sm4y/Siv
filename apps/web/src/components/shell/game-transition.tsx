'use client';
import { GameIcon, dur, ease, useReducedMotionEffective } from '@arena/ui';
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
 * the route changes underneath it, then it fades away as the shell's --accent morphs (registered
 * @property). Reduced motion: plain navigation, and the CSS transition is instant.
 */
export function GameTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotionEffective();
  const [ov, setOv] = useState<Overlay | null>(null);

  const go = useCallback<(href: string, gameId: string | null, origin?: { x: number; y: number }) => void>(
    (href, gameId, origin) => {
      if (reduced || !gameId || href === pathname) return router.push(href);
      setOv({ href, gameId, x: origin?.x ?? innerWidth / 2, y: origin?.y ?? innerHeight / 2, phase: 'in' });
    },
    [reduced, pathname, router],
  );

  // Derived, not stored: once the new route is showing the overlay is no longer visible and fades out.
  const landed = ov?.phase === 'out' && pathname === ov.href.split('?')[0];
  // A timeout guards against a navigation that never lands (setState in a timer callback, not the effect body).
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
            className="pointer-events-none fixed inset-0 z-[90] grid place-items-center"
            style={{ background: `linear-gradient(135deg, ${game.theme.accent}, ${game.theme.gradient[1]})` }}
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
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08, duration: dur.base, ease: ease.out }}
              className="flex flex-col items-center gap-3"
              style={{ color: game.theme.accentFg }}
            >
              <GameIcon icon={game.theme.icon} className="size-14" />
              <span className="font-display text-2xl font-semibold">{game.name}</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
