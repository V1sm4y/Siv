import 'server-only';
import { getUser } from '@arena/domain';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { getDb } from './db';

export async function currentUserId(): Promise<string | null> {
  const s = await auth();
  return s?.user?.id ?? null;
}

/** For server components/layouts: the signed-in user row, or a redirect to /login. */
export async function requireUser() {
  const id = await currentUserId();
  if (!id) redirect('/login');
  const user = await getUser(getDb(), id);
  if (!user) redirect('/login');
  return user;
}

/** Users must finish onboarding (profile + DOB + terms) before using the app. */
export async function requireOnboardedUser() {
  const user = await requireUser();
  if (!user.onboardedAt) redirect('/onboarding');
  return user;
}
