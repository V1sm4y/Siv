import { describe, expect, it } from 'vitest';
import { dateOfBirth, inviteInput, onboardProfileInput } from './index';

describe('dateOfBirth', () => {
  it('accepts a normal adult date', () => expect(dateOfBirth.safeParse('2001-04-12').success).toBe(true));
  it('rejects impossible dates', () => expect(dateOfBirth.safeParse('2001-02-31').success).toBe(false));
  it('rejects future dates', () => expect(dateOfBirth.safeParse('2999-01-01').success).toBe(false));
  it('rejects under 13', () => {
    const y = new Date().getUTCFullYear() - 10;
    expect(dateOfBirth.safeParse(`${y}-01-01`).success).toBe(false);
  });
  it('accepts 16 (minor, allowed with guardian consent)', () => {
    const y = new Date().getUTCFullYear() - 16;
    expect(dateOfBirth.safeParse(`${y}-01-01`).success).toBe(true);
  });
});

describe('inviteInput', () => {
  const teamId = '0198f3a2-0000-7000-8000-000000000001';
  it('lowercases the email', () => {
    const r = inviteInput.parse({ email: ' Coach@Example.COM ', orgRole: 'guest' });
    expect(r.email).toBe('coach@example.com');
  });
  it('members need a team and role', () => {
    expect(inviteInput.safeParse({ email: 'a@b.co', orgRole: 'member' }).success).toBe(false);
    expect(inviteInput.safeParse({ email: 'a@b.co', orgRole: 'member', teamId, teamRole: 'player' }).success).toBe(true);
  });
  it('cannot invite an owner', () => {
    expect(inviteInput.safeParse({ email: 'a@b.co', orgRole: 'owner' }).success).toBe(false);
  });
});

describe('onboardProfileInput', () => {
  it('requires terms acceptance and a valid timezone', () => {
    const base = { name: 'Ana', dateOfBirth: '2000-01-01', timezone: 'Asia/Kolkata', acceptTerms: true };
    expect(onboardProfileInput.safeParse(base).success).toBe(true);
    expect(onboardProfileInput.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(onboardProfileInput.safeParse({ ...base, timezone: 'Mars/Base' }).success).toBe(false);
  });
});
