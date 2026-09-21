/**
 * Game Module contract. A module is DATA + optional lazily-loaded UI, so the realtime service and
 * workers can import it without React. Adding a game = adding one folder under packages/games/*
 * that default-exports a GameModule; tooling/gen-modules.mjs discovers it. No core file changes.
 */

export interface RoleDef {
  id: string;
  label: string;
  short: string;
  /** Free-form group for UI, e.g. "Entry", "Support". */
  group?: string;
}

export interface ArenaDef {
  id: string;
  label: string;
  /** Callout names used by the tactical board and scouting templates. Filled in per game milestone. */
  callouts?: string[];
}

export interface SideDef {
  id: string;
  label: string;
}

export interface GameTheme {
  /** Accent fill as an sRGB hex. Contrast against `accentFg` and dark surfaces is asserted in tests. */
  accent: string;
  /** Text/icon colour on top of `accent`. */
  accentFg: string;
  /** Accent when used as text on a dark surface (must reach 4.5:1). */
  accentText: string;
  /** Accent when used as text on a light surface (must reach 4.5:1). */
  accentTextLight: string;
  /** Three stops for the ambient shader gradient. */
  gradient: [string, string, string];
  /** Key resolved by the UI icon map. */
  icon: string;
}

export interface EditionDef {
  id: string;
  label: string;
  current: boolean;
}

export type Source = 'riot_api' | 'opendota_api' | 'csv' | 'manual' | 'gsi' | 'replay' | 'demo_file' | 'tournament_import';

export interface MetricDef {
  id: string;
  label: string;
  unit?: string;
  aggregation: 'sum' | 'mean' | 'ratio';
  higherIsBetter: boolean;
}

export interface LiveGuidancePolicy {
  /** 'never' for games/rulesets where in-match coach comms are not permitted at all. */
  allowed: 'always' | 'ruleset-dependent' | 'never';
  warning: string;
}

/** Which levels of data access this module can offer. Every module must include 'manual' and 'csv'. */
export interface AdapterCapability {
  id: string;
  label: string;
  source: Source;
  /** Requires third-party credentials or player consent. */
  requiresCredentials: boolean;
  /** Implementation status, shown honestly in the UI. */
  status: 'available' | 'planned';
}

export interface GameModule {
  id: string;
  name: string;
  shortName: string;
  editions?: EditionDef[];
  theme: GameTheme;
  roles: RoleDef[];
  arenas: ArenaDef[];
  sides?: SideDef[];
  /** Players on court/field for one side, used for roster sizing. */
  teamSize: number;
  metrics: MetricDef[];
  adapters: AdapterCapability[];
  liveGuidance: LiveGuidancePolicy;
  /** Marks modules whose depth is delivered in a later milestone; shown in the UI. */
  depth: 'full' | 'foundation';
}

export function defineGameModule<T extends GameModule>(m: T): T {
  return m;
}

export const MANUAL_ADAPTERS: AdapterCapability[] = [
  // 'planned' until the ingestion UI ships (M2/M3). The UI shows this status verbatim.
  { id: 'manual', label: 'Manual entry', source: 'manual', requiresCredentials: false, status: 'planned' },
  { id: 'csv', label: 'CSV import', source: 'csv', requiresCredentials: false, status: 'planned' },
];

/** Checks the invariants every module must satisfy. Used by the conformance test. */
export function validateGameModule(m: GameModule): string[] {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(m.id)) errors.push(`id "${m.id}" must be snake/lowercase`);
  if (m.roles.length === 0) errors.push('roles must not be empty');
  if (new Set(m.roles.map((r) => r.id)).size !== m.roles.length) errors.push('duplicate role ids');
  if (new Set(m.arenas.map((a) => a.id)).size !== m.arenas.length) errors.push('duplicate arena ids');
  const ids = m.adapters.map((a) => a.id);
  for (const required of ['manual', 'csv']) {
    if (!ids.includes(required)) errors.push(`adapters must include "${required}"`);
  }
  if (m.editions && m.editions.filter((e) => e.current).length !== 1) {
    errors.push('exactly one edition must be current');
  }
  if (m.teamSize < 1) errors.push('teamSize must be >= 1');
  return errors;
}
