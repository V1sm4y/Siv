'use server';
import { signIn, signOut } from '@/server/auth';
import { safeNext } from '@/lib/api';
import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email());

export async function emailSignIn(formData: FormData) {
  const parsed = email.safeParse(formData.get('email'));
  const next = safeNext(String(formData.get('next') ?? ''));
  if (!parsed.success) return { error: 'Enter a valid email address' };
  await signIn('nodemailer', { email: parsed.data, redirectTo: next });
}

export async function oauthSignIn(provider: 'discord' | 'google', next: string) {
  await signIn(provider, { redirectTo: safeNext(next) });
}

export async function devSignIn(formData: FormData) {
  // The provider itself is only registered when ENABLE_DEV_LOGIN=true and NODE_ENV != production.
  await signIn('dev-login', { email: String(formData.get('email') ?? ''), redirectTo: safeNext(String(formData.get('next') ?? '')) });
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}
