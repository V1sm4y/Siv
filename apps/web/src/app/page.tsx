import { listOrgsForUser } from '@arena/domain';
import { redirect } from 'next/navigation';
import { getDb } from '@/server/db';
import { requireUser } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Traffic cop: login → onboarding → the user's organisation. */
export default async function Home() {
  const user = await requireUser();
  if (!user.onboardedAt) redirect('/onboarding');
  const orgs = await listOrgsForUser(getDb(), user.id);
  if (orgs.length === 0) redirect('/onboarding');
  redirect(`/app/${orgs[0]!.slug}`);
}
