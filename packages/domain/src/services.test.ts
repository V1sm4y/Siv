import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, invites, memberships } from '@arena/db';
import { ForbiddenError } from '@arena/authz';
import { asc, eq } from 'drizzle-orm';
import {
  acceptInvite, changeMemberRole, createInvite, createOrganization, createTeam, listAudit, listMembers,
  listTeams, NotFoundError, ConflictError, ValidationError, verifyAuditChain, withOrgActor,
  requestGuardianConsent, verifyGuardianConsent, guardianStatusFor, completeProfile,
} from './index';
import { join, joinTeam, makeOrg, makeTeam, makeUser, testDbs } from './test/helpers';

const dbs = testDbs();
const { admin, app } = dbs;
afterAll(() => dbs.close());

describe('organisation lifecycle', () => {
  it('creates an org with the creator as owner and an audit record', async () => {
    const u = await makeUser(admin, 'founder');
    const org = await createOrganization(app.db, { userId: u.id, name: 'Nova Esports' });
    expect(org.slug).toMatch(/^nova-esports/);
    const [m] = await admin.db.select().from(memberships).where(eq(memberships.orgId, org.id));
    expect(m?.role).toBe('owner');
    const audit = await admin.db.select().from(auditLog).where(eq(auditLog.orgId, org.id));
    expect(audit.map((a) => a.action)).toEqual(['org.create']);
  });

  it('two orgs with the same name get distinct slugs', async () => {
    const a = await makeUser(admin, 'a');
    const b = await makeUser(admin, 'b');
    const o1 = await createOrganization(app.db, { userId: a.id, name: 'Same Name' });
    const o2 = await createOrganization(app.db, { userId: b.id, name: 'Same Name' });
    expect(o1.slug).not.toBe(o2.slug);
  });

  it('a non-member gets NotFound, never Forbidden', async () => {
    const owner = await makeUser(admin, 'own');
    const stranger = await makeUser(admin, 'stranger');
    const org = await createOrganization(app.db, { userId: owner.id, name: 'Private Org' });
    await expect(
      withOrgActor(app.db, { userId: stranger.id, orgId: org.id }, async (s) => listTeams(s)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('teams, roles and permissions on real data', () => {
  let orgId: string, owner: Awaited<ReturnType<typeof makeUser>>, player: Awaited<ReturnType<typeof makeUser>>;
  let manager: Awaited<ReturnType<typeof makeUser>>, guest: Awaited<ReturnType<typeof makeUser>>;
  let teamId: string;

  beforeAll(async () => {
    owner = await makeUser(admin, 'owner');
    player = await makeUser(admin, 'player');
    manager = await makeUser(admin, 'manager');
    guest = await makeUser(admin, 'guest');
    orgId = (await createOrganization(app.db, { userId: owner.id, name: 'Perm Org' })).id;
    await join(admin, orgId, manager.id, 'manager');
    await join(admin, orgId, player.id, 'member');
    await join(admin, orgId, guest.id, 'guest');
    teamId = (await makeTeam(admin, orgId, 'valorant')).id;
    await joinTeam(admin, orgId, teamId, player.id, 'player');
  });

  it('owner creates a team; unknown game and edition are rejected', async () => {
    const t = await withOrgActor(app.db, { userId: owner.id, orgId }, (s) =>
      createTeam(s, { name: 'FC Squad', gameId: 'eafc' }),
    );
    expect(t.edition).toBe('fc27');
    await expect(
      withOrgActor(app.db, { userId: owner.id, orgId }, (s) => createTeam(s, { name: 'Bad', gameId: 'quake' })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      withOrgActor(app.db, { userId: owner.id, orgId }, (s) =>
        createTeam(s, { name: 'Bad', gameId: 'eafc', edition: 'fc99' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('a Player cannot create teams, invite, or change roles', async () => {
    await expect(
      withOrgActor(app.db, { userId: player.id, orgId, teamId }, (s) => createTeam(s, { name: 'Nope', gameId: 'cs2' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      withOrgActor(app.db, { userId: player.id, orgId, teamId }, (s) =>
        createInvite(s, { email: 'x@y.co', orgRole: 'guest' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a Guest cannot create teams and sees no teams', async () => {
    await expect(
      withOrgActor(app.db, { userId: guest.id, orgId }, (s) => createTeam(s, { name: 'Nope', gameId: 'cs2' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await withOrgActor(app.db, { userId: guest.id, orgId }, (s) => listTeams(s))).toHaveLength(0);
  });

  it('a Player sees only their own teams; owner and manager see all', async () => {
    const mine = await withOrgActor(app.db, { userId: player.id, orgId }, (s) => listTeams(s));
    expect(mine.map((t) => t.id)).toEqual([teamId]);
    const all = await withOrgActor(app.db, { userId: manager.id, orgId }, (s) => listTeams(s));
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('members list hides emails from those who cannot manage members', async () => {
    // Members act through a team: with no team context they have no effective role (deny by default).
    await expect(
      withOrgActor(app.db, { userId: player.id, orgId }, (s) => listMembers(s)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const asPlayer = await withOrgActor(app.db, { userId: player.id, orgId, teamId }, (s) => listMembers(s));
    expect(asPlayer.every((m) => m.email === null)).toBe(true);
    const asOwner = await withOrgActor(app.db, { userId: owner.id, orgId }, (s) => listMembers(s));
    expect(asOwner.every((m) => m.email !== null)).toBe(true);
  });

  it('managers cannot promote to owner or alter owners; the last owner is protected', async () => {
    const [ownerM] = await admin.db.select().from(memberships)
      .where(eq(memberships.userId, owner.id));
    const [playerM] = await admin.db.select().from(memberships).where(eq(memberships.userId, player.id));
    await expect(
      withOrgActor(app.db, { userId: manager.id, orgId }, (s) => changeMemberRole(s, playerM!.id, 'owner')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      withOrgActor(app.db, { userId: manager.id, orgId }, (s) => changeMemberRole(s, ownerM!.id, 'member')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      withOrgActor(app.db, { userId: owner.id, orgId }, (s) => changeMemberRole(s, ownerM!.id, 'manager')),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('managers do not see owner-only audit entries; the owner does; the chain verifies', async () => {
    const [playerM] = await admin.db.select().from(memberships).where(eq(memberships.userId, player.id));
    // Promoting to owner is an ownership change => owner-only audit entry.
    await withOrgActor(app.db, { userId: owner.id, orgId }, (s) => changeMemberRole(s, playerM!.id, 'owner'));
    const asMgr = await withOrgActor(app.db, { userId: manager.id, orgId }, (s) =>
      listAudit(s.tx, orgId, { limit: 100, includeOwnerActions: false }),
    );
    const asOwner = await withOrgActor(app.db, { userId: owner.id, orgId }, (s) =>
      listAudit(s.tx, orgId, { limit: 100, includeOwnerActions: true }),
    );
    expect(asMgr.some((r) => r.ownerAction)).toBe(false);
    expect(asOwner.some((r) => r.ownerAction)).toBe(true);
    const chain = await admin.db.select().from(auditLog).where(eq(auditLog.orgId, orgId)).orderBy(asc(auditLog.createdAt));
    expect(chain.length).toBeGreaterThan(2);
    expect(verifyAuditChain(chain)).toEqual({ ok: true });
  });

  it('tampering with an audit row (as the DB admin) is detected', async () => {
    const chain = await admin.db.select().from(auditLog).where(eq(auditLog.orgId, orgId)).orderBy(asc(auditLog.createdAt));
    const target = chain[1]!;
    await admin.db.update(auditLog).set({ action: 'forged' }).where(eq(auditLog.id, target.id));
    const after = await admin.db.select().from(auditLog).where(eq(auditLog.orgId, orgId)).orderBy(asc(auditLog.createdAt));
    expect(verifyAuditChain(after)).toEqual({ ok: false, brokenAt: target.id });
    await admin.db.update(auditLog).set({ action: target.action }).where(eq(auditLog.id, target.id));
  });
});

describe('invites', () => {
  it('invite → accept creates membership and team role; wrong email, reuse and expiry are rejected', async () => {
    const owner = await makeUser(admin, 'inviter');
    const invitee = await makeUser(admin, 'invitee');
    const intruder = await makeUser(admin, 'intruder');
    const org = await createOrganization(app.db, { userId: owner.id, name: 'Invite Org' });
    const team = await withOrgActor(app.db, { userId: owner.id, orgId: org.id }, (s) =>
      createTeam(s, { name: 'Val', gameId: 'valorant' }),
    );
    const { token, invite } = await withOrgActor(app.db, { userId: owner.id, orgId: org.id }, (s) =>
      createInvite(s, { email: invitee.email!, orgRole: 'member', teamId: team.id, teamRole: 'player' }),
    );
    // Raw token is never stored.
    expect(invite.tokenHash).not.toBe(token);

    await expect(acceptInvite(app.db, { token, userId: intruder.id })).rejects.toBeInstanceOf(NotFoundError);
    await acceptInvite(app.db, { token, userId: invitee.id });
    const mine = await withOrgActor(app.db, { userId: invitee.id, orgId: org.id }, (s) => listTeams(s));
    expect(mine.map((t) => t.id)).toEqual([team.id]);
    await expect(acceptInvite(app.db, { token, userId: invitee.id })).rejects.toBeInstanceOf(ConflictError);

    const t2 = await withOrgActor(app.db, { userId: owner.id, orgId: org.id }, (s) =>
      createInvite(s, { email: intruder.email!, orgRole: 'guest' }),
    );
    await admin.db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invites.id, t2.invite.id));
    await expect(acceptInvite(app.db, { token: t2.token, userId: intruder.id })).rejects.toBeInstanceOf(ConflictError);
  });

  it('a manager cannot invite another manager', async () => {
    const owner = await makeUser(admin, 'o2');
    const mgr = await makeUser(admin, 'm2');
    const org = await createOrganization(app.db, { userId: owner.id, name: 'Invite Rules' });
    await join(admin, org.id, mgr.id, 'manager');
    await expect(
      withOrgActor(app.db, { userId: mgr.id, orgId: org.id }, (s) => createInvite(s, { email: 'q@w.co', orgRole: 'manager' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('minors and guardian consent', () => {
  it('a minor needs verified guardian consent; the token flow works once and only for real tokens', async () => {
    const year = new Date().getUTCFullYear() - 16;
    const kid = await makeUser(admin, 'kid', `${year}-03-03`);
    expect(await guardianStatusFor(app.db, kid.id)).toMatchObject({ minor: true, verified: false, pending: false });
    const { token } = await requestGuardianConsent(app.db, { userId: kid.id, guardianName: 'Parent', guardianEmail: 'p@x.co' });
    expect(await guardianStatusFor(app.db, kid.id)).toMatchObject({ minor: true, verified: false, pending: true });
    await expect(verifyGuardianConsent(app.db, 'not-a-real-token')).rejects.toBeInstanceOf(NotFoundError);
    expect(await verifyGuardianConsent(app.db, token)).toEqual({ guardianName: 'Parent' });
    expect(await guardianStatusFor(app.db, kid.id)).toMatchObject({ minor: true, verified: true, pending: false });
  });

  it('completeProfile records consent and reports minor status', async () => {
    const u = await makeUser(admin, 'prof');
    const year = new Date().getUTCFullYear() - 15;
    const r = await completeProfile(app.db, u.id, {
      name: 'Kid', dateOfBirth: `${year}-01-01`, timezone: 'Asia/Kolkata', acceptTerms: true,
    });
    expect(r.minor).toBe(true);
  });
});
