import { defineGameModule, MANUAL_ADAPTERS } from '@arena/game-sdk';

// Depth: foundation. Foundation only (identity, theme, roles, arenas, metric definitions); depth arrives in M6.
export default defineGameModule({
  id: 'eafc',
  name: 'EA Sports FC',
  shortName: 'FC',
  editions: [
    { id: 'fc26', label: 'FC 26', current: false },
    { id: 'fc27', label: 'FC 27', current: true },
  ],
  theme: {
    accent: '#3DDC84',
    accentFg: '#0B0D12',
    accentText: '#3DDC84',
    accentTextLight: '#007A3D',
    gradient: ['#3DDC84', '#0E4D3A', '#0F1117'],
    icon: 'trophy',
  },
  roles: [
    { id: 'solo', label: '1v1 player', short: '1V1', group: 'Competitive' },
    { id: 'coop', label: 'Co-op / club player', short: 'CLB', group: 'Competitive' },
  ],
  arenas: [{ id: 'standard', label: 'Standard match' }],
  sides: [{ id: 'home', label: 'Home' }, { id: 'away', label: 'Away' }],
  teamSize: 1,
  metrics: [
    { id: 'goals_pg', label: 'Goals / game', aggregation: 'mean', higherIsBetter: true },
    { id: 'xg_diff', label: 'xG difference', aggregation: 'mean', higherIsBetter: true },
    { id: 'pass_acc', label: 'Pass accuracy', unit: '%', aggregation: 'mean', higherIsBetter: true },
    { id: 'possession', label: 'Possession', unit: '%', aggregation: 'mean', higherIsBetter: true },
  ],
  adapters: [
    ...MANUAL_ADAPTERS,
    { id: 'tournament', label: 'Tournament-platform import', source: 'tournament_import', requiresCredentials: false, status: 'planned' },
  ],
  liveGuidance: {
    allowed: 'ruleset-dependent',
    warning:
      "Coaching during EA Sports FC matches is usually not allowed while the game is live. Use Live Guidance only where the ruleset explicitly allows it.",
  },
  depth: 'foundation',
});
