import { createOrganization } from '@arena/domain';
import { createOrgInput } from '@arena/schemas';
import { defineRoute } from '@/server/define-route';

export const POST = defineRoute({
  body: createOrgInput,
  rateLimit: { limit: 5, windowSec: 60 },
  handler: async ({ db, userId, body, info }) => {
    const org = await createOrganization(db, { userId, name: body.name, ip: info.ip, userAgent: info.userAgent });
    return Response.json({ id: org.id, slug: org.slug, name: org.name }, { status: 201 });
  },
});
