import { defineGameModule, MANUAL_ADAPTERS } from '@arena/game-sdk';

// Depth: foundation. Foundation only (identity, theme, roles, arenas, metric definitions); depth arrives in M6.
export default defineGameModule({
  id: 'cs2',
  name: 'Counter-Strike 2',
  shortName: 'CS2',
  theme: {
    accent: '#F5A623',
    accentFg: '#0B0D12',
    accentText: '#F5A623',
    accentTextLight: '#8A5300',
    gradient: ['#F5A623', '#7A4A12', '#0F1117'],
    icon: 'target',
  },
  roles: [
    { id: 'igl', label: 'In-game leader', short: 'IGL', group: 'Leadership' },
    { id: 'entry', label: 'Entry fragger', short: 'ENT', group: 'Entry' },
    { id: 'awper', label: 'AWPer', short: 'AWP', group: 'Firepower' },
    { id: 'lurker', label: 'Lurker', short: 'LUR', group: 'Map control' },
    { id: 'support', label: 'Support', short: 'SUP', group: 'Support' },
  ],
  arenas: [{ id: 'mirage', label: 'Mirage' }, { id: 'inferno', label: 'Inferno' }, { id: 'nuke', label: 'Nuke' }, { id: 'ancient', label: 'Ancient' }, { id: 'anubis', label: 'Anubis' }, { id: 'dust2', label: 'Dust II' }, { id: 'overpass', label: 'Overpass' }, { id: 'vertigo', label: 'Vertigo' }],
  sides: [{ id: 'ct', label: 'Counter-Terrorist' }, { id: 't', label: 'Terrorist' }],
  teamSize: 5,
  metrics: [
    { id: 'rating', label: 'Rating', aggregation: 'mean', higherIsBetter: true },
    { id: 'adr', label: 'Average damage / round', aggregation: 'mean', higherIsBetter: true },
    { id: 'kast', label: 'KAST', unit: '%', aggregation: 'mean', higherIsBetter: true },
    { id: 'opening_duel_pct', label: 'Opening duel win %', unit: '%', aggregation: 'mean', higherIsBetter: true },
  ],
  adapters: [
    ...MANUAL_ADAPTERS,
    { id: 'gsi', label: 'Game State Integration (via Arena Bridge)', source: 'gsi', requiresCredentials: false, status: 'planned' },
    { id: 'demo', label: 'Demo file parsing', source: 'demo_file', requiresCredentials: false, status: 'planned' },
  ],
  liveGuidance: {
    allowed: 'ruleset-dependent',
    warning:
      "Live coaching rules differ by tournament organiser. Check your ruleset before using Live Guidance in official matches.",
  },
  depth: 'foundation',
});
