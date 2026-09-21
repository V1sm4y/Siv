'use client';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../cn';
import { useReducedMotionEffective } from '../motion';

/**
 * Data-visual language (follows the `dataviz` skill): 2px lines, ≥8px end markers with a 2px surface ring,
 * area at ~10% wash, bars ≤24px with a 4px rounded data-end and square baseline, hairline recessive grid,
 * text in text tokens (never the series colour), a table view for every chart, tooltip content also
 * reachable by keyboard. Only ever fed REAL stored data; empty data renders an explicit empty state.
 */

export interface SparkPoint {
  /** Human label for the x position (e.g. "Mon 14 Sep"). */
  label: string;
  value: number;
}

export function Sparkline({
  points,
  title,
  unit = 'events',
  width = 220,
  height = 48,
  className,
}: {
  points: SparkPoint[];
  /** What is plotted: becomes the accessible name and the table caption. */
  title: string;
  unit?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const reduced = useReducedMotionEffective();
  const uid = useId();
  const [active, setActive] = useState<number | null>(null);
  const pad = { x: 5, top: 6, bottom: 6 };
  const total = points.reduce((a, p) => a + p.value, 0);
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const x = (i: number) => pad.x + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad.x * 2));
  const y = (v: number) => pad.top + (1 - v / max) * (height - pad.top - pad.bottom);

  if (n === 0 || total === 0) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-fg-subtle', className)} style={{ height }} role="img" aria-label={`${title}: no activity in this period`}>
        <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
        <span>No {unit} yet</span>
      </div>
    );
  }

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)} ${height - pad.bottom} L${x(0).toFixed(1)} ${height - pad.bottom} Z`;
  const peak = points.reduce((a, p) => (p.value > a.value ? p : a), points[0]!);
  const shown = active ?? n - 1; // the end marker is the default readout
  const sp = points[shown]!;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * width;
    setActive(Math.max(0, Math.min(n - 1, Math.round(((rel - pad.x) / (width - pad.x * 2)) * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft') setActive(Math.max(0, (active ?? n - 1) - 1));
    else if (e.key === 'ArrowRight') setActive(Math.min(n - 1, (active ?? n - 1) + 1));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  return (
    <figure className={cn('relative', className)} style={{ width }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        tabIndex={0}
        aria-label={`${title}: ${total} ${unit} over ${n} days, peak ${peak.value} on ${peak.label}. Use left and right arrows to read each day.`}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
        className="block cursor-crosshair overflow-visible rounded-sm"
      >
        <defs>
          <linearGradient id={`${uid}-wash`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.x} x2={width - pad.x} y1={height - pad.bottom} y2={height - pad.bottom} stroke="var(--line)" strokeWidth="1" />
        <path d={area} fill={`url(#${uid}-wash)`} />
        <motion.path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
        {active !== null && <line x1={x(shown)} x2={x(shown)} y1={pad.top} y2={height - pad.bottom} stroke="var(--line-strong)" strokeWidth="1" />}
        {/* 8px marker (r=4) with a 2px surface ring */}
        <circle cx={x(shown)} cy={y(sp.value)} r="4" fill="var(--accent)" stroke="var(--surface-0)" strokeWidth="2" />
      </svg>
      <figcaption className="mt-1.5 flex items-baseline justify-between gap-3 text-xs" aria-live="polite">
        <span className="font-medium text-fg tabular">{sp.value} <span className="font-normal text-fg-muted">{unit}</span></span>
        <span className="text-fg-subtle">{sp.label}</span>
      </figcaption>
      {/* Table view: every value reachable without pointer or tooltip. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">{unit}</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td>{p.value}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Single-series horizontal bars, one baseline. Bars ≤ 24px, 4px rounded tip, square at the baseline, lighter track. */
export function BarList({ items, unit, className }: { items: { label: string; value: number; hint?: string }[]; unit?: string; className?: string }) {
  const reduced = useReducedMotionEffective();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {items.map((i, idx) => (
        <li key={i.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-fg-muted" title={i.hint}>{i.label}</span>
          <span className="h-2 overflow-hidden rounded-r-[4px] bg-accent/10" aria-hidden="true">
            <motion.span
              className="block h-full origin-left rounded-r-[4px] bg-accent"
              initial={reduced ? false : { scaleX: 0 }}
              animate={{ scaleX: i.value / max }}
              transition={{ duration: 0.55, delay: reduced ? 0 : idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
              style={{ width: '100%' }}
            />
          </span>
          <span className="w-8 text-right font-medium text-fg tabular">{i.value}{unit ? <span className="sr-only"> {unit}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

/** Which in-game roles someone actually plays. Encodes state with an icon + text, never colour alone. */
export function RoleCoverage({ roles, className }: { roles: { id: string; label: string; holders: number }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {roles.map((r) => {
        const covered = r.holders > 0;
        return (
          <li
            key={r.id}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs',
              covered ? 'border-accent/60 bg-accent/10 text-fg' : 'border-dashed border-line-strong text-fg-muted',
            )}
          >
            {covered && <Check className="size-3.5 text-accent-text" aria-hidden="true" />}
            <span>{r.label}</span>
            <span className="text-fg-subtle">{covered ? `covered · ${r.holders}` : 'open'}</span>
          </li>
        );
      })}
    </ul>
  );
}
