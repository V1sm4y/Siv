import { describe, expect, it } from 'vitest';
import { can, MATRIX, RESOURCES, ROLE_COLUMNS, levelFor, type Actor, type Level, type Resource } from './index';

const U = 'user-1';
const OTHER = 'user-2';

function actorFor(role: (typeof ROLE_COLUMNS)[number]): Actor {
  if (role === 'owner' || role === 'manager' || role === 'guest') return { userId: U, orgRole: role };
  return { userId: U, orgRole: 'member', teamRole: role };
}

/** Independent statement of what each level should permit; keeps the test from mirroring the impl. */
const EXPECT: Record<Level, { withoutCtx: string[]; withCtx: string[]; ctx: object }> = {
  none: { withoutCtx: [], withCtx: [], ctx: { ownerId: U, shared: true, published: true, assigned: true, hasGrant: true } },
  read: { withoutCtx: ['read'], withCtx: ['read'], ctx: {} },
  write: { withoutCtx: ['read', 'write'], withCtx: ['read', 'write'], ctx: {} },
  own: { withoutCtx: [], withCtx: ['read', 'write'], ctx: { ownerId: U } },
  grant: { withoutCtx: [], withCtx: ['read'], ctx: { hasGrant: true } },
  shared: { withoutCtx: [], withCtx: ['read'], ctx: { shared: true } },
  published: { withoutCtx: [], withCtx: ['read'], ctx: { published: true } },
  assigned: { withoutCtx: [], withCtx: ['read', 'write'], ctx: { assigned: true } },
  authored: { withoutCtx: [], withCtx: ['read', 'write'], ctx: { ownerId: U } },
  send: { withoutCtx: ['send', 'receive'], withCtx: ['send', 'receive'], ctx: {} },
  receive: { withoutCtx: ['receive'], withCtx: ['receive'], ctx: {} },
};
const ACTIONS = ['read', 'write', 'send', 'receive'] as const;

describe('permission matrix (generated from data)', () => {
  for (const resource of RESOURCES) {
    for (const role of ROLE_COLUMNS) {
      const level = levelFor(role, resource);
      it(`${role} × ${resource} = ${level}`, () => {
        const actor = actorFor(role);
        const e = EXPECT[level];
        for (const a of ACTIONS) {
          expect(can(actor, a, resource, {}), `${a} without ctx`).toBe(e.withoutCtx.includes(a));
          expect(can(actor, a, resource, e.ctx), `${a} with ctx`).toBe(e.withCtx.includes(a));
        }
      });
    }
  }

  it('every resource has exactly one row of 7 levels', () => {
    for (const r of RESOURCES) expect(MATRIX[r]).toHaveLength(7);
  });
});

describe('named guarantees from the brief', () => {
  const owner = actorFor('owner');
  const manager = actorFor('manager');
  const player = actorFor('player');
  const guest = actorFor('guest');
  const coach = actorFor('coach');

  it('a Player cannot read contracts, even ones that concern them', () => {
    expect(can(player, 'read', 'contracts', { ownerId: U, shared: true, hasGrant: true })).toBe(false);
    expect(can(player, 'read', 'payments', { ownerId: U })).toBe(false);
  });
  it('only Owner and Manager can touch contracts', () => {
    expect(can(owner, 'write', 'contracts')).toBe(true);
    expect(can(manager, 'write', 'contracts')).toBe(true);
    for (const r of ['coach', 'analyst', 'staff', 'guest'] as const) {
      expect(can(actorFor(r), 'read', 'contracts')).toBe(false);
    }
  });
  it('a Guest cannot post in chat but can read', () => {
    expect(can(guest, 'write', 'chat')).toBe(false);
    expect(can(guest, 'read', 'chat')).toBe(true);
  });
  it('only Coach and Analyst (and Owner) edit strats; Manager and Player only read', () => {
    expect(can(coach, 'write', 'strats')).toBe(true);
    expect(can(actorFor('analyst'), 'write', 'strats')).toBe(true);
    expect(can(manager, 'write', 'strats')).toBe(false);
    expect(can(player, 'write', 'strats')).toBe(false);
  });
  it('wellness: Owner and Manager have no default access; grants unlock read for staff only', () => {
    expect(can(owner, 'read', 'wellness', { hasGrant: true })).toBe(false);
    expect(can(manager, 'read', 'wellness', { hasGrant: true })).toBe(false);
    expect(can(coach, 'read', 'wellness')).toBe(false);
    expect(can(coach, 'read', 'wellness', { hasGrant: true })).toBe(true);
    expect(can(coach, 'write', 'wellness', { hasGrant: true })).toBe(false);
  });
  it("a Player can only read/write their own wellness data", () => {
    expect(can(player, 'write', 'wellness', { ownerId: U })).toBe(true);
    expect(can(player, 'read', 'wellness', { ownerId: OTHER })).toBe(false);
  });
  it('managers cannot see owner-only audit entries', () => {
    expect(can(manager, 'read', 'audit_log', { ownerAction: true })).toBe(false);
    expect(can(manager, 'read', 'audit_log')).toBe(true);
    expect(can(owner, 'read', 'audit_log', { ownerAction: true })).toBe(true);
  });
  it('players receive live guidance but cannot send it', () => {
    expect(can(player, 'receive', 'live_guidance')).toBe(true);
    expect(can(player, 'send', 'live_guidance')).toBe(false);
    expect(can(coach, 'send', 'live_guidance')).toBe(true);
  });
  it('a 1:1 note is only visible to the player when shared, and never to other coaches', () => {
    expect(can(player, 'read', 'one_on_one')).toBe(false);
    expect(can(player, 'read', 'one_on_one', { shared: true })).toBe(true);
    expect(can(coach, 'read', 'one_on_one', { ownerId: OTHER })).toBe(false);
  });
  it('billing is owner-only', () => {
    expect(can(owner, 'write', 'billing')).toBe(true);
    expect(can(manager, 'read', 'billing')).toBe(false);
  });
});

describe('deny by default', () => {
  it('no actor', () => {
    expect(can(null, 'read', 'chat')).toBe(false);
    expect(can(undefined, 'read', 'chat')).toBe(false);
  });
  it('member with no team role', () => {
    expect(can({ userId: U, orgRole: 'member' }, 'read', 'chat')).toBe(false);
  });
  it('a team role on an owner does not downgrade them (cascade)', () => {
    expect(can({ userId: U, orgRole: 'owner', teamRole: 'player' }, 'write', 'contracts')).toBe(true);
  });
  it('unknown resource is denied', () => {
    expect(can(actorFor('owner'), 'read', 'nope' as Resource)).toBe(false);
  });
});
