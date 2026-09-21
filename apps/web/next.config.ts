import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import path from 'node:path';

const monorepoRoot = path.resolve(import.meta.dirname, '../..');
// Next only reads .env from this app dir; the monorepo keeps one .env at the root.
loadEnvConfig(monorepoRoot, process.env.NODE_ENV !== 'production', undefined, true); // forceReload: Next already cached apps/web's own (empty) env

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const config: NextConfig = {
  transpilePackages: [
    '@arena/ui', '@arena/db', '@arena/domain', '@arena/authz', '@arena/schemas', '@arena/config',
    '@arena/game-registry', '@arena/game-sdk',
    '@arena/game-valorant', '@arena/game-cs2', '@arena/game-dota2', '@arena/game-lol', '@arena/game-rocketleague', '@arena/game-eafc',
  ],
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
