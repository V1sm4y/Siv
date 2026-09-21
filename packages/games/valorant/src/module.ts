import { defineGameModule, MANUAL_ADAPTERS } from '@arena/game-sdk';

// Depth: full. Full module delivered in M3.
export default defineGameModule({
  id: 'valorant',
  name: 'VALORANT',
  shortName: 'VAL',
  theme: {
    accent: '#FF4655',
    accentFg: '#0B0D12',
    accentText: '#FF4655',
    accentTextLight: '#C4162A',
    gradient: ['#FF4655', '#7A1F3D', '#0F1117'],
    icon: 'crosshair',
  },
  roles: [
    { id: 'duelist', label: 'Duelist', short: 'DUE', group: 'Entry' },
    { id: 'initiator', label: 'Initiator', short: 'INI', group: 'Support' },
    { id: 'controller', label: 'Controller', short: 'CON', group: 'Control' },
    { id: 'sentinel', label: 'Sentinel', short: 'SEN', group: 'Anchor' },
    { id: 'igl', label: 'In-game leader', short: 'IGL', group: 'Leadership' },
    { id: 'flex', label: 'Flex', short: 'FLX' },
  ],
  arenas: [{ id: 'ascent', label: 'Ascent' }, { id: 'bind', label: 'Bind' }, { id: 'haven', label: 'Haven' }, { id: 'split', label: 'Split' }, { id: 'icebox', label: 'Icebox' }, { id: 'breeze', label: 'Breeze' }, { id: 'fracture', label: 'Fracture' }, { id: 'pearl', label: 'Pearl' }, { id: 'lotus', label: 'Lotus' }, { id: 'sunset', label: 'Sunset' }, { id: 'abyss', label: 'Abyss' }],
  sides: [{ id: 'attack', label: 'Attack' }, { id: 'defence', label: 'Defence' }],
  teamSize: 5,
  metrics: [
    { id: 'acs', label: 'Average combat score', aggregation: 'mean', higherIsBetter: true },
    { id: 'adr', label: 'Average damage / round', aggregation: 'mean', higherIsBetter: true },
    { id: 'kast', label: 'KAST', unit: '%', aggregation: 'mean', higherIsBetter: true },
    { id: 'kd', label: 'K/D ratio', aggregation: 'ratio', higherIsBetter: true },
    { id: 'hs_pct', label: 'Headshot %', unit: '%', aggregation: 'mean', higherIsBetter: true },
    { id: 'fk_diff', label: 'First kills − first deaths', aggregation: 'sum', higherIsBetter: true },
    { id: 'clutches', label: 'Clutches won', aggregation: 'sum', higherIsBetter: true },
  ],
  adapters: [
    ...MANUAL_ADAPTERS,
    { id: 'riot', label: 'Riot API (RSO opt-in)', source: 'riot_api', requiresCredentials: true, status: 'planned' },
  ],
  liveGuidance: {
    allowed: 'ruleset-dependent',
    warning:
      "Coach communication during live Valorant matches is governed by each tournament's ruleset. Confirm it is permitted before using Live Guidance.",
  },
  depth: 'full',
});
