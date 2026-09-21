/**
 * Design tokens: single source of truth. `pnpm gen:tokens` emits src/styles/tokens.generated.css;
 * tokens.test.ts asserts WCAG contrast for every text/surface pair in both themes and every game accent.
 * Dark is the primary theme.
 */

export interface Palette {
  surface0: string; // app background
  surface1: string; // panels
  surface2: string; // raised / hover
  surface3: string; // popovers, selected
  line: string; // decorative hairlines
  lineStrong: string; // control borders (>= 3:1 on surface1)
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  danger: string;
  success: string;
  warning: string;
  info: string;
}

export const dark: Palette = {
  surface0: '#07080C', // the base plane
  surface1: '#0B0D13', // sidebars, sticky bars
  surface2: '#11141C', // hover / raised rows
  surface3: '#181C27', // popovers, selected
  line: '#1D2230',
  lineStrong: '#5A6378',
  fg: '#F3F5FA',
  fgMuted: '#A3ACBF',
  fgSubtle: '#7D869C',
  danger: '#FF7B7B',
  success: '#43E0A0',
  warning: '#FFB454',
  info: '#70B8FF',
};

export const light: Palette = {
  surface0: '#F4F5F9',
  surface1: '#FFFFFF',
  surface2: '#EEF0F5',
  surface3: '#E3E6EE',
  line: '#DCE0EA',
  lineStrong: '#7A8399',
  fg: '#0B0D12',
  fgMuted: '#434B5F',
  fgSubtle: '#596278',
  danger: '#B3202A',
  success: '#0B7A4B',
  warning: '#8A5300',
  info: '#0B57C8',
};

export const radius = { sm: '4px', md: '8px', lg: '12px', xl: '18px', full: '9999px' } as const;

export const spacing = { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px' } as const;

/** Milliseconds. Micro-interactions 120-220, route transitions 250-400. */
export const duration = { instant: 90, micro: 160, base: 220, route: 320, slow: 480 } as const;

export const easing = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
} as const;
/** Same curves for Framer Motion (`ease` accepts a 4-tuple). */
export const easingTuple = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const elevation = {
  // Depth from a lit top edge + a soft ambient drop, never a heavy glow.
  dark: {
    1: 'inset 0 1px 0 rgb(255 255 255 / 0.04)',
    2: 'inset 0 1px 0 rgb(255 255 255 / 0.06), 0 8px 24px -12px rgb(0 0 0 / 0.6)',
    3: 'inset 0 1px 0 rgb(255 255 255 / 0.08), 0 24px 48px -16px rgb(0 0 0 / 0.7)',
  },
  light: {
    1: '0 1px 0 rgb(15 20 35 / 0.04)',
    2: '0 1px 0 rgb(15 20 35 / 0.04), 0 8px 24px -12px rgb(15 20 35 / 0.18)',
    3: '0 24px 48px -16px rgb(15 20 35 / 0.28)',
  },
} as const;

export const typeScale = {
  xs: ['0.75rem', '1rem'],
  sm: ['0.8125rem', '1.25rem'],
  base: ['0.9375rem', '1.5rem'],
  lg: ['1.125rem', '1.625rem'],
  xl: ['1.375rem', '1.75rem'],
  '2xl': ['1.75rem', '2.125rem'],
  '3xl': ['2.25rem', '2.5rem'],
  '4xl': ['3rem', '3.25rem'],
  '5xl': ['4rem', '3.75rem'],
  '6xl': ['5.5rem', '4.75rem'],
} as const;

/** Neutral org-level accent (no game selected). Same contrast rules as the game themes. */
export const brandTheme = {
  accent: '#8B9CFF',
  accentFg: '#0B0D12',
  accentText: '#8B9CFF',
  accentTextLight: '#3446D0',
  gradient: ['#8B9CFF', '#2A2F6B', '#0F1117'],
} as const;
