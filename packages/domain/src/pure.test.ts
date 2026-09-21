import { describe, expect, it } from 'vitest';
import type { AuditLogRow } from '@arena/db';
import { ageOn, featureAllowedForUser, isMinor } from './age';
import { computeAuditHash, verifyAuditChain } from './audit';
import { stableStringify } from './crypto';
import { canInviteRole } from './invites';
import { roleChangeDenial } from './members';
import { slugify } from './slug';

describe('age & guardian gating', () => {
  const on = new Date('2026-09-21T12:00:00Z');
  it('counts whole years and handles birthdays that have not happened yet', () => {
    expect(ageOn('2008-09-21', on)).toBe(18);
    expect(ageOn('2008-09-22', on)).toBe(17);
    expect(ageOn('2000-02-29', on)).toBe(26);
  });
  it('treats <18 as a minor and unknown DOB as not a minor', () => {
    expect(isMinor('2010-01-01', on)).toBe(true);
    expect(isMinor('2008-09-21', on)).toBe(false);
    expect(isMinor(null, on)).toBe(false);
  });
  it('gates features for minors until a guardian verifies', () => {
    const minor = { dateOfBirth: '2010-01-01', guardianConsentVerified: false };
    expect(featureAllowedForUser('wellness', minor, on)).toBe(false);
    expect(featureAllowedForUser('public_profile', { ...minor, guardianConsentVerified: true }, on)).toBe(true);
    expect(featureAllowedForUser('wellness', { dateOfBirth: '1995-01-01', guardianConsentVerified: false }, on)).toBe(true);
  });
});

describe('role-change policy', () => {
  const base = { actorRole: 'owner', targetRole: 'member', newRole: 'manager', ownerCount: 1, actingOnSelf: false } as const;
  it('owner can promote a member to manager', () => expect(roleChangeDenial(base)).toBeNull());
  it('manager cannot touch managers or grant manager/owner', () => {
    expect(roleChangeDenial({ ...base, actorRole: 'manager' })).toMatch(/owner/i);
    expect(roleChangeDenial({ ...base, actorRole: 'manager', targetRole: 'manager', newRole: 'member' })).toMatch(/owner/i);
    expect(roleChangeDenial({ ...base, actorRole: 'manager', newRole: 'owner' })).toMatch(/owner/i);
  });
  it('manager can move members and guests around', () => {
    expect(roleChangeDenial({ ...base, actorRole: 'manager', targetRole: 'guest', newRole: 'member' })).toBeNull();
  });
  it('cannot demote the last owner', () => {
    expect(roleChangeDenial({ ...base, targetRole: 'owner', newRole: 'manager', ownerCount: 1 })).toMatch(/at least one owner/);
    expect(roleChangeDenial({ ...base, targetRole: 'owner', newRole: 'manager', ownerCount: 2 })).toBeNull();
  });
  it('non-admins cannot change roles', () => {
    expect(roleChangeDenial({ ...base, actorRole: 'member' })).not.toBeNull();
    expect(roleChangeDenial({ ...base, actorRole: 'guest' })).not.toBeNull();
  });
  it('invite rules', () => {
    expect(canInviteRole('owner', 'manager')).toBe(true);
    expect(canInviteRole('manager', 'manager')).toBe(false);
    expect(canInviteRole('manager', 'member')).toBe(true);
    expect(canInviteRole('member', 'guest')).toBe(false);
  });
});

describe('slugify', () => {
  it('normalises accents and punctuation', () => {
    expect(slugify('Team Liquid & Co.')).toBe('team-liquid-co');
    expect(slugify('Ünïcode Örg')).toBe('unicode-org');
  });
  it('never returns something too short', () => expect(slugify('!').length).toBeGreaterThanOrEqual(2));
});

describe('audit hash chain', () => {
  const mk = (i: number, prev: string | null): AuditLogRow => {
    const row = {
      id: `id-${i}`,
      orgId: 'o',
      actorUserId: 'u',
      action: 'x',
      resourceType: 'r',
      resourceId: String(i),
      ownerAction: false,
      metadata: { b: 1, a: 2 },
      ip: null,
      userAgent: null,
      createdAt: new Date(1_700_000_000_000 + i),
    };
    return { ...row, prevHash: prev, hash: computeAuditHash(prev, row) };
  };
  const chain = () => {
    const a = mk(1, null);
    const b = mk(2, a.hash);
    return [a, b, mk(3, b.hash)];
  };
  it('verifies an intact chain', () => expect(verifyAuditChain(chain())).toEqual({ ok: true }));
  it('detects a modified entry', () => {
    const c = chain();
    c[1] = { ...c[1]!, action: 'tampered' };
    expect(verifyAuditChain(c)).toEqual({ ok: false, brokenAt: 'id-2' });
  });
  it('detects a removed entry', () => {
    const c = chain();
    expect(verifyAuditChain([c[0]!, c[2]!])).toEqual({ ok: false, brokenAt: 'id-3' });
  });
  it('is independent of metadata key order', () => {
    expect(stableStringify({ a: 1, b: { d: 1, c: 2 } })).toBe(stableStringify({ b: { c: 2, d: 1 }, a: 1 }));
  });
});

import { lastDays } from './overview';
describe('lastDays', () => {
  it('returns n consecutive local days oldest-first, ending today in the given timezone', () => {
    const now = new Date('2026-09-22T20:30:00Z'); // already 2026-09-23 in Kolkata (UTC+5:30)
    expect(lastDays(3, 'UTC', now)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22']);
    expect(lastDays(3, 'Asia/Kolkata', now)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23']);
  });
  it('falls back to UTC for an unknown timezone instead of throwing', () => {
    expect(lastDays(1, 'Mars/Base', new Date('2026-01-05T00:00:00Z'))).toEqual(['2026-01-05']);
  });
});
