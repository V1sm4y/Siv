'use client';
import { Badge, Button, cn, playCue, useMotionStore, useSoundStore, useThemeStore, type MotionPreference, type ThemePreference } from '@arena/ui';
import { Section } from '@/components/page-header';

function Choice<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('rounded-sm border px-4 py-2 text-sm transition-colors', value === v ? 'border-accent bg-accent/10 text-fg' : 'border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsClient({ account, guardian }: { account: { name: string | null; email: string | null; timezone: string; role: string }; guardian: { minor: boolean; verified: boolean; pending: boolean } }) {
  const theme = useThemeStore();
  const motion = useMotionStore();
  const sound = useSoundStore();
  return (
    <>
      <Section label="Theme" hint="Dark is the default.">
        <Choice<ThemePreference> legend="Theme" value={theme.preference} onChange={theme.setPreference} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]} />
      </Section>
      <Section label="Motion" hint="Reduced motion removes movement, the intro and animated backgrounds. State changes stay instant and clear.">
        <Choice<MotionPreference> legend="Motion" value={motion.preference} onChange={motion.setPreference} options={[['system', 'Follow system'], ['full', 'Full motion'], ['reduced', 'Reduced motion']]} />
      </Section>
      <Section label="Sound" hint="Subtle cues for confirmations and switching containers. Off by default.">
        <div className="flex flex-wrap items-center gap-3">
          <Choice<'off' | 'on'> legend="Interface sounds" value={sound.enabled ? 'on' : 'off'} onChange={(v) => sound.setEnabled(v === 'on')} options={[['off', 'Off'], ['on', 'On']]} />
          <Button variant="ghost" size="sm" disabled={!sound.enabled} onClick={() => playCue('notify')}>Preview</Button>
        </div>
      </Section>
      <Section label="Account">
        <dl className="-mt-2 divide-y divide-line text-sm">
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
        <p className="mt-4 text-sm text-fg-subtle">Data export and account deletion are not built yet; they arrive with the security suite.</p>
      </Section>
    </>
  );
}
