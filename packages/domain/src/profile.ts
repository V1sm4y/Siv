import { consentRecords, setTenant, users, type Db } from '@arena/db';
import type { OnboardProfileInput } from '@arena/schemas';
import { eq } from 'drizzle-orm';
import { isMinor } from './age';

export const CURRENT_TERMS_VERSION = '2026-09';

export async function completeProfile(db: Db, userId: string, input: OnboardProfileInput) {
  return db.transaction(async (tx) => {
    await setTenant(tx, { userId, orgId: '', inviteTokenHash: '', guardianTokenHash: '' });
    await tx
      .update(users)
      .set({ name: input.name, dateOfBirth: input.dateOfBirth, timezone: input.timezone, onboardedAt: new Date() })
      .where(eq(users.id, userId));
    await tx.insert(consentRecords).values([
      { userId, purpose: 'terms', version: CURRENT_TERMS_VERSION, granted: true },
      { userId, purpose: 'privacy', version: CURRENT_TERMS_VERSION, granted: true },
    ]);
    return { minor: isMinor(input.dateOfBirth) };
  });
}

export async function getUser(db: Db, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}
