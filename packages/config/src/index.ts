import { z } from 'zod';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optStr = z.preprocess(blankToUndefined, z.string().optional());
const optUrl = z.preprocess(blankToUndefined, z.url().optional());

export const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-string-at-least-32-chars';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    DATABASE_URL_ADMIN: optUrl,
    APP_DB_PASSWORD: z.string().regex(/^[A-Za-z0-9_-]+$/).default('arena_app'),
    REDIS_URL: optUrl,
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    AUTH_URL: optUrl,
    EMAIL_SERVER: optStr,
    EMAIL_FROM: z.string().default('Arena OS <no-reply@arena.local>'),
    AUTH_DISCORD_ID: optStr,
    AUTH_DISCORD_SECRET: optStr,
    AUTH_GOOGLE_ID: optStr,
    AUTH_GOOGLE_SECRET: optStr,
    ENABLE_DEV_LOGIN: z
      .preprocess(blankToUndefined, z.enum(['true', 'false']).default('false'))
      .transform((v) => v === 'true'),
    MASTER_KEY: optStr,
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production') {
      if (v.ENABLE_DEV_LOGIN) {
        ctx.addIssue({ code: 'custom', path: ['ENABLE_DEV_LOGIN'], message: 'Dev login must never be enabled in production' });
      }
      if (v.AUTH_SECRET === PLACEHOLDER_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET'], message: 'Replace the placeholder AUTH_SECRET' });
      }
      if (!v.MASTER_KEY) {
        ctx.addIssue({ code: 'custom', path: ['MASTER_KEY'], message: 'MASTER_KEY is required in production' });
      }
    }
    if (v.MASTER_KEY && Buffer.from(v.MASTER_KEY, 'base64').length !== 32) {
      ctx.addIssue({ code: 'custom', path: ['MASTER_KEY'], message: 'MASTER_KEY must be 32 bytes, base64 encoded' });
    }
    for (const [a, b] of [
      ['AUTH_DISCORD_ID', 'AUTH_DISCORD_SECRET'],
      ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'],
    ] as const) {
      if (Boolean(v[a]) !== Boolean(v[b])) {
        ctx.addIssue({ code: 'custom', path: [a], message: `${a} and ${b} must be set together` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

let cached: Env | undefined;
/** Lazily validated so `next build` can import modules without a full environment. */
export function env(): Env {
  return (cached ??= loadEnv());
}

export function enabledOAuthProviders(e: Env = env()): { discord: boolean; google: boolean } {
  return {
    discord: Boolean(e.AUTH_DISCORD_ID && e.AUTH_DISCORD_SECRET),
    google: Boolean(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET),
  };
}
