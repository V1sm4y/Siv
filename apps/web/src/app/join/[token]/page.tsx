import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/wordmark';
import { currentUserId, requireUser } from '@/server/session';
import { AcceptInvite } from './accept-invite';

export const metadata = { title: 'Join organisation' };
export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = `/join/${encodeURIComponent(token)}`;
  if (!(await currentUserId())) redirect(`/login?next=${encodeURIComponent(path)}`);
  const user = await requireUser();
  if (!user.onboardedAt) redirect(`/onboarding?next=${encodeURIComponent(path)}`);
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="glass flex w-full max-w-md flex-col gap-4 rounded-xl p-8">
        <Wordmark />
        <h1 className="font-display text-2xl font-semibold">You’ve been invited</h1>
        <p className="text-sm text-fg-muted">
          Signed in as <strong className="text-fg">{user.email}</strong>. The invite only works for the email address it was sent to.
        </p>
        <AcceptInvite token={token} />
      </div>
    </main>
  );
}
