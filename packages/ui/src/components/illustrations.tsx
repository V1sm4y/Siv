import type { SVGProps } from 'react';

/**
 * Empty-state art: one consistent line language (1.5px, round caps, currentColor + the live accent).
 * Decorative: always aria-hidden; the EmptyState text carries the meaning.
 */
const base = { viewBox: '0 0 160 120', fill: 'none', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const hex = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}L${cx + r * 0.866} ${cy - r / 2}V${cy + r / 2}L${cx} ${cy + r}L${cx - r * 0.866} ${cy + r / 2}V${cy - r / 2}Z`;

export function RosterArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <g stroke="currentColor" opacity=".45"><path d={hex(50, 66, 22)} /><path d={hex(110, 66, 22)} /></g>
      <path d={hex(80, 56, 30)} stroke="var(--accent)" />
      <circle cx="80" cy="50" r="7" stroke="var(--accent)" />
      <path d="M66 74c2-8 8-11 14-11s12 3 14 11" stroke="var(--accent)" />
      <path d="M30 104h100" stroke="currentColor" opacity=".3" strokeDasharray="2 6" />
    </svg>
  );
}
export function ContainersArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d={hex(80, 74, 26)} stroke="currentColor" opacity=".35" />
      <path d={hex(80, 60, 26)} stroke="currentColor" opacity=".6" />
      <path d={hex(80, 46, 26)} stroke="var(--accent)" />
      <path d="M80 36v20M70 42l10-6 10 6" stroke="var(--accent)" />
      <path d="M28 100h104" stroke="currentColor" opacity=".3" strokeDasharray="2 6" />
    </svg>
  );
}
export function LedgerArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {[28, 52, 76].map((y, i) => (
        <g key={y}>
          <rect x="44" y={y} width="72" height="16" rx="3" stroke={i === 0 ? 'var(--accent)' : 'currentColor'} opacity={i === 0 ? 1 : 0.5 - i * 0.1} />
          <path d={`M54 ${y + 8}h${30 - i * 6}`} stroke={i === 0 ? 'var(--accent)' : 'currentColor'} opacity={i === 0 ? 1 : 0.4} />
          {i < 2 && <path d={`M80 ${y + 16}v8`} stroke="currentColor" opacity=".45" />}
        </g>
      ))}
    </svg>
  );
}
export function InviteArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="36" y="38" width="88" height="56" rx="6" stroke="currentColor" opacity=".55" />
      <path d="M36 44l44 30 44-30" stroke="currentColor" opacity=".55" />
      <path d={hex(80, 74, 12)} stroke="var(--accent)" fill="var(--accent)" fillOpacity=".15" />
      <path d="M112 30l10-10M124 38l12-4" stroke="var(--accent)" />
    </svg>
  );
}
