/**
 * Demo data. Everything created here is flagged (`organizations.is_demo`) and the UI shows a persistent
 * "DEMO DATA" badge. Idempotent: re-running replaces the demo org. Uses the ADMIN connection.
 */
import { createDb, DEMO_ACCOUNTS, DEMO_ORG, memberships, organizations, teamMemberships, teams, users } from '@arena/db';
import { eq } from 'drizzle-orm';
import { appendAudit } from './audit';

const url = process.env.DATABASE_URL_ADMIN;
if (!url) throw new Error('DATABASE_URL_ADMIN is required to seed');
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');

const { db, close } = createDb(url, { max: 2 });

await db.transaction(async (tx) => {
  await tx.delete(organizations).where(eq(organizations.slug, DEMO_ORG.slug)); // cascades

  const byEmail = new Map<string, string>();
  for (const a of DEMO_ACCOUNTS) {
    const [u] = await tx
      .insert(users)
      .values({ email: a.email, name: a.name, emailVerified: new Date(), dateOfBirth: '1999-06-15', timezone: 'Asia/Kolkata', onboardedAt: new Date() })
      .onConflictDoUpdate({ target: users.email, set: { name: a.name, onboardedAt: new Date() } })
      .returning({ id: users.id });
    byEmail.set(a.email, u!.id);
  }
  const ownerId = byEmail.get('owner@arena.test')!;

  const [org] = await tx
    .insert(organizations)
    .values({ name: DEMO_ORG.name, slug: DEMO_ORG.slug, isDemo: true, createdBy: ownerId })
    .returning();
  const orgId = org!.id;
  await appendAudit(tx, { orgId, actorUserId: ownerId, action: 'org.create', resourceType: 'organization', resourceId: orgId, metadata: { name: DEMO_ORG.name, demo: true } });

  const teamRows = await tx
    .insert(teams)
    .values([
      { orgId, gameId: 'valorant', name: 'Nova Valorant', slug: 'nova-valorant' },
      { orgId, gameId: 'cs2', name: 'Nova CS2', slug: 'nova-cs2' },
    ])
    .returning();
  const teamByGame = new Map(teamRows.map((t) => [t.gameId, t]));
  for (const t of teamRows) {
    await appendAudit(tx, { orgId, actorUserId: ownerId, action: 'team.create', resourceType: 'team', resourceId: t.id, metadata: { gameId: t.gameId, name: t.name } });
  }

  await tx.insert(memberships).values(DEMO_ACCOUNTS.map((a) => ({ orgId, userId: byEmail.get(a.email)!, role: a.orgRole })));
  await tx.insert(teamMemberships).values(
    DEMO_ACCOUNTS.filter((a) => 'team' in a).map((a) => ({
      orgId,
      teamId: teamByGame.get((a as { team: string }).team)!.id,
      userId: byEmail.get(a.email)!,
      role: (a as { teamRole: string }).teamRole,
      gameRoleId: (a as { gameRoleId?: string }).gameRoleId ?? null,
    })),
  );
});

await close();
console.log(`Seeded demo org "${DEMO_ORG.name}" (/app/${DEMO_ORG.slug}) with ${DEMO_ACCOUNTS.length} accounts. Sign in via the demo panel on /login.`);
