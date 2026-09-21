'use client';
import { cn } from '@arena/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWebGLGate } from './webgl-gate';

/**
 * A surface with real refraction: https://github.com/dashersw/liquid-glass-js (vendored, MIT) samples a
 * one-time snapshot of the page (html2canvas-pro) and refracts it behind this element in WebGL.
 *
 * Rules (docs/RISKS.md): mount ONLY on public/brand screens (sign-in, onboarding). The snapshot renders
 * whatever is on screen into a local texture, so it must never run over member data. Everything is
 * gated and falls back to plain CSS glass (backdrop-filter) if WebGL, the snapshot or motion is off.
 */
export function LiquidGlass({
  children,
  className,
  radius = 24,
  tint = 0.14,
  delayMs = 3500,
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
  tint?: number;
  /**
   * Progressive enhancement: the card is CSS glass first, and the refractive layer fades in later. The
   * page snapshot is a long main-thread task, so it waits well past first paint and interaction.
   */
  delayMs?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { allowed } = useWebGLGate(host, delayMs);
  const [live, setLive] = useState(false);
  const [generation, setGeneration] = useState(0);

  // A resize invalidates the snapshot geometry: rebuild (debounced).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => setGeneration((g) => g + 1), 500);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!allowed || !el) return;
    let cancelled = false;
    let engine: { destroy(): void; updateSizeFromDOM(): void; render?: () => void; webglInitialized: boolean } | undefined;
    let ro: ResizeObserver | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        const [{ Container }, { default: html2canvas }] = await Promise.all([
          import('@/vendor/liquid-glass/container.js'),
          import('html2canvas-pro'),
        ]);
        if (cancelled) return;
        Container.html2canvas = html2canvas as never;
        Container.onError = () => {
          if (!cancelled) setLive(false); // CSS glass remains
        };
        const c = new Container({ borderRadius: radius, tintOpacity: tint });
        // Adopt only the engine's canvas: our element is the layout box (React owns the children).
        c.element = el;
        c.canvas.style.zIndex = '-1';
        c.canvas.style.boxShadow = 'none';
        el.prepend(c.canvas);
        c.updateSizeFromDOM();
        engine = c;
        ro = new ResizeObserver(() => {
          c.updateSizeFromDOM();
          c.render?.();
        });
        ro.observe(el);
        // Flip to the refractive look only once the shader has actually initialised.
        poll = setInterval(() => {
          if (c.webglInitialized) {
            clearInterval(poll);
            if (!cancelled) setLive(true);
          }
        }, 120);
      } catch {
        if (!cancelled) setLive(false);
      }
    })();

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      ro?.disconnect();
      engine?.destroy();
      setLive(false);
    };
  }, [allowed, radius, tint, generation]);

  return (
    <div
      ref={host}
      data-no-snapshot=""
      data-liquid={live ? 'on' : 'off'}
      style={{ borderRadius: radius }}
      className={cn('glass relative isolate overflow-hidden data-[liquid=on]:border-white/15 data-[liquid=on]:bg-transparent data-[liquid=on]:shadow-none data-[liquid=on]:backdrop-blur-none', className)}
    >
      {children}
    </div>
  );
}
