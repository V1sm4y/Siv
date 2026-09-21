import { acceptInvite } from '@arena/domain';
import { acceptInviteInput } from '@arena/schemas';
import { defineRoute } from '@/server/define-route';

export const POST = defineRoute({
  body: acceptInviteInput,
  rateLimit: { limit: 10, windowSec: 300 },
  handler: async ({ db, userId, body, info }) => acceptInvite(db, { token: body.token, userId, ip: info.ip, userAgent: info.userAgent }),
});
