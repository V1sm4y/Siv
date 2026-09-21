export const ROLES = ['owner', 'manager', 'coach', 'analyst', 'player', 'staff', 'guest'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be assigned per team. Owner/Manager are org-level and cascade to every team. */
export const TEAM_ROLES = ['coach', 'analyst', 'player', 'staff'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Stored on `membership.role`. `member` means "look at the team role". */
export const ORG_ROLES = ['owner', 'manager', 'member', 'guest'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export interface Actor {
  userId: string;
  orgRole: OrgRole;
  /** Role on the team being acted on. Ignored for owner/manager/guest. */
  teamRole?: TeamRole | null;
}

/** Owner/Manager cascade to every team; guests stay guests; members use their team role. */
export function effectiveRole(actor: Actor): Role | null {
  switch (actor.orgRole) {
    case 'owner':
      return 'owner';
    case 'manager':
      return 'manager';
    case 'guest':
      return 'guest';
    case 'member':
      return actor.teamRole ?? null;
  }
}
