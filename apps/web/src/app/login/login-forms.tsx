'use client';
import { Field, Input } from '@arena/ui';
import { useActionState } from 'react';
import { devSignIn, emailSignIn, oauthSignIn } from '../actions';
import { SubmitButton } from '@/components/forms/submit-button';

export function EmailForm({ next, enabled }: { next: string; enabled: boolean }) {
  const [state, action] = useActionState(async (_: unknown, fd: FormData) => emailSignIn(fd), undefined);
  if (!enabled) {
    return (
      <p className="rounded-md border border-line-strong bg-surface-1 p-3 text-sm text-fg-muted">
        Email sign-in is not configured on this server (set <code>EMAIL_SERVER</code>).
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" error={state?.error}>
        {(p) => <Input {...p} name="email" type="email" autoComplete="email" required placeholder="you@team.gg" />}
      </Field>
      <SubmitButton size="lg">Email me a sign-in link</SubmitButton>
    </form>
  );
}

export function OAuthButtons({ providers, next }: { providers: { discord: boolean; google: boolean }; next: string }) {
  if (!providers.discord && !providers.google) return null;
  return (
    <div className="flex flex-col gap-2">
      {providers.discord && (
        <form action={oauthSignIn.bind(null, 'discord', next)}>
          <SubmitButton variant="secondary" size="lg" className="w-full">Continue with Discord</SubmitButton>
        </form>
      )}
      {providers.google && (
        <form action={oauthSignIn.bind(null, 'google', next)}>
          <SubmitButton variant="secondary" size="lg" className="w-full">Continue with Google</SubmitButton>
        </form>
      )}
    </div>
  );
}

export function DemoLogins({ accounts, next }: { accounts: readonly { email: string; name: string; label: string }[]; next: string }) {
  return (
    <section aria-labelledby="demo-heading" className="rounded-lg border border-warning/40 bg-warning/5 p-4">
      <h2 id="demo-heading" className="text-sm font-semibold text-warning">
        Demo accounts (development only)
      </h2>
      <p className="mt-1 text-xs text-fg-muted">Seeded with <code>pnpm seed</code>. This panel never renders in production.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {accounts.map((a) => (
          <li key={a.email}>
            <form action={devSignIn}>
              <input type="hidden" name="email" value={a.email} />
              <input type="hidden" name="next" value={next} />
              <SubmitButton variant="secondary" size="sm" className="w-full justify-start" data-testid={`demo-${a.email}`}>
                <span className="font-medium">{a.label}</span>
                <span className="truncate text-fg-subtle">{a.name}</span>
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
