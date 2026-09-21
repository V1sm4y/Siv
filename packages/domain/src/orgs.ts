import { memberships, organizations, setTenant, type Db } from '@arena/db';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { appendAudit } from './audit';
import { slugify, withSuffix } from './slug';
import { ConflictError } from './errors';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export async function createOrganization(db: Db, p: { userId: string; name: string } & RequestMeta) {
  const orgId = randomUUID();
  return db.transaction(async (tx) => {
    // The id is server-generated, so scoping the transaction to it cannot touch anyone else's data.
    await setTenant(tx, { userId: p.userId, orgId, inviteTokenHash: '', guardianTokenHash: '' });
    const base = slugify(p.name);
    let org: typeof organizations.$inferSelect | undefined;
    for (let attempt = 0; attempt < 6 && !org; attempt++) {
      [org] = await tx
        .insert(organizations)
        .values({ id: orgId, name: p.name, slug: withSuffix(base, attempt), createdBy: p.userId })
        .onConflictDoNothing({ target: organizations.slug })
        .returning();
    }
    if (!org) throw new ConflictError('Could not allocate a unique organisation URL, try another name');
    await tx.insert(memberships).values({ orgId, userId: p.userId, role: 'owner' });
    await appendAudit(tx, {
      orgId,
      actorUserId: p.userId,
      action: 'org.create',
      resourceType: 'organization',
      resourceId: orgId,
      metadata: { name: p.name },
      ip: p.ip,
      userAgent: p.userAgent,
    });
    return org;
  });
}

/** Organisations the user belongs to (RLS exposes only those). */
export async function listOrgsForUser(db: Db, userId: string) {
  return db.transaction(async (tx) => {
    await setTenant(tx, { userId, orgId: '', inviteTokenHash: '', guardianTokenHash: '' });
    return tx
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        isDemo: organizations.isDemo,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, userId), isNull(organizations.deletedAt)));
  });
}
