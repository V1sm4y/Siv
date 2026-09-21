import { enabledOAuthProviders, env } from '@arena/config';
import { DEMO_ACCOUNTS } from '@arena/db';
import { brandTheme } from '@arena/ui';
import { redirect } from 'next/navigation';
import { AmbientGradient } from '@/components/effects/ambient-gradient';
import { LiquidGlass } from '@/components/effects/liquid-glass';
import { LiquidMark } from '@/components/effects/liquid-mark';
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
    <main id="main" className="relative isolate grid min-h-dvh items-center gap-12 overflow-hidden px-5 py-12 sm:px-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-20">
      {/* preserveBuffer lets the liquid-glass card snapshot the shader field behind it. */}
      <AmbientGradient colors={brandTheme.gradient} preserveBuffer className="-z-10" />

      <section className="flex flex-col gap-8">
        <LiquidMark size={200} tint={brandTheme.accent} className="max-lg:size-32" />
        <div className="max-w-xl">
          <p className="eyebrow">The operating system for esports</p>
          <h1 className="title mt-4 text-6xl sm:text-7xl">One workspace for the whole operation.</h1>
          <p className="mt-5 text-fg-muted text-pretty">
            Comms, practice, analysis, match day and contracts for your roster, in one place. Works fully with manual entry and CSV; connect game data when you are ready.
          </p>
        </div>
        <p className="text-xs text-fg-subtle">Arena OS is not endorsed by any game publisher.</p>
      </section>

      <LiquidGlass className="w-full max-w-md justify-self-center p-7 sm:p-9 lg:justify-self-end">
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-wide uppercase">Sign in</h2>
            <p className="mt-1 text-sm text-fg-muted">New here? The same link creates your account.</p>
          </div>

          {sp.check && (
            <p role="status" className="rounded-sm border border-success/40 bg-success/10 p-3 text-sm text-success">
              Check your inbox for a sign-in link. It expires in 15 minutes.
            </p>
          )}
          {sp.error && (
            <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {ERRORS[sp.error] ?? 'Sign-in failed. Try again.'}
            </p>
          )}

          <OAuthButtons providers={oauth} next={next} />
          <EmailForm next={next} enabled={Boolean(e.EMAIL_SERVER)} />
          {devLogin && <DemoLogins accounts={DEMO_ACCOUNTS} next={next} />}
        </div>
      </LiquidGlass>
    </main>
  );
}
