# Design QA

Visual and interaction checklist for every screen. Run it before merging UI work. **Status column reflects what was actually checked on 2026-09-22**, not what is aspirational.

## 1. System rules (the "one source of truth" audit)

| Rule | How it is enforced | Status |
|---|---|---|
| Colours come only from tokens (`packages/ui/src/tokens.ts` → generated CSS) | No hex literals in `apps/web` outside game-module themes and shader colour props (grep in review) | ✅ |
| Every text/surface pair meets WCAG 2.2 AA in dark **and** light | `tokens.test.ts` (37 tests, includes per-game accents and the brand accent) | ✅ |
| Every CSS variable used is defined | Drift test in `tokens.test.ts` (added after a real naming bug) | ✅ |
| One radius scale (4/8/12/18) and one spacing rhythm (Tailwind 4px steps) | Tokens → `@theme`; components use `rounded-sm/md/lg` only | ✅ |
| Type roles: condensed **display** (titles, numerals) · **Geist** UI · **Geist Mono** eyebrow labels | `.title`, `.eyebrow` utilities; no other font families | ✅ |
| Depth: base plane flat; elevation only for real floating layers (menus, popovers, dialogs) | `glass` used on overlays and the sign-in/onboarding card only | ✅ |
| Glow is scarce: none at rest on controls | Accent used for state, key numerals, one left bar | ✅ |
| Motion: micro 120–220 ms, route 250–400 ms, transform/opacity only | `duration` tokens; `MotionConfig` + reduced-motion fallback | ✅ |

## 2. Per-screen checklist

Legend: ✅ checked · ➖ n/a. Each screen must have loading / empty / error states, keyboard path, reduced-motion behaviour and axe = 0 violations.

| Screen | Loading | Empty | Error | Keyboard | Reduced motion | axe (dark) | Light theme |
|---|---|---|---|---|---|---|---|
| Sign in | ➖ | ➖ | ✅ (auth errors) | ✅ | ✅ (CSS glass, no WebGL) | ✅ | ➖ |
| Onboarding (4 steps) | ✅ (button states) | ➖ | ✅ (field + form errors) | ✅ | ✅ | ➖ (not scanned: see gaps) | ➖ |
| Overview | ✅ `loading.tsx` | ✅ (containers art) | ✅ `error.tsx` | ✅ | ✅ | ✅ | ➖ |
| Team home | ✅ | ✅ (roster art) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Members | ✅ | ✅ (invite art) | ✅ + 403 state | ✅ | ✅ | ✅ | ➖ |
| Audit log | ✅ | ✅ (ledger art) | ✅ + 403 state | ✅ | ✅ | ✅ | ➖ |
| Settings | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ➖ |
| Command palette | ➖ | ✅ ("No results") | ➖ | ✅ (⌘K, `?`, `g`-chords) | ✅ | ➖ | ➖ |
| Guardian / Join pages | ✅ | ➖ | ✅ | ✅ | ✅ | ➖ | ➖ |

## 3. Signature moments

| Moment | Spec | Status |
|---|---|---|
| Intro | < 3 s (2.4 s), skippable (button, Esc/Enter/Space, click), once per session, never under reduced motion, never blocks | ✅ e2e-tested |
| Game-switch transition | Accent flood from the click origin + game glyph and name + per-game background art crossfade; accent morphs via registered `@property` | ✅ e2e-tested (accent value asserted) |
| Liquid mark | R3F shader; still frame at rest, animates on hover in the sidebar; SVG fallback | ✅ |
| Liquid glass | Real refraction on sign-in / onboarding only; CSS glass fallback | ✅ (live in headless Chromium; fallback e2e-tested) |

## 4. Data-visual language

| Rule (dataviz skill) | Status |
|---|---|
| Lines 2 px round; end marker ≥ 8 px with 2 px surface ring; area ≈ wash | ✅ Sparkline |
| Bars ≤ 24 px, 4 px rounded data-end, square at baseline, lighter track | ✅ BarList |
| Text uses text tokens, never the series colour | ✅ |
| State never conveyed by colour alone (icon + text) | ✅ RoleCoverage ("covered · n" / "open"), badges carry labels |
| Table view for every chart; tooltip content keyboard-reachable | ✅ sr-only table, arrow-key readout |
| Only real data; empty data says so | ✅ ("No events yet"); sections absent (not zeroed) without permission, e2e-tested |
| Single series → no legend box | ✅ |

## 5. Performance (production build, Lighthouse mobile defaults: simulated slow-4G, 4× CPU; authenticated pages verified by final URL)

| Screen | Perf | A11y | Best-pr. | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| Sign in | 90 | 100 | 96 | 2.9 s | 250 ms | 0 |
| Overview | 89 | 100 | 96 | 3.8 s | 10 ms | 0 |
| Team home | 90 | 100 | 96 | 3.7 s | 10 ms | 0 |
| Members | 90 | 100 | 96 | 3.7 s | 10 ms | 0 |
| Audit log | 90 | 100 | 96 | 3.7 s | 10 ms | 0 |
| Settings | 91 | 100 | 96 | 3.5 s | 10 ms | 0 |

**Against the premium brief (interaction < 100 ms, LCP < 2.0 s, no layout shift): CLS and interaction latency met; LCP NOT met** (2.9–3.8 s). Remaining cost is JavaScript weight under 4× CPU throttling: ≈ 300 KB on app screens (Next/React core ≈ 105 KB, framer-motion ≈ 95 KB). Levers, in order: framer-motion `LazyMotion` (~30–40 KB), splitting the TanStack Query provider to the pages that use it, and a lighter intro.

What the measuring found and fixed (each is a regression test or documented decision):
- three.js (235 KB gzip) was loading on every page for the sidebar/intro mark → now loads on first hover only; the intro uses a CSS/SVG sheen (D-48).
- The route-entry animation started at `opacity: 0` from JavaScript → now a CSS animation on a server component.
- Display font swap caused reflow → `display: 'optional'`.
- Counting stat numerals changed width every frame (proportional digits) → the final width is reserved (CLS 0.28 → 0).
- Content wider than the phone screen made Chrome resize the layout viewport (everything re-centred) → `overflow-x: clip`, titles wrap anywhere; `scrollbar-gutter: stable`.
- Probing WebGL capability leaked a context per render → cached (D-45).
- Skip link and small targets flagged by Lighthouse → explicit colours/size (a11y back to 100).

## 6. Known gaps (honest list)

- Onboarding and Join/Guardian pages are not in the axe e2e sweep yet.
- Light theme is axe-checked on the team page only; other screens rely on the token contrast tests.
- Screen-reader (VoiceOver/NVDA) and colour-blind-simulation passes have **not** been done by a human; only automated axe and keyboard e2e.
- The liquid-glass snapshot is taken once per load; it can drift if the layout shifts after the snapshot (it rebuilds on resize).
- Native `<select>` is used for role pickers: accessible, but not visually themed beyond the border.
