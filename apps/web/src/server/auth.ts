import 'server-only';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { enabledOAuthProviders, env } from '@arena/config';
import { accounts, sessions, users, verificationTokens } from '@arena/db';
import { eq } from 'drizzle-orm';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { getDb } from './db';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

export const DEV_LOGIN_DOMAIN = '@arena.test';

/**
 * Lazy config so `next build` can import this module without a full environment.
 * JWT sessions: Auth.js cannot combine the Credentials (dev login) provider with database sessions.
 * Trade-off (logged in docs/DECISIONS.md D-33): no server-side session revocation until we add a
 * `session_version` check; the realtime service verifies the same signed token.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();
  const oauth = enabledOAuthProviders(e);
  const providers = [];

  if (e.EMAIL_SERVER) {
    providers.push(Nodemailer({ server: e.EMAIL_SERVER, from: e.EMAIL_FROM, maxAge: 15 * 60 }));
  }
  if (oauth.discord) providers.push(Discord({ clientId: e.AUTH_DISCORD_ID!, clientSecret: e.AUTH_DISCORD_SECRET! }));
  if (oauth.google) providers.push(Google({ clientId: e.AUTH_GOOGLE_ID!, clientSecret: e.AUTH_GOOGLE_SECRET! }));

  // DEV ONLY. env validation refuses ENABLE_DEV_LOGIN when NODE_ENV=production; re-checked here.
  if (e.ENABLE_DEV_LOGIN && e.NODE_ENV !== 'production') {
    providers.push(
      Credentials({
        id: 'dev-login',
        name: 'Demo login',
        credentials: { email: { label: 'Email', type: 'email' } },
        async authorize(creds) {
          const email = String(creds?.email ?? '').trim().toLowerCase();
          if (!email.endsWith(DEV_LOGIN_DOMAIN)) return null;
          const db = getDb();
          const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
          if (existing) return { id: existing.id, email: existing.email, name: existing.name, image: existing.image };
          const [created] = await db.insert(users).values({ email, emailVerified: new Date() }).returning();
          return created ? { id: created.id, email: created.email, name: created.name } : null;
        },
      }),
    );
  }

  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers,
    session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: '/login', verifyRequest: '/login?check=1', error: '/login' },
    trustHost: true,
    callbacks: {
      jwt({ token, user }) {
        if (user?.id) token.uid = user.id;
        return token;
      },
      session({ session, token }) {
        if (typeof token.uid === 'string') session.user.id = token.uid;
        return session;
      },
    },
  };
});
