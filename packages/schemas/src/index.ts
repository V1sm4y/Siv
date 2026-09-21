import { z } from 'zod';

export const uuid = z.uuid();

const emailField = z.string().trim().toLowerCase().pipe(z.email());

export const slug = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes only');

const name = (label: string) =>
  z.string().trim().min(2, `${label} must be at least 2 characters`).max(60, `${label} must be at most 60 characters`);

const isValidTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** YYYY-MM-DD, a real calendar date, not in the future, and at least 13 years ago. */
export const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date')
  .refine((s) => new Date(`${s}T00:00:00Z`).getTime() <= Date.now(), 'Date of birth cannot be in the future')
  .refine((s) => {
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 13);
    return new Date(`${s}T00:00:00Z`).getTime() <= cutoff.getTime();
  }, 'You must be at least 13 to use Arena OS');

export const onboardProfileInput = z.object({
  name: name('Name'),
  dateOfBirth,
  timezone: z.string().refine(isValidTimezone, 'Unknown timezone'),
  acceptTerms: z.literal(true, { error: 'You must accept the terms and privacy notice' }),
});
export type OnboardProfileInput = z.infer<typeof onboardProfileInput>;

export const createOrgInput = z.object({ name: name('Organisation name') });
export type CreateOrgInput = z.infer<typeof createOrgInput>;

export const createTeamInput = z.object({
  name: name('Team name'),
  gameId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  edition: z.string().regex(/^[a-z0-9_]+$/).optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamInput>;

export const inviteInput = z
  .object({
    email: emailField,
    orgRole: z.enum(['manager', 'member', 'guest']),
    teamId: uuid.optional(),
    teamRole: z.enum(['coach', 'analyst', 'player', 'staff']).optional(),
  })
  .refine((v) => v.orgRole !== 'member' || (v.teamId && v.teamRole), {
    path: ['teamRole'],
    message: 'Members need a team and a team role',
  });
export type InviteInput = z.infer<typeof inviteInput>;

export const acceptInviteInput = z.object({ token: z.string().min(20).max(200) });

export const changeRoleInput = z.object({ role: z.enum(['owner', 'manager', 'member', 'guest']) });
export type ChangeRoleInput = z.infer<typeof changeRoleInput>;

export const guardianRequestInput = z.object({
  guardianName: name('Guardian name'),
  guardianEmail: emailField,
});

export const orgParams = z.object({ orgId: uuid });
export const orgMemberParams = z.object({ orgId: uuid, membershipId: uuid });

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const motionPreference = z.enum(['system', 'full', 'reduced']);
export type MotionPreference = z.infer<typeof motionPreference>;
