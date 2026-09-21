import { guardianConsents, setTenant, users, type Db } from '@arena/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { randomToken, sha256Hex } from './crypto';
import { NotFoundError } from './errors';
import { isMinor } from './age';

export const GUARDIAN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function requestGuardianConsent(db: Db, p: { userId: string; guardianName: string; guardianEmail: string }) {
  const token = randomToken();
  await db.transaction(async (tx) => {
    await setTenant(tx, { userId: p.userId, orgId: '', inviteTokenHash: '', guardianTokenHash: '' });
    await tx.insert(guardianConsents).values({
      playerUserId: p.userId,
      guardianName: p.guardianName,
      guardianEmail: p.guardianEmail,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + GUARDIAN_TTL_MS),
    });
  });
  return { token };
}

/** Called from the public guardian page; the token is the only credential. */
export async function verifyGuardianConsent(db: Db, token: string) {
  const tokenHash = sha256Hex(token);
  return db.transaction(async (tx) => {
    await setTenant(tx, { userId: '', orgId: '', inviteTokenHash: '', guardianTokenHash: tokenHash });
    const [row] = await tx.select().from(guardianConsents).where(eq(guardianConsents.tokenHash, tokenHash)).limit(1);
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) throw new NotFoundError('Consent request');
    if (!row.verifiedAt) {
      await tx.update(guardianConsents).set({ verifiedAt: new Date() }).where(eq(guardianConsents.id, row.id));
    }
    return { guardianName: row.guardianName };
  });
}

export async function guardianStatusFor(db: Db, userId: string) {
  return db.transaction(async (tx) => {
    await setTenant(tx, { userId, orgId: '', inviteTokenHash: '', guardianTokenHash: '' });
    const [u] = await tx.select({ dob: users.dateOfBirth }).from(users).where(eq(users.id, userId)).limit(1);
    const minor = isMinor(u?.dob);
    if (!minor) return { minor: false, verified: true, pending: false } as const;
    const [latest] = await tx
      .select()
      .from(guardianConsents)
      .where(and(eq(guardianConsents.playerUserId, userId), isNull(guardianConsents.revokedAt)))
      .orderBy(desc(guardianConsents.requestedAt))
      .limit(1);
    return { minor: true, verified: Boolean(latest?.verifiedAt), pending: Boolean(latest && !latest.verifiedAt) } as const;
  });
}
