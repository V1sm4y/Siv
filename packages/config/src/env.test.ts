import { describe, expect, it } from 'vitest';
import { loadEnv, PLACEHOLDER_SECRET } from './index';

const base = { DATABASE_URL: 'postgres://a:b@localhost:5432/x', AUTH_SECRET: 'x'.repeat(40) };

describe('env validation', () => {
  it('accepts a minimal dev config and treats blanks as unset', () => {
    const e = loadEnv({ ...base, AUTH_DISCORD_ID: '', AUTH_GOOGLE_ID: '', REDIS_URL: '' });
    expect(e.REDIS_URL).toBeUndefined();
    expect(e.ENABLE_DEV_LOGIN).toBe(false);
  });
  it('rejects short secrets', () => {
    expect(() => loadEnv({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });
  it('refuses dev login in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', ENABLE_DEV_LOGIN: 'true', MASTER_KEY: Buffer.alloc(32).toString('base64') }),
    ).toThrow(/Dev login/);
  });
  it('refuses placeholder secret and missing master key in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', AUTH_SECRET: PLACEHOLDER_SECRET })).toThrow(/placeholder/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/MASTER_KEY/);
  });
  it('requires OAuth id and secret together', () => {
    expect(() => loadEnv({ ...base, AUTH_GOOGLE_ID: 'abc' })).toThrow(/set together/);
  });
});
