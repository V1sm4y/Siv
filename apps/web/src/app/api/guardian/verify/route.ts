import { verifyGuardianConsent } from '@arena/domain';
import { z } from 'zod';
import { definePublicRoute } from '@/server/define-route';

export const POST = definePublicRoute({
  body: z.object({ token: z.string().min(20).max(200) }),
  rateLimit: { limit: 10, windowSec: 300 },
  handler: ({ db, body }) => verifyGuardianConsent(db, body.token),
});
