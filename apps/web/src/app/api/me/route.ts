import { guardianStatusFor, listOrgsForUser } from '@arena/domain';
import { defineRoute } from '@/server/define-route';
import { getUser } from '@arena/domain';

export const GET = defineRoute({
  handler: async ({ db, userId }) => {
    const user = await getUser(db, userId);
    const [orgs, guardian] = await Promise.all([listOrgsForUser(db, userId), guardianStatusFor(db, userId)]);
    return {
      user: user && { id: user.id, name: user.name, email: user.email, image: user.image, timezone: user.timezone, onboarded: Boolean(user.onboardedAt) },
      orgs,
      guardian,
    };
  },
});
