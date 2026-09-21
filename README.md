# Arena OS (working name)

A single workspace where an esports organisation runs communication, practice, analysis, match day and contracts. See [docs/PLAN.md](docs/PLAN.md) for the full architecture, RBAC matrix, milestones and risks, and [docs/DECISIONS.md](docs/DECISIONS.md) for the decision log.

> **Status: Milestone 0 (foundation).** Working today: auth, organisations, game containers (teams), invitations, role-based access enforced on the server and in Postgres (RLS), audit log, guardian consent for minors, the animated app shell, and the design system. Not built yet: chat, scheduling, analytics, VOD, contracts and the rest of the roadmap. The UI says so where a screen is a placeholder.

## Quick start

Requirements: Node 22+ (24 LTS recommended, see `.nvmrc`), pnpm 12, Docker.

```bash
cp .env.example .env            # dev defaults work as-is
docker compose up -d            # Postgres 18, Redis, MinIO, Mailpit
pnpm install
pnpm db:migrate                 # applies migrations + provisions the low-privilege runtime DB role
pnpm seed                       # demo org, clearly labelled "DEMO DATA"
pnpm dev                        # http://localhost:3000
```

Sign in from `/login` using the **Demo accounts** panel (owner, manager, coach, analyst, player, guest), or use email sign-in (links land in Mailpit at http://localhost:8025). The demo panel only exists when `ENABLE_DEV_LOGIN=true`, and configuration validation refuses to start in production with it on.

```bash
pnpm test         # unit + integration (needs the compose Postgres; uses the arena_test database)
pnpm test:e2e     # Playwright smoke + axe accessibility scans
pnpm lint && pnpm typecheck
```

## Architecture

```
 Browser ── HTTPS ──► apps/web (Next.js App Router, route handlers via defineRoute)
                        │  packages/authz   permission matrix + can()      (single policy engine)
                        │  packages/domain  services, audit chain          (framework-free)
                        ▼
                    PostgreSQL (RLS, uuidv7)   Redis (rate limits; presence in M1)
   Later: apps/realtime (Socket.IO, Yjs), apps/worker (BullMQ), LiveKit, S3/MinIO
```

| Path | What lives there |
|---|---|
| `apps/web` | UI + API. Every API route is created with `defineRoute`/`definePublicRoute` (enforced by `routes.arch.test.ts`). |
| `packages/authz` | Roles, the permission matrix **as data**, `can()`. Tests are generated from the matrix. |
| `packages/db` | Drizzle schema, migrations (incl. RLS policies), tenant-context helpers. |
| `packages/domain` | Org/team/invite/member services, hash-chained audit log, guardian consent, seed. |
| `packages/game-sdk`, `packages/games/*`, `packages/game-registry` | The Game Module contract, six modules, and a generated registry. |
| `packages/ui` | Design tokens (source of truth in TS, contrast-tested), components, motion + theme providers. |

**Security model in one paragraph.** Two independent layers: (1) `can()` decides by role/feature on the server; (2) Postgres row-level security scopes every query to the current org/user via transaction-local settings, and the runtime DB role is not a superuser and cannot bypass RLS. Non-members get 404, not 403. The audit log is append-only for the runtime role and hash-chained per org. Tests connect as the runtime role to prove cross-tenant reads and writes fail.

## Environment variables

See [.env.example](.env.example); validated at startup by `packages/config`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime connection (role `arena_app`, subject to RLS). |
| `DATABASE_URL_ADMIN` | Migrations and seed only. Never used by request handlers. |
| `AUTH_SECRET`, `AUTH_URL` | Auth.js signing secret and public URL. |
| `EMAIL_SERVER`, `EMAIL_FROM` | SMTP for sign-in links, invites and guardian requests (Mailpit locally). |
| `AUTH_DISCORD_*`, `AUTH_GOOGLE_*` | Optional OAuth; buttons appear only when both values are set. |
| `ENABLE_DEV_LOGIN` | Dev-only demo login. Rejected when `NODE_ENV=production`. |
| `REDIS_URL` | Rate limiting (falls back to an in-process limiter if unset/unreachable). |
| `MASTER_KEY` | 32-byte base64 key for envelope encryption (used from M5; required in production). |

## Adding a Game Module

See [docs/MODULES.md](docs/MODULES.md). Short version: add one folder under `packages/games/`, run `pnpm install`, and the registry picks it up. No core file changes.

## Legal notes

Arena OS is not endorsed by any game publisher. Riot Games data access requires an approved production key and per-player RSO consent; until then the Valorant and League modules work through manual entry and CSV. See PLAN.md §2 for verified provider constraints.
