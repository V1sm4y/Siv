import { wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';
import { games } from '@arena/game-registry';
import { brandTheme, dark, light, type Palette } from './tokens';

const c = (a: string, b: string) => wcagContrast(a, b);

for (const [name, p] of [['dark', dark], ['light', light]] as [string, Palette][]) {
  describe(`${name} theme contrast (WCAG 2.2 AA)`, () => {
    const surfaces = [p.surface0, p.surface1, p.surface2, p.surface3] as const;
    it('primary and muted text reach 4.5:1 on every surface', () => {
      for (const s of surfaces) {
        expect(c(p.fg, s), `fg on ${s}`).toBeGreaterThanOrEqual(4.5);
        expect(c(p.fgMuted, s), `fgMuted on ${s}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it('subtle text reaches 4.5:1 on the main surfaces', () => {
      for (const s of [p.surface0, p.surface1, p.surface2]) {
        expect(c(p.fgSubtle, s), `fgSubtle on ${s}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it('control borders reach 3:1 against panel surfaces', () => {
      expect(c(p.lineStrong, p.surface1)).toBeGreaterThanOrEqual(3);
      expect(c(p.lineStrong, p.surface0)).toBeGreaterThanOrEqual(3);
    });
    it('status colours reach 4.5:1 as text on panels', () => {
      for (const k of ['danger', 'success', 'warning', 'info'] as const) {
        expect(c(p[k], p.surface1), k).toBeGreaterThanOrEqual(4.5);
        expect(c(p[k], p.surface2), `${k} on surface2`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}

describe('per-game accent themes (and the org-level brand accent)', () => {
  const all = [{ id: 'brand', theme: brandTheme }, ...games];
  for (const g of all) {
    const t = g.theme;
    it(`${g.id}: label on accent fill reaches 4.5:1`, () => {
      expect(c(t.accentFg, t.accent)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${g.id}: accent text reaches 4.5:1 on dark surfaces`, () => {
      for (const s of [dark.surface0, dark.surface1, dark.surface2, dark.surface3]) {
        expect(c(t.accentText, s), s).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${g.id}: accent text reaches 4.5:1 on light surfaces (used as focus ring and link colour)`, () => {
      for (const s of [light.surface0, light.surface1, light.surface2]) {
        expect(c(t.accentTextLight, s), s).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${g.id}: accent fill is a visible non-text element on dark surfaces (>= 3:1)`, () => {
      expect(c(t.accent, dark.surface1)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('stylesheet ↔ generated tokens', () => {
  it('every var(--x) used in styles/index.css is defined (guards against naming drift)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(import.meta.dirname, 'styles');
    const generated = readFileSync(join(dir, 'tokens.generated.css'), 'utf8');
    const index = readFileSync(join(dir, 'index.css'), 'utf8');
    // Provided at runtime by next/font in the app layout, or defined inside @theme itself.
    const runtime = new Set(['font-display', 'font-sans', 'font-mono']);
    const defined = new Set([...generated.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
    const used = new Set([...index.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]!));
    const missing = [...used].filter((u) => !defined.has(u) && !runtime.has(u));
    expect(missing).toEqual([]);
  });
});
