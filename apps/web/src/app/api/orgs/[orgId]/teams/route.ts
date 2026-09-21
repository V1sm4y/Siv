import { createTeam, listTeams } from '@arena/domain';
import { createTeamInput, orgParams } from '@arena/schemas';
import { defineRoute } from '@/server/define-route';

export const GET = defineRoute({
  params: orgParams,
  org: { membershipOnly: true }, // listTeams filters by the caller's role (owners/managers: all; members: theirs)
  handler: async ({ scope }) => ({ teams: await listTeams(scope) }),
});

export const POST = defineRoute({
  params: orgParams,
  body: createTeamInput,
  org: { permission: { resource: 'org_settings', action: 'write' } },
  rateLimit: { limit: 20, windowSec: 60 },
  handler: async ({ scope, body, info }) => {
    const team = await createTeam(scope, body, { ip: info.ip, userAgent: info.userAgent });
    return Response.json(team, { status: 201 });
  },
});
