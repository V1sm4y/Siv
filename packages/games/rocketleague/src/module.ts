import { defineGameModule, MANUAL_ADAPTERS } from '@arena/game-sdk';

// Depth: foundation. Foundation only (identity, theme, roles, arenas, metric definitions); depth arrives in M6.
export default defineGameModule({
  id: 'rocketleague',
  name: 'Rocket League',
  shortName: 'RL',
  theme: {
    accent: '#2F8CFF',
    accentFg: '#0B0D12',
    accentText: '#2F8CFF',
    accentTextLight: '#0B57C8',
    gradient: ['#2F8CFF', '#FF8A2F', '#0F1117'],
    icon: 'zap',
  },
  roles: [
    { id: 'striker', label: 'Striker', short: 'STR' },
    { id: 'playmaker', label: 'Playmaker', short: 'PLM' },
    { id: 'defender', label: 'Last defender', short: 'DEF' },
  ],
  arenas: [{ id: 'standard', label: 'Standard arena' }],
  sides: [{ id: 'blue', label: 'Blue' }, { id: 'orange', label: 'Orange' }],
  teamSize: 3,
  metrics: [
    { id: 'goals_pg', label: 'Goals / game', aggregation: 'mean', higherIsBetter: true },
    { id: 'saves_pg', label: 'Saves / game', aggregation: 'mean', higherIsBetter: true },
    { id: 'shooting_pct', label: 'Shooting %', unit: '%', aggregation: 'mean', higherIsBetter: true },
    { id: 'boost_pm', label: 'Boost / min', aggregation: 'mean', higherIsBetter: false },
  ],
  adapters: [
    ...MANUAL_ADAPTERS,
    { id: 'ballchasing', label: 'Ballchasing replays', source: 'replay', requiresCredentials: true, status: 'planned' },
  ],
  liveGuidance: {
    allowed: 'ruleset-dependent',
    warning:
      "Coach communication during live Rocket League series is set by the tournament ruleset. Confirm before using Live Guidance.",
  },
  depth: 'foundation',
});
