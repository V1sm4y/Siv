'use client';
import { Badge, useMotionStore, useThemeStore, cn, type MotionPreference, type ThemePreference } from '@arena/ui';

function Choice<T extends string>({ legend, hint, value, options, onChange }: { legend: string; hint: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset className="border-t border-line py-6">
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-sm font-medium" aria-hidden="true">{legend}</p>
          <p className="mt-1 text-sm text-fg-muted">{hint}</p>
        </div>
        <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
          {options.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value === v}
              onClick={() => onChange(v)}
              className={cn('rounded-md border px-4 py-2 text-sm transition-colors', value === v ? 'border-accent bg-accent/10 text-fg' : 'border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

export function SettingsClient({ account, guardian }: { account: { name: string | null; email: string | null; timezone: string; role: string }; guardian: { minor: boolean; verified: boolean; pending: boolean } }) {
  const theme = useThemeStore();
  const motion = useMotionStore();
  return (
    <div className="max-w-3xl">
      <section aria-labelledby="appearance-h">
        <h2 id="appearance-h" className="mb-1 text-sm font-medium text-fg-muted">Appearance</h2>
        <Choice<ThemePreference> legend="Theme" hint="Dark is the default." value={theme.preference} onChange={theme.setPreference} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]} />
        <Choice<MotionPreference>
          legend="Motion"
          hint="Reduced motion removes movement and animated backgrounds; state changes stay instant and clear."
          value={motion.preference}
          onChange={motion.setPreference}
          options={[['system', 'Follow system'], ['full', 'Full motion'], ['reduced', 'Reduced motion']]}
        />
      </section>

      <section aria-labelledby="account-h" className="mt-8">
        <h2 id="account-h" className="mb-1 text-sm font-medium text-fg-muted">Account</h2>
        <dl className="divide-y divide-line border-t border-line text-sm">
          {[['Name', account.name ?? '—'], ['Email', account.email ?? '—'], ['Timezone', account.timezone], ['Organisation role', account.role]].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[1fr_2fr] gap-4 py-3"><dt className="text-fg-muted">{k}</dt><dd className="capitalize">{v}</dd></div>
          ))}
          {guardian.minor && (
            <div className="grid grid-cols-[1fr_2fr] gap-4 py-3">
              <dt className="text-fg-muted">Guardian consent</dt>
              <dd><Badge tone={guardian.verified ? 'success' : 'warning'}>{guardian.verified ? 'Consent recorded' : guardian.pending ? 'Waiting for guardian' : 'Not requested'}</Badge></dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-sm text-fg-subtle">Data export and account deletion are not built yet; they arrive with the privacy tooling milestone.</p>
      </section>
    </div>
  );
}
