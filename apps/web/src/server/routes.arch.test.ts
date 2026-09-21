import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API = join(import.meta.dirname, '../app/api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
// Auth.js owns its own handler (CSRF/rate protections are built in). Nothing else is exempt.
const EXEMPT = new Set(['auth/[...nextauth]/route.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : [];
  });
}

describe('every API route goes through defineRoute / definePublicRoute', () => {
  const files = walk(API).map((p) => ({ p, rel: p.slice(API.length + 1) }));
  it('finds the routes', () => expect(files.length).toBeGreaterThan(5));

  for (const { p, rel } of files) {
    if (EXEMPT.has(rel)) continue;
    it(rel, () => {
      const src = readFileSync(p, 'utf8');
      const exported = METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b`).test(src));
      expect(exported.length, 'route exports no HTTP handlers').toBeGreaterThan(0);
      for (const m of exported) {
        expect(src, `${m} must be created by defineRoute/definePublicRoute`).toMatch(
          new RegExp(`export\\s+const\\s+${m}\\s*=\\s*define(Public)?Route\\(`),
        );
      }
    });
    it(`${rel}: tenant routes declare a permission or an explicit membershipOnly opt-out`, () => {
      const src = readFileSync(p, 'utf8');
      if (!rel.includes('[orgId]')) return;
      const routes = src.split(/export\s+const\s+/).slice(1);
      for (const r of routes) {
        expect(r, 'org route without `org:` config').toMatch(/org:\s*\{\s*(permission|membershipOnly)/);
      }
    });
  }
});
