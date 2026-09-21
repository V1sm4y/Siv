/** Whole years between a YYYY-MM-DD date of birth and `on` (UTC), without float or timezone drift. */
export function ageOn(dob: string, on: Date = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  let age = on.getUTCFullYear() - y;
  const beforeBirthday = on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export const isMinor = (dob: string | null | undefined, on?: Date): boolean =>
  dob ? ageOn(dob, on) < 18 : false;

/** Features that stay off for a minor until a guardian has verifiably consented. */
export const GUARDIAN_GATED_FEATURES = ['wellness', 'public_profile', 'external_sharing', 'voice_recording'] as const;
export type GuardianGatedFeature = (typeof GUARDIAN_GATED_FEATURES)[number];

export function featureAllowedForUser(
  feature: GuardianGatedFeature,
  user: { dateOfBirth: string | null | undefined; guardianConsentVerified: boolean },
  on?: Date,
): boolean {
  if (!isMinor(user.dateOfBirth, on)) return true;
  return user.guardianConsentVerified;
}
