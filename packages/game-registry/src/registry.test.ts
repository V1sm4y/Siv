import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGameModule } from '@arena/game-sdk';
// @ts-expect-error plain .mjs tooling script
import { generate } from '../../../tooling/gen-modules.mjs';
import { games, getGame, requireGame } from './index';

describe('Game Module conformance (every registered module must pass)', () => {
  it('registers the six launch games', () => {
    expect(games.map((g) => g.id).sort()).toEqual(['cs2', 'dota2', 'eafc', 'lol', 'rocketleague', 'valorant']);
  });
  for (const g of games) {
    it(`${g.id} satisfies the module invariants`, () => {
      expect(validateGameModule(g)).toEqual([]);
    });
    it(`${g.id} offers manual entry and CSV (works with zero API access)`, () => {
      const ids = g.adapters.map((a) => a.id);
      expect(ids).toContain('manual');
      expect(ids).toContain('csv');
    });
    it(`${g.id} does not claim credentialed integrations are available before they exist`, () => {
      // Honest UI: nothing beyond manual/csv is 'available' until its milestone ships.
      for (const a of g.adapters.filter((a) => a.requiresCredentials)) expect(a.status).toBe('planned');
    });
  }
  it('EA FC treats the edition as data with FC 27 current', () => {
    const fc = requireGame('eafc');
    expect(fc.editions?.find((e) => e.current)?.id).toBe('fc27');
  });
  it('lookups', () => {
    expect(getGame('nope')).toBeUndefined();
    expect(() => requireGame('nope')).toThrow(/Unknown game module/);
  });
});

describe('a seventh game needs no core changes', () => {
  it('is discovered from a new folder alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'games-'));
    for (const id of ['alpha', 'zeta_new_game']) {
      mkdirSync(join(dir, id, 'src'), { recursive: true });
      writeFileSync(join(dir, id, 'src/module.ts'), 'export default {};');
    }
    mkdirSync(join(dir, 'not-a-module'), { recursive: true }); // folder without src/module.ts is ignored
    const out = join(dir, 'gen', 'generated.ts');
    const ids = generate({ gamesDir: dir, out });
    expect(ids).toEqual(['alpha', 'zeta_new_game']);
    const text = readFileSync(out, 'utf8');
    expect(text).toContain("../alpha/src/module");
    expect(text).toContain("../zeta_new_game/src/module");
    expect(text).not.toContain('not-a-module');
  });
});
