import { listOrgsForUser } from '@arena/domain';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/api';
import { getDb } from '@/server/db';
import { requireUser } from '@/server/session';
import { OnboardingFlow } from './onboarding-flow';

export const metadata = { title: 'Welcome' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const next = sp.next ? safeNext(sp.next, '') || null : null;
  const orgs = await listOrgsForUser(getDb(), user.id);

  // Finished users have nothing to do here.
  if (user.onboardedAt && orgs.length > 0) redirect(`/app/${orgs[0]!.slug}`);
  if (user.onboardedAt && next) redirect(next);

  const existing = orgs[0] ? { id: orgs[0].id, slug: orgs[0].slug } : null;
  const initialStep = !user.onboardedAt ? 'profile' : existing ? 'game' : 'org';
  return <OnboardingFlow initialStep={initialStep} next={next} existingOrg={existing} defaultName={user.name ?? ''} />;
}
