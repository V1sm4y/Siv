'use client';
import {
  Button, Field, GameIcon, Input, Select, brandTheme, cn, dur, ease, useReducedMotionEffective,
} from '@arena/ui';
import { games, getGame } from '@arena/game-registry';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { AmbientGradient } from '@/components/effects/ambient-gradient';
import { LiquidGlass } from '@/components/effects/liquid-glass';
import { LiquidMark } from '@/components/effects/liquid-mark';
import { api, ApiError } from '@/lib/api';

const subscribeNever = () => () => {};
const detectTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const SERVER_ZONES = ['UTC'];
let zonesCache: string[] | undefined;
const getZones = () =>
  (zonesCache ??= (() => {
    try {
      const z = Intl.supportedValuesOf('timeZone');
      return z.includes('UTC') ? z : ['UTC', ...z];
    } catch {
      return SERVER_ZONES; // older engines: keep the detected zone only
    }
  })());

type Step = 'profile' | 'guardian' | 'org' | 'game' | 'done';
const LABELS: Record<Step, string> = { profile: 'You', guardian: 'Guardian', org: 'Organisation', game: 'First team', done: 'Done' };

interface Props {
  initialStep: Step;
  next: string | null;
  existingOrg: { id: string; slug: string } | null;
  defaultName: string;
}

export function OnboardingFlow({ initialStep, next, existingOrg, defaultName }: Props) {
  const router = useRouter();
  const reduced = useReducedMotionEffective();
  const [step, setStep] = useState<Step>(initialStep);
  const [minor, setMinor] = useState(false);
  const [org, setOrg] = useState(existingOrg);
  const [gameId, setGameId] = useState<string | null>(null);
  const game = gameId ? getGame(gameId) : null;
  const gradient = game?.theme.gradient ?? brandTheme.gradient;
  const shown: Step[] = ['profile', ...(minor ? (['guardian'] as const) : []), ...(next ? [] : (['org', 'game'] as const))];

  const afterProfile = (isMinor: boolean) => {
    setMinor(isMinor);
    if (isMinor) {
      setStep('guardian');
    } else if (next) {
      router.push(next);
    } else {
      setStep('org');
    }
  };
  const afterGuardian = () => {
    if (next) router.push(next);
    else setStep('org');
  };

  return (
    <main id="main" data-game={game?.id} className="relative isolate flex min-h-dvh flex-col items-center px-4 py-10">
      <AmbientGradient colors={gradient} preserveBuffer className="-z-10" />
      <header className="relative z-10 flex w-full max-w-xl items-center justify-between">
        <span className="flex items-center gap-3 font-display text-[1.65rem] leading-none font-extrabold tracking-wide uppercase">
          <LiquidMark size={40} tint={game?.theme.accent ?? brandTheme.accent} />
          Arena<span className="-ml-2 text-fg-subtle">&nbsp;OS</span>
        </span>
        <ol className="flex items-center gap-2" aria-label="Progress">
          {shown.map((s) => (
            <li key={s} aria-current={s === step ? 'step' : undefined} className="flex items-center gap-2 text-xs">
              <span className={cn('size-2 rounded-full transition-colors', s === step ? 'bg-accent' : 'bg-line-strong')} />
              <span className={cn('hidden sm:inline', s === step ? 'text-fg' : 'text-fg-subtle')}>{LABELS[s]}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="relative z-10 flex w-full max-w-xl flex-1 items-center py-10">
        <LiquidGlass className="w-full p-6 sm:p-8" radius={20}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: dur.base, ease: ease.out }}
            >
              {step === 'profile' && <ProfileStep defaultName={defaultName} onDone={afterProfile} />}
              {step === 'guardian' && <GuardianStep onDone={afterGuardian} />}
              {step === 'org' && <OrgStep onDone={(o) => { setOrg(o); setStep('game'); }} />}
              {step === 'game' && org && (
                <GameStep org={org} gameId={gameId} onPick={setGameId} onDone={() => setStep('done')} onSkip={() => setStep('done')} />
              )}
              {step === 'done' && org && <DoneStep slug={org.slug} />}
            </motion.div>
          </AnimatePresence>
        </LiquidGlass>
      </div>
    </main>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="title text-4xl">{title}</h1>
      <p className="mt-1 text-sm text-fg-muted">{sub}</p>
    </div>
  );
}

function ProfileStep({ defaultName, onDone }: { defaultName: string; onDone: (minor: boolean) => void }) {
  const [name, setName] = useState(defaultName);
  const [dob, setDob] = useState('');
  // Browser-only values read via useSyncExternalStore: 'UTC' on the server, the real zone after hydration.
  const detectedTz = useSyncExternalStore(subscribeNever, detectTimeZone, () => 'UTC');
  const zones = useSyncExternalStore(subscribeNever, getZones, () => SERVER_ZONES);
  const [tzChoice, setTzChoice] = useState<string | null>(null);
  const tz = tzChoice ?? detectedTz;
  const setTz = setTzChoice;
  const [terms, setTerms] = useState(false);
  const m = useMutation({
    mutationFn: () => api<{ minor: boolean }>('/api/me/profile', { body: { name, dateOfBirth: dob, timezone: tz, acceptTerms: terms } }),
    onSuccess: (r) => onDone(r.minor),
  });
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="flex flex-col gap-4">
      <Heading title="Welcome. Let’s set you up." sub="This takes under a minute." />
      <Field label="Your name" error={err?.field('name')}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />}
      </Field>
      <Field label="Date of birth" hint="Used to protect under-18 players. It is never shown to teammates." error={err?.field('dateOfBirth')}>
        {(p) => <Input {...p} type="date" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" required />}
      </Field>
      <Field label="Timezone" hint="Schedules are shown in your local time." error={err?.field('timezone')}>
        {(p) => (
          <Select {...p} value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        )}
      </Field>
      <label className="flex items-start gap-3 text-sm text-fg-muted">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" required />
        <span>I accept the terms of service and privacy notice.</span>
      </label>
      {err?.field('acceptTerms') && <p role="alert" className="text-xs text-danger">{err.field('acceptTerms')}</p>}
      {err && !err.details && <p role="alert" className="text-sm text-danger">{err.message}</p>}
      <Button type="submit" size="lg" loading={m.isPending}>Continue</Button>
    </form>
  );
}

function GuardianStep({ onDone }: { onDone: () => void }) {
  const [gName, setGName] = useState('');
  const [gEmail, setGEmail] = useState('');
  const m = useMutation({
    mutationFn: () => api('/api/me/guardian', { body: { guardianName: gName, guardianEmail: gEmail } }),
    onSuccess: onDone,
  });
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="flex flex-col gap-4">
      <Heading title="A parent or guardian needs to agree" sub="You’re under 18, so wellness check-ins, public profiles and voice recording stay off until a guardian consents. Everything else works now." />
      <Field label="Guardian’s name" error={err?.field('guardianName')}>
        {(p) => <Input {...p} value={gName} onChange={(e) => setGName(e.target.value)} required />}
      </Field>
      <Field label="Guardian’s email" hint="We’ll send them a link to review and consent." error={err?.field('guardianEmail')}>
        {(p) => <Input {...p} type="email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} required />}
      </Field>
      {err && !err.details && <p role="alert" className="text-sm text-danger">{err.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" loading={m.isPending}>Send request</Button>
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>Later</Button>
      </div>
    </form>
  );
}

function OrgStep({ onDone }: { onDone: (o: { id: string; slug: string }) => void }) {
  const [name, setName] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ id: string; slug: string }>('/api/orgs', { body: { name } }),
    onSuccess: onDone,
  });
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="flex flex-col gap-4">
      <Heading title="Name your organisation" sub="You’ll be the owner. Invite your staff and players next." />
      <Field label="Organisation name" error={err?.field('name')}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova Esports" required autoFocus />}
      </Field>
      {err && !err.details && <p role="alert" className="text-sm text-danger">{err.message}</p>}
      <Button type="submit" size="lg" loading={m.isPending}>Create organisation</Button>
    </form>
  );
}

function GameStep({
  org, gameId, onPick, onDone, onSkip,
}: {
  org: { id: string }; gameId: string | null; onPick: (id: string) => void; onDone: () => void; onSkip: () => void;
}) {
  const [teamName, setTeamName] = useState('');
  const game = gameId ? getGame(gameId) : null;
  const m = useMutation({
    mutationFn: () => api(`/api/orgs/${org.id}/teams`, { body: { name: teamName || `${game?.shortName} Team`, gameId } }),
    onSuccess: onDone,
  });
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (gameId) m.mutate(); }} className="flex flex-col gap-4">
      <Heading title="Pick your first game" sub="Each game is its own team container with its own roster, calendar and theme. Add more anytime." />
      <div role="radiogroup" aria-label="Game" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {games.map((g) => {
          const on = g.id === gameId;
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-game={g.id}
              onClick={() => onPick(g.id)}
              className={cn(
                'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98]',
                on ? 'border-accent bg-accent/10' : 'border-line-strong bg-surface-1 hover:bg-surface-2',
              )}
            >
              <span className={cn('grid size-8 place-items-center rounded-md', on ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-accent-text')}>
                <GameIcon icon={g.theme.icon} className="size-4" />
              </span>
              <span className="text-sm font-medium">{g.name}</span>
              <span className="text-xs text-fg-subtle">{g.depth === 'full' ? 'Full module' : 'Foundation'}</span>
            </button>
          );
        })}
      </div>
      {game && (
        <Field label="Team name" hint={`e.g. “${game.shortName} Main”. You can change this later.`} error={err?.field('name')}>
          {(p) => <Input {...p} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={`${game.shortName} Team`} />}
        </Field>
      )}
      {err && !err.details && <p role="alert" className="text-sm text-danger">{err.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={!gameId} loading={m.isPending}>Create team</Button>
        <Button type="button" variant="ghost" size="lg" onClick={onSkip}>Skip</Button>
      </div>
    </form>
  );
}

function DoneStep({ slug }: { slug: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="grid size-16 place-items-center rounded-full bg-accent text-accent-fg"
      >
        <Check className="size-8" aria-hidden="true" />
      </motion.div>
      <h1 className="font-display text-2xl font-semibold">You’re in.</h1>
      <p className="text-sm text-fg-muted">Your workspace is ready.</p>
      <Button size="lg" onClick={() => router.push(`/app/${slug}`)} autoFocus>Enter workspace</Button>
    </div>
  );
}
