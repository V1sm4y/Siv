import { defineGameModule, MANUAL_ADAPTERS } from '@arena/game-sdk';

// Depth: foundation. Foundation only (identity, theme, roles, arenas, metric definitions); depth arrives in M6.
export default defineGameModule({
  id: 'dota2',
  name: 'Dota 2',
  shortName: 'DOTA',
  theme: {
    accent: '#A66BFF',
    accentFg: '#0B0D12',
    accentText: '#A66BFF',
    accentTextLight: '#6B2FD1',
    gradient: ['#A66BFF', '#3B1F7A', '#0F1117'],
    icon: 'swords',
  },
  roles: [
    { id: 'pos1', label: 'Carry (Pos 1)', short: 'P1', group: 'Core' },
    { id: 'pos2', label: 'Mid (Pos 2)', short: 'P2', group: 'Core' },
    { id: 'pos3', label: 'Offlane (Pos 3)', short: 'P3', group: 'Core' },
    { id: 'pos4', label: 'Soft support (Pos 4)', short: 'P4', group: 'Support' },
    { id: 'pos5', label: 'Hard support (Pos 5)', short: 'P5', group: 'Support' },
  ],
  arenas: [{ id: 'standard', label: 'Standard map' }],
  sides: [{ id: 'radiant', label: 'Radiant' }, { id: 'dire', label: 'Dire' }],
  teamSize: 5,
  metrics: [
    { id: 'gpm', label: 'Gold / min', aggregation: 'mean', higherIsBetter: true },
    { id: 'xpm', label: 'XP / min', aggregation: 'mean', higherIsBetter: true },
    { id: 'kda', label: 'KDA', aggregation: 'ratio', higherIsBetter: true },
    { id: 'hero_damage_pm', label: 'Hero damage / min', aggregation: 'mean', higherIsBetter: true },
  ],
  adapters: [
    ...MANUAL_ADAPTERS,
    { id: 'opendota', label: 'OpenDota / Steam Web API', source: 'opendota_api', requiresCredentials: false, status: 'planned' },
    { id: 'gsi', label: 'Game State Integration (via Arena Bridge)', source: 'gsi', requiresCredentials: false, status: 'planned' },
  ],
  liveGuidance: {
    allowed: 'ruleset-dependent',
    warning:
      "Coach communication during live Dota 2 matches depends on tournament rules. Confirm before using Live Guidance.",
  },
  depth: 'foundation',
});
