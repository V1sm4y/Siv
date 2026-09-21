import type { GameModule } from '@arena/game-sdk';
import { GAME_MODULES } from './generated';

const byId = new Map<string, GameModule>(GAME_MODULES.map((m) => [m.id, m]));

export const games: readonly GameModule[] = GAME_MODULES;
export const gameIds: readonly string[] = GAME_MODULES.map((m) => m.id);

export function isGameId(id: string): boolean {
  return byId.has(id);
}
export function getGame(id: string): GameModule | undefined {
  return byId.get(id);
}
export function requireGame(id: string): GameModule {
  const g = byId.get(id);
  if (!g) throw new Error(`Unknown game module: ${id}`);
  return g;
}
