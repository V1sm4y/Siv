'use client';
import type { ReactNode } from 'react';

/**
 * Per-game background art: procedural line art in the live accent, drawn once per game and cross-faded
 * when the container changes. Pure SVG (no assets, no WebGL). Sits behind everything, masked to the
 * top-right so it never competes with content.
 */
const stroke = { fill: 'none', stroke: 'var(--accent)', strokeOpacity: 0.2, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const hexPath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}L${cx + r * 0.866} ${cy - r / 2}V${cy + r / 2}L${cx} ${cy + r}L${cx - r * 0.866} ${cy + r / 2}V${cy - r / 2}Z`;

const ART: Record<string, () => ReactNode> = {
  // Valorant: angular slashes and chevrons
  valorant: () => (
    <g {...stroke}>
      {range(22).map((i) => <line key={i} x1={i * 44 - 260} y1={0} x2={i * 44 + 140} y2={600} />)}
      {range(4).map((i) => <path key={i} d={`M${430 + i * 46} 40L${720 + i * 46} 300L${430 + i * 46} 560`} strokeOpacity={0.34 - i * 0.06} />)}
    </g>
  ),
  // CS2: scope rings and range ticks
  cs2: () => (
    <g {...stroke}>
      {range(8).map((i) => <circle key={i} cx={640} cy={230} r={70 + i * 62} />)}
      <line x1={140} x2={800} y1={230} y2={230} /><line x1={640} x2={640} y1={0} y2={600} />
      {range(24).map((i) => <line key={i} x1={640 - 400 + i * 34} x2={640 - 400 + i * 34} y1={222} y2={i % 4 === 0 ? 210 : 218} />)}
    </g>
  ),
  // Dota 2: diamond lattice
  dota2: () => (
    <g {...stroke}>
      {range(26).map((i) => <line key={`a${i}`} x1={i * 60 - 400} y1={0} x2={i * 60 + 200} y2={600} />)}
      {range(26).map((i) => <line key={`b${i}`} x1={i * 60 + 200} y1={0} x2={i * 60 - 400} y2={600} />)}
    </g>
  ),
  // LoL: hextech tessellation
  lol: () => (
    <g {...stroke}>
      {range(9).flatMap((row) => range(10).map((col) => <path key={`${row}-${col}`} d={hexPath(col * 80 + (row % 2) * 40 + 60, row * 70 + 30, 40)} strokeOpacity={0.12 + ((row + col) % 4) * 0.05} />))}
    </g>
  ),
  // Rocket League: speed streaks and ball rings
  rocketleague: () => (
    <g {...stroke}>
      {range(22).map((i) => { const y = 24 + i * 26; const len = 120 + Math.abs(Math.sin(i * 1.7)) * 380; return <line key={i} x1={820 - len} x2={820} y1={y} y2={y} strokeOpacity={0.12 + (i % 5) * 0.04} />; })}
      {range(3).map((i) => <circle key={i} cx={600} cy={260} r={90 + i * 50} strokeOpacity={0.3 - i * 0.07} />)}
    </g>
  ),
  // EA FC: pitch geometry
  eafc: () => (
    <g {...stroke}>
      <rect x={120} y={60} width={620} height={480} rx={4} /><line x1={430} x2={430} y1={60} y2={540} />
      <circle cx={430} cy={300} r={78} /><circle cx={430} cy={300} r={4} />
      <rect x={120} y={190} width={110} height={220} /><rect x={630} y={190} width={110} height={220} />
      <rect x={120} y={245} width={44} height={110} /><rect x={696} y={245} width={44} height={110} />
    </g>
  ),
  // No game selected: nested hexagons (the brand mark)
  brand: () => (
    <g {...stroke}>
      {range(8).map((i) => <path key={i} d={hexPath(620, 240, 70 + i * 62)} strokeOpacity={0.34 - i * 0.035} />)}
    </g>
  ),
};

export function GameBackdrop({ gameId }: { gameId?: string }) {
  const key = gameId && ART[gameId] ? gameId : 'brand';
  // A plain SVG + CSS opacity fade (no layout-measuring presence wrapper: that caused layout shift on
  // hydration). The game-switch overlay already covers the moment of change.
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aurora absolute inset-0" />
      <svg
        key={key}
        viewBox="0 0 800 600"
        preserveAspectRatio="xMaxYMin slice"
        className="absolute -top-[4%] -right-[6%] h-[90vh] w-[75vw] max-w-[1200px] animate-[overlay-in_500ms_ease-out]"
        style={{ maskImage: 'radial-gradient(75% 75% at 78% 22%, #000 25%, transparent 78%)', WebkitMaskImage: 'radial-gradient(75% 75% at 78% 22%, #000 25%, transparent 78%)' }}
      >
        {ART[key]!()}
      </svg>
    </div>
  );
}
