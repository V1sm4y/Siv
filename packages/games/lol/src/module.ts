import { defineGameModule, MANUAL_ADAPTERS } from '@arena/game-sdk';

// Depth: foundation. Foundation only (identity, theme, roles, arenas, metric definitions); depth arrives in M6.
export default defineGameModule({
  id: 'lol',
  name: 'League of Legends',
  shortName: 'LOL',
  theme: {
    accent: '#1FD1C1',
    accentFg: '#0B0D12',
    accentText: '#1FD1C1',
    accentTextLight: '#00766D',
    gradient: ['#1FD1C1', '#0E3B5C', '#0F1117'],
    icon: 'shield',
  },
  roles: [
    { id: 'top', label: 'Top', short: 'TOP' },
    { id: 'jungle', label: 'Jungle', short: 'JGL' },
    { id: 'mid', label: 'Mid', short: 'MID' },
    { id: 'bot', label: 'Bot (ADC)', short: 'BOT' },
    { id: 'support', label: 'Support', short: 'SUP' },
  ],
  arenas: [{ id: 'summoners_rift', label: "Summoner's Rift" }],
  sides: [{ id: 'blue', label: 'Blue side' }, { id: 'red', label: 'Red side' }],
  teamSize: 5,
  metrics: [
    { id: 'cspm', label: 'CS / min', aggregation: 'mean', higherIsBetter: true },
    { id: 'kda', label: 'KDA', aggregation: 'ratio', higherIsBetter: true },
    { id: 'dmg_share', label: 'Damage share', unit: '%', aggregation: 'mean', higherIsBetter: true },
    { id: 'vision_score_pm', label: 'Vision score / min', aggregation: 'mean', higherIsBetter: true },
  ],
  adapters: [
    ...MANUAL_ADAPTERS,
    { id: 'riot', label: 'Riot API (RSO opt-in)', source: 'riot_api', requiresCredentials: true, status: 'planned' },
  ],
  liveGuidance: {
    allowed: 'ruleset-dependent',
    warning:
      "Coach communication during live League of Legends matches is restricted by most rulesets. Confirm before using Live Guidance.",
  },
  depth: 'foundation',
});
