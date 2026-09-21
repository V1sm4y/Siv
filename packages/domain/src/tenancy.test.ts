import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditLog, guardianConsents, invites, memberships, organizations, setTenant, teams, withTenant,
} from '@arena/db';
import { eq } from 'drizzle-orm';
import { join, makeOrg, makeTeam, makeUser, testDbs, uniq } from './test/helpers';
import { sha256Hex } from './crypto';

/** Connects as the RUNTIME role (arena_app) so RLS is actually in force. */
const dbs = testDbs();
const { admin, app } = dbs;
afterAll(() => dbs.close());

async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { cause?: { message?: string }; message?: string };
    return err.cause?.message ?? err.message ?? 'unknown';
  }
  return 'NO_ERROR';
}

describe('row-level security (runtime role)', () => {
  let orgA: Awaited<ReturnType<typeof makeOrg>>, orgB: Awaited<ReturnType<typeof makeOrg>>;
  let alice: Awaited<ReturnType<typeof makeUser>>, bob: Awaited<ReturnType<typeof makeUser>>;
  let teamA: Awaited<ReturnType<typeof makeTeam>>, teamB: Awaited<ReturnType<typeof makeTeam>>;

  beforeAll(async () => {
    orgA = await makeOrg(admin, uniq('A'));
    orgB = await makeOrg(admin, uniq('B'));
    alice = await makeUser(admin, 'alice');
    bob = await makeUser(admin, 'bob');
    await join(admin, orgA.id, alice.id, 'owner');
    await join(admin, orgB.id, bob.id, 'owner');
    teamA = await makeTeam(admin, orgA.id);
    teamB = await makeTeam(admin, orgB.id);
  });

  it('the runtime role is not a superuser and cannot bypass RLS', async () => {
    const [r] = await app.client`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('returns nothing without a tenant context (deny by default)', async () => {
    expect(await app.db.select().from(teams)).toHaveLength(0);
    expect(await app.db.select().from(organizations)).toHaveLength(0);
    expect(await app.db.select().from(memberships)).toHaveLength(0);
  });

  it('shows only the current org’s rows', async () => {
    const rows = await withTenant(app.db, { orgId: orgA.id, userId: alice.id }, (tx) => tx.select().from(teams));
    expect(rows.map((r) => r.id)).toEqual([teamA.id]);
    expect(rows.some((r) => r.id === teamB.id)).toBe(false);
  });

  it('a user cannot see another org’s organisation row or memberships, even with a missing WHERE clause', async () => {
    const orgs = await withTenant(app.db, { userId: alice.id }, (tx) => tx.select().from(organizations));
    expect(orgs.map((o) => o.id)).toEqual([orgA.id]);
    const ms = await withTenant(app.db, { userId: alice.id }, (tx) => tx.select().from(memberships));
    expect(ms.every((m) => m.userId === alice.id)).toBe(true);
  });

  it('blocks writing a row into another org (WITH CHECK)', async () => {
    const err = await pgError(
      withTenant(app.db, { orgId: orgA.id, userId: alice.id }, (tx) =>
        tx.insert(teams).values({ orgId: orgB.id, gameId: 'cs2', name: 'x', slug: uniq('x') }),
      ),
    );
    expect(err).toMatch(/row-level security/);
  });

  it('cannot update or delete another org’s rows (they are invisible)', async () => {
    const upd = await withTenant(app.db, { orgId: orgA.id, userId: alice.id }, (tx) =>
      tx.update(teams).set({ name: 'pwned' }).where(eq(teams.id, teamB.id)).returning(),
    );
    expect(upd).toHaveLength(0);
    const [still] = await admin.db.select().from(teams).where(eq(teams.id, teamB.id));
    expect(still?.name).toBe('Team');
  });

  it('audit log is append-only for the runtime role and org-scoped', async () => {
    const insert = () =>
      withTenant(app.db, { orgId: orgA.id, userId: alice.id }, (tx) =>
        tx.insert(auditLog).values({ orgId: orgA.id, action: 'x', resourceType: 'y', hash: 'h', createdAt: new Date() }),
      );
    expect(await pgError(insert())).toBe('NO_ERROR');
    expect(
      await pgError(withTenant(app.db, { orgId: orgA.id }, (tx) => tx.update(auditLog).set({ action: 'z' }))),
    ).toMatch(/permission denied/);
    expect(await pgError(withTenant(app.db, { orgId: orgA.id }, (tx) => tx.delete(auditLog)))).toMatch(/permission denied/);
    const other = await withTenant(app.db, { orgId: orgB.id }, (tx) => tx.select().from(auditLog));
    expect(other.some((r) => r.orgId === orgA.id)).toBe(false);
  });

  it('an invite is visible only to whoever presents its token hash', async () => {
    const token = uniq('tok');
    await admin.db.insert(invites).values({
      orgId: orgA.id, email: 'x@y.z', orgRole: 'guest', tokenHash: sha256Hex(token), invitedBy: alice.id,
      expiresAt: new Date(Date.now() + 1e6),
    });
    expect(await withTenant(app.db, { userId: bob.id }, (tx) => tx.select().from(invites))).toHaveLength(0);
    expect(
      await withTenant(app.db, { userId: bob.id, inviteTokenHash: sha256Hex('wrong') }, (tx) => tx.select().from(invites)),
    ).toHaveLength(0);
    const hit = await withTenant(app.db, { userId: bob.id, inviteTokenHash: sha256Hex(token) }, (tx) =>
      tx.select().from(invites),
    );
    expect(hit).toHaveLength(1);
  });

  it('guardian consent rows are visible only to the player or the token holder', async () => {
    const token = uniq('g');
    await admin.db.insert(guardianConsents).values({
      playerUserId: alice.id, guardianName: 'G', guardianEmail: 'g@x.y', tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 1e6),
    });
    expect(await withTenant(app.db, { userId: bob.id }, (tx) => tx.select().from(guardianConsents))).toHaveLength(0);
    expect(await withTenant(app.db, { userId: alice.id }, (tx) => tx.select().from(guardianConsents))).toHaveLength(1);
    expect(
      await withTenant(app.db, { guardianTokenHash: sha256Hex(token) }, (tx) => tx.select().from(guardianConsents)),
    ).toHaveLength(1);
  });

  it('tenant variables are transaction-local and do not leak across pooled connections', async () => {
    await withTenant(app.db, { orgId: orgA.id, userId: alice.id }, async (tx) => {
      await setTenant(tx, { orgId: orgA.id });
    });
    expect(await app.db.select().from(teams)).toHaveLength(0);
  });
});
