import { changeMemberRole } from '@arena/domain';
import { changeRoleInput, orgMemberParams } from '@arena/schemas';
import { defineRoute } from '@/server/define-route';

export const PATCH = defineRoute({
  params: orgMemberParams,
  body: changeRoleInput,
  org: { permission: { resource: 'members', action: 'write' } },
  rateLimit: { limit: 30, windowSec: 60 },
  handler: async ({ scope, params, body, info }) => {
    const m = await changeMemberRole(scope, params.membershipId, body.role, { ip: info.ip, userAgent: info.userAgent });
    return { id: m.id, role: m.role };
  },
});
