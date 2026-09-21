import { getUser, requestGuardianConsent } from '@arena/domain';
import { guardianRequestInput } from '@arena/schemas';
import { defineRoute } from '@/server/define-route';
import { sendGuardianEmail } from '@/server/mail';

export const POST = defineRoute({
  body: guardianRequestInput,
  // Sends email to a third party: keep this tight to prevent abuse as a spam relay.
  rateLimit: { limit: 3, windowSec: 3600 },
  handler: async ({ db, userId, body }) => {
    const user = await getUser(db, userId);
    const { token } = await requestGuardianConsent(db, { userId, ...body });
    await sendGuardianEmail(body.guardianEmail, body.guardianName, user?.name ?? 'A player', token);
    return { ok: true };
  },
});
