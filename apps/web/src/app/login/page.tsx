import { enabledOAuthProviders, env } from '@arena/config';
import { DEMO_ACCOUNTS } from '@arena/db';
import { brandTheme } from '@arena/ui';
import { redirect } from 'next/navigation';
import { AmbientGradient } from '@/components/effects/ambient-gradient';
import { Wordmark } from '@/components/wordmark';
import { safeNext } from '@/lib/api';
import { auth } from '@/server/auth';
import { DemoLogins, EmailForm, OAuthButtons } from './login-forms';

export const metadata = { title: 'Sign in' };
// Reads env + session on every request.
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  Verification: 'That sign-in link has expired or was already used. Request a new one.',
  AccessDenied: 'Access was denied.',
  Configuration: 'Sign-in is misconfigured on this server.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; check?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if ((await auth())?.user?.id) redirect(next);

  const e = env();
  const oauth = enabledOAuthProviders(e);
  const devLogin = e.ENABLE_DEV_LOGIN && e.NODE_ENV !== 'production';

  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <AmbientGradient colors={brandTheme.gradient} />
        <Wordmark className="relative" />
        <div className="relative max-w-lg">
          <h1 className="font-display text-4xl leading-[1.05] font-semibold text-balance">One workspace for the whole operation.</h1>
          <p className="mt-4 text-fg-muted text-pretty">
            Comms, practice, analysis, match day and contracts for your roster, in one place. Works fully with manual entry and CSV; connect game data when you are ready.
          </p>
        </div>
        <p className="relative text-xs text-fg-subtle">Arena OS is not endorsed by any game publisher.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="flex w-full max-w-md flex-col gap-6">
          <Wordmark className="lg:hidden" />
          <div>
            <h2 className="font-display text-2xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-fg-muted">New here? The same link creates your account.</p>
          </div>

          {sp.check && (
            <p role="status" className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
              Check your inbox for a sign-in link. It expires in 15 minutes.
            </p>
          )}
          {sp.error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {ERRORS[sp.error] ?? 'Sign-in failed. Try again.'}
            </p>
          )}

          <OAuthButtons providers={oauth} next={next} />
          <EmailForm next={next} enabled={Boolean(e.EMAIL_SERVER)} />
          {devLogin && <DemoLogins accounts={DEMO_ACCOUNTS} next={next} />}
        </div>
      </section>
    </main>
  );
}
