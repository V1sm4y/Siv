import { completeProfile } from '@arena/domain';
import { onboardProfileInput } from '@arena/schemas';
import { defineRoute } from '@/server/define-route';

export const POST = defineRoute({
  body: onboardProfileInput,
  rateLimit: { limit: 10, windowSec: 60 },
  handler: ({ db, userId, body }) => completeProfile(db, userId, body),
});
