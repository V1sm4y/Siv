/**
 * Demo accounts created by `pnpm seed`. Shown on the login page ONLY when ENABLE_DEV_LOGIN=true.
 * All demo data is labelled in the UI (organisations.is_demo => "DEMO DATA" badge).
 */
export const DEMO_ORG = { name: 'Nova Esports (Demo)', slug: 'nova-demo' } as const;

export const DEMO_ACCOUNTS = [
  { email: 'owner@arena.test', name: 'Riya Kapoor', label: 'Owner', orgRole: 'owner' },
  { email: 'manager@arena.test', name: 'Arjun Mehta', label: 'Manager', orgRole: 'manager' },
  { email: 'coach@arena.test', name: 'Sam Okafor', label: 'Coach (Valorant)', orgRole: 'member', team: 'valorant', teamRole: 'coach' },
  { email: 'analyst@arena.test', name: 'Mei Tanaka', label: 'Analyst (Valorant)', orgRole: 'member', team: 'valorant', teamRole: 'analyst' },
  { email: 'player@arena.test', name: 'Kabir Rao', label: 'Player (Valorant)', orgRole: 'member', team: 'valorant', teamRole: 'player', gameRoleId: 'duelist' },
  { email: 'player2@arena.test', name: 'Lena Fischer', label: 'Player (CS2)', orgRole: 'member', team: 'cs2', teamRole: 'player', gameRoleId: 'awper' },
  { email: 'guest@arena.test', name: 'Jordan Sponsor', label: 'Guest / sponsor', orgRole: 'guest' },
] as const;
