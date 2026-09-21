import type { OrgRole } from '@arena/authz';

export interface ShellTeam {
  id: string;
  slug: string;
  name: string;
  gameId: string;
  edition: string | null;
}
export interface ShellData {
  org: { id: string; name: string; slug: string; isDemo: boolean };
  role: OrgRole;
  teams: ShellTeam[];
  user: { id: string; name: string | null; email: string | null; image: string | null };
  canManage: boolean;
  canCreateTeams: boolean;
  canReadAudit: boolean;
  guardian: { minor: boolean; verified: boolean; pending: boolean };
}
