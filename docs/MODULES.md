# How to add a Game Module

A module is **data plus optional lazy UI**. The core never imports a specific game; `tooling/gen-modules.mjs` discovers `packages/games/*/src/module.ts` and emits the registry, so adding a seventh game touches no core file. A test (`packages/game-registry/src/registry.test.ts`) proves discovery works from a new folder alone.

## Steps

1. Create `packages/games/<id>/` where `<id>` is lowercase snake case (e.g. `apex`). The id is stored as text in the database, never as an enum.
2. `package.json`:
   ```json
   {
     "name": "@arena/game-<id>", "version": "0.0.0", "private": true, "type": "module",
     "exports": { ".": "./src/module.ts" },
     "scripts": { "typecheck": "tsc --noEmit" },
     "dependencies": { "@arena/game-sdk": "workspace:*" },
     "devDependencies": { "typescript": "~5.9.3" }
   }
   ```
   and a `tsconfig.json` extending `../../../tsconfig.base.json` with `"include": ["src"]`.
3. `src/module.ts` default-exports `defineGameModule({...})`. Copy `packages/games/valorant/src/module.ts` and edit. Required: `id`, `name`, `shortName`, `theme` (accent + contrast-safe text colours + gradient), `roles`, `arenas`, `teamSize`, `metrics`, `adapters` (must include manual and CSV via `MANUAL_ADAPTERS`), `liveGuidance` (policy + ruleset warning), `depth`.
4. Run `pnpm install` (links the new workspace package) then `pnpm gen:modules && pnpm gen:tokens`. The per-game accent theme CSS is generated from your `theme`.
5. `pnpm test`. The conformance suite runs `validateGameModule` against your module, and the token tests check WCAG contrast for your accent (label on accent ≥ 4.5:1, accent text on dark and light surfaces ≥ 4.5:1).

## Rules

- **Be honest about adapters.** `status: 'planned'` until the integration ships. The UI shows the status verbatim.
- **Provider terms come first.** Nothing that reads game memory, exposes hidden enemy information, or violates a publisher's policy. Live data only through sanctioned feeds (e.g. Game State Integration).
- **Editions are data.** See `packages/games/eafc` (`editions: [{ id: 'fc27', current: true }]`).
- Pure data only in `module.ts` (no React, no Node APIs), so the realtime service and workers can import it.
