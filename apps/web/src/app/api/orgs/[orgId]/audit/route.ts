import { listAudit } from '@arena/domain';
import { orgParams, paginationQuery } from '@arena/schemas';
import { defineRoute } from '@/server/define-route';

export const GET = defineRoute({
  params: orgParams,
  query: paginationQuery,
  org: { permission: { resource: 'audit_log', action: 'read' } },
  handler: async ({ scope, query }) => {
    // Managers never see owner-only entries; the permission check above already gates the route itself.
    const includeOwnerActions = scope.actor.orgRole === 'owner';
    const entries = await listAudit(scope.tx, scope.orgId, { limit: query.limit, includeOwnerActions });
    return { entries: entries.map(({ ip: _ip, userAgent: _ua, ...e }) => e), chainVerifiable: includeOwnerActions };
  },
});
