import { Wordmark } from '@/components/wordmark';
import { GuardianConsent } from './guardian-consent';

export const metadata = { title: 'Guardian consent' };

export default async function GuardianPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="glass flex w-full max-w-lg flex-col gap-4 rounded-xl p-8">
        <Wordmark />
        <h1 className="font-display text-2xl font-semibold">Parent / guardian consent</h1>
        <p className="text-sm text-fg-muted">
          A young player has asked to use Arena OS, a workspace their esports organisation uses for scheduling, practice,
          performance review and team communication.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
          <li>Until you consent, wellness check-ins, public player profiles, external sharing and voice recording stay switched off for them.</li>
          <li>You can withdraw consent at any time by contacting their organisation.</li>
          <li>Their date of birth is used only to apply these protections and is not visible to teammates.</li>
        </ul>
        <GuardianConsent token={token} />
      </div>
    </main>
  );
}
