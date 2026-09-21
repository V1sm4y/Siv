# ARENA OS (working name) — Architecture & Delivery Plan

_Status: planning, written 2026-09-21. Nothing is built yet. Every "verified" claim below has a source in §2; everything else is marked **to verify** with the milestone where it gets verified._

"Arena OS" is a working name. Run a trademark search before public launch.

---

## 1. Product in one paragraph

One workspace where an esports org runs communication, practice, analysis, match day and contracts. Priority users: manager → coach/analyst → player. Six games ship on one **Game Module** interface; Valorant is built to full depth first. The app is fully useful with zero third-party API access (manual entry + CSV everywhere). "Real-time" means what is honestly achievable: realtime collaboration and presence, live game data only where the publisher offers a sanctioned feed (CS2 / Dota 2 GSI), and fast post-match ingestion everywhere else.

---

## 2. Verified external constraints (research, 2026-09-21)

| Area | Finding | Design consequence |
|---|---|---|
| **Riot (Valorant, LoL)** | Production key needed for VALORANT; personal keys requesting VALORANT access "will not be approved". Every VALORANT app must have players **opt in via RSO** and show a disclaimer that linking makes data public. Production rate limits: 500 req / 10 s and 30,000 req / 10 min, per region. Approval requires a **working prototype** and can take a variable amount of time. Products must not give unfair in-game advantage, must not include betting/gambling, must offer players a free tier, and must show "isn't endorsed by Riot Games". ([docs/portal](https://developer.riotgames.com/docs/portal), [policies](https://developer.riotgames.com/policies/general), [Valorant](https://developer.riotgames.com/docs/valorant)) | Riot adapter is built behind the adapter interface with a **mock + CSV path that is the default**. Apply for the production key at end of M2 with a demoable prototype (see risk R1). **Live Guidance for Riot games is human-authored only; no Riot game data is ever piped into live in-match advice.** RSO tokens encrypted; per-player consent records. |
| **CS2 GSI** | Local `gamestate_integration_<name>.cfg` in `game/csgo/cfg/` makes the client POST JSON to a local endpoint; no memory reading, no anti-cheat risk. Full-player data appears when spectating/observing, local-player only when playing. (Valve wiki returned 403 to my fetcher; confirmed via third-party libraries — **re-verify against Valve wiki in M6**.) | Ship a small **Arena Bridge** companion (Node CLI first) that runs on the player/observer PC, receives GSI on localhost and forwards to our authenticated ingest endpoint. No inbound connection to user machines. |
| **Dota 2 GSI / OpenDota** | Same GSI model (all players only in spectate). OpenDota reported at 60 req/min and 50,000 calls/month without a key, paid tier above that (secondary source — **re-verify in M6**). | OpenDota adapter with our own token bucket at ≤ 50 % of the documented limit; GSI through Arena Bridge. |
| **Rocket League** | Ballchasing API: token auth, tiered limits (2 req/s & 500/h for unpatroned; up to 16 req/s for top tier), `POST /v2/upload`, replay & group endpoints with rich stats. ([docs](https://ballchasing.com/doc/api)) | Adapter uploads replays and reads groups; a per-org token; queue via BullMQ with tier-aware rate limit. |
| **EA FC** | No official stats API. **FC 27 launches 25 Sep 2026** (early access from 18 Sep). ([EA](https://www.ea.com/games/ea-sports-fc/fc-27/news/fc-27-editions-and-release-dates)) | Module id is `eafc`, with `edition: "fc27"` as **data**, so FC 28 is a config change. Manual entry + CSV first; OCR later. |
| **LiveKit** | Server, Egress and client SDKs are Apache-2.0, self-hostable in Docker; Egress is a separate container for recording. | Self-host in Compose (dev) and production; recording only via Egress after consent gate (§9). |
| **UI repos** | `react-three-fiber` v9 pairs with React 19. `@shadergradient/react` works with Next 15+ App Router only on R3F ^9 + three ≥ 0.158, MIT. `liquid-glass-js` is vanilla, WebGL2, depends on **html2canvas** for page capture (perf warning from its own README), MIT. `liquid-logo` is a **standalone web tool, not an npm package**, MIT. `superpowers` installs as a Claude Code plugin. `ui-aesthetics-skill` is a `SKILL.md` with six principles (hierarchy before decoration, restraint, purposeful motion). `ruflo` is a large multi-agent meta-harness that registers an MCP server. | See §10 and DECISIONS D-14…D-17. |

**Not verified** (open until the milestone says so): Riot RSO exact scope list and token lifetimes (M3), FACEIT/Leetify terms (M6), Liquipedia/VLR scraping terms (M3, scraper stays off by default), Overwolf publisher permissions (post-M8), Auth.js v5 status and maintenance (M0, `npm view` at scaffold).

---

## 3. Architecture

```
                    ┌────────────────────────── Browser (PWA) ──────────────────────────┐
                    │ Next.js App Router · Tailwind · shadcn/ui · Framer Motion         │
                    │ Zustand (UI) · TanStack Query (server state) · Yjs (boards/notes) │
                    │ Socket.IO client · LiveKit client · offline action queue (IDB)    │
                    └───────┬───────────────────────┬───────────────────────┬───────────┘
                     HTTPS  │                WSS    │                 WebRTC│
              ┌─────────────▼─────────┐   ┌─────────▼──────────┐   ┌────────▼────────┐
              │ apps/web              │   │ apps/realtime      │   │ LiveKit SFU     │
              │ Next route handlers   │   │ Fastify + Socket.IO│   │ + Egress        │
              │ (defineRoute wrapper) │   │ + Yjs provider     │   └────────┬────────┘
              └─────────┬─────────────┘   └───┬────────────┬───┘            │
                        │ packages/domain     │            │ BullMQ workers │
                        │ packages/authz  ◄───┘            │ (apps/worker)  │
                        ▼                                  ▼                ▼
                 ┌─────────────┐      ┌──────────┐   ┌───────────────────────────┐
                 │ PostgreSQL  │      │  Redis   │   │ S3-compatible (MinIO dev) │
                 │ RLS + FTS   │      │ presence,│   │ VODs, demos, replays,     │
                 └─────────────┘      │ pub/sub, │   │ encrypted contracts       │
                                      │ ratelimit│   └───────────────────────────┘
                                      └──────────┘
   Arena Bridge (companion, later) ── GSI localhost ──► authenticated ingest endpoint
```

### 3.1 Monorepo (pnpm + Turborepo)

```
apps/
  web/                 Next.js UI + route handlers
  realtime/            Fastify: Socket.IO, Yjs provider, presence
  worker/              BullMQ workers: ingestion, reminders, expiry alerts, exports
packages/
  db/                  Drizzle schema, migrations, RLS policies, seed
  authz/               roles, permissions, can() — the single policy engine
  domain/              services (framework-free); used by web, realtime, worker
  schemas/             zod schemas shared by client/server; OpenAPI generation
  game-sdk/            GameModule interface + registry types
  games/{valorant,cs2,dota2,lol,rocketleague,eafc}/   one package per module
  providers/           adapter interface, rate limiter, CSV importer, mock adapters
  ui/                  tokens, components, motion presets, effects (WebGL, glass)
  config/              eslint, tsconfig, env validation (zod)
tooling/               module codegen, seed scripts, e2e helpers
docs/                  PLAN.md, DECISIONS.md, MODULES.md
```

### 3.2 The rules that make it safe

1. **`defineRoute({ permission, input, output, audit?, rateLimit })`** is the only way to write an API handler. It performs authn → tenant resolution → `can()` → zod validation → rate limit → handler → audit. A lint rule + test fails the build if a route file exports a handler without it. This is how "enforce on the server, never only in the UI" becomes structural instead of a habit.
2. **Two layers of tenant isolation.** Every tenant row carries `org_id`; the DB session sets `app.org_id` / `app.user_id` with `SET LOCAL`, and Postgres **RLS** policies enforce it. `can()` in `packages/authz` adds role/feature logic on top. A bug in one layer does not become a data leak.
3. **Domain logic lives in `packages/domain`, not in handlers or React.** Scheduling conflict detection, contract state machine, form/consistency metrics, burnout indicators are pure functions with unit tests.
4. **Everything nullable-by-source.** Any stat/match row records `source` (`riot_api | csv | manual | gsi | replay | demo | tournament_import`) and `confidence`. The UI shows provenance. Demo data has `is_demo = true` and renders a persistent "DEMO DATA" badge.

### 3.3 Realtime consistency model

| Object | Strategy | Why |
|---|---|---|
| Chat messages | Server-assigned monotonic `seq` per channel; client sends `client_msg_id` (idempotent); optimistic insert, reconciled on ack | Ordering + safe retry from the offline queue |
| Tactical boards, strat notes, scouting text | **Yjs CRDT**, persisted as binary snapshots + update log; awareness for cursors/presence | True concurrent edit without a lock; versioning = named snapshots |
| Schedules, tasks, roster, goals | Row `version` (optimistic concurrency). `PATCH` with `If-Match: version`; on `409` client rebases field-level and retries, or shows a merge sheet when the same field diverged | Structured data needs field-level, not text-level, merge |
| Presence | Redis hash + TTL heartbeat, fan-out via Socket.IO Redis adapter; states: online / practice / match / away / offline, derived from calendar + heartbeat | Cheap, self-healing |
| Live Guidance | Ephemeral pub/sub with an audience list computed server-side per message; also persisted for post-match review | Must never reach unpermitted screens |
| Offline | Connection-state banner; queue of idempotent **simple actions** (send message, RSVP, tick task, mark availability) in IndexedDB; replay on reconnect. Collaborative boards stay read-only offline with a clear message | Honest scope |

### 3.4 Game Module interface (`packages/game-sdk`)

```ts
export interface GameModule {
  id: string;                          // "valorant" — a string in the DB, never an enum
  meta: { name; shortName; editions?: {id; label; current}[] };
  theme: { accent; accentFg; gradient; icon; mapArtStyle };   // drives the animated theme switch
  roles: RoleDef[];                    // Duelist, Controller… / Carry, Support… / Striker…
  arenas: ArenaDef[];                  // maps, with callouts + board background assets
  sides?: SideDef[];                   // attack/defence, CT/T, Radiant/Dire; none for FC/RL
  statSchema: StatSchema;              // zod + metric definitions (below)
  metrics: MetricDef[];                // id, label, unit, aggregation, higherIsBetter, roleBaselines
  adapters: ProviderAdapter[];         // Riot, CSV, manual, ...
  board: { tokenKinds; layers; presets };               // tactical board assets
  scoutingTemplate: ScoutingTemplate;
  matchFormat: { bestOf; veto?: VetoRules; draft?: DraftRules };
  panels: { playerDashboard; teamDashboard; matchDetail; …: LazyComponent };
  liveGuidance: { allowed: 'always'|'ruleset-dependent'|'never'; warning: string };
}
```

- **Zero-touch registration.** `tooling/gen-modules.ts` globs `packages/games/*/module.ts` and emits `apps/*/generated/modules.ts`. Adding a seventh game = add one folder + run codegen (runs automatically in `predev`/`prebuild`). No core file is edited. A CI test proves this by adding a fixture module and asserting the app boots.
- **Stats are declarative.** Core dashboards render from `MetricDef[]`; game-specific panels are optional lazy components. `stat_snapshots.data` is JSONB with `schema_version`, validated by the module's zod schema on write.
- **Provider adapters** (`packages/providers`): `capabilities`, `fetchPlayerMatches`, `fetchMatchDetail`, `fetchOpponentSummary`, `parseFile?` and `healthCheck`. Each returns a `ProviderResult<T>` with `{data, source, fetchedAt, rawRef}`; raw payloads go to object storage so we can re-normalise without re-fetching. Upserts are idempotent on `(provider, external_match_id)`. **Every adapter set includes `manual` and `csv`** and a test asserts it.

---

## 4. RBAC

Roles: **Owner, Manager, Coach, Analyst, Player, Staff, Guest/Sponsor**. Org-level Owner/Manager cascade to all teams; Coach/Analyst/Player/Staff are assigned **per team** via `team_membership.role`. Guests are scoped to explicit shared resources.

`R` read · `W` read+write · `own` only own records · `grant` only with an explicit, revocable, audited grant · `—` none

| Feature | Owner | Manager | Coach | Analyst | Player | Staff | Guest |
|---|---|---|---|---|---|---|---|
| Org settings, billing, members | W | W (no billing) | — | — | — | — | — |
| **Contracts & payments** | W | W | — | — | — | — | — |
| Roster (public fields) | W | W | R | R | R | R | R (shared) |
| Roster (private: DOB, address) | W | W | — | — | own | — | — |
| Chat: read/post | W | W | W | W | W | W | R only, no post |
| Scheduling / availability | W | W | W | R | own W | R | — |
| Practice planner | W | W | W | R | R | R | — |
| Tasks | W | W | W | W | own | own | — |
| Analytics (stats) | W | R | W | W | R (own + team) | — | shared only |
| Scouting reports | W | R | W | W | R (published) | — | — |
| Strats / tactical boards | W | R | W | W | R | — | shared only |
| VOD review | W | R | W | W | R + comment on assigned | — | — |
| Live Guidance send / receive | send | — | send | send | receive | — | — |
| 1:1 notes | — | — | W (own authored) | — | R (only if shared) | — | — |
| **Wellness check-ins** | — | — | grant | grant | own W | grant | — |
| Recruitment / talent CRM | W | W | R | W | — | — | — |
| Sponsors & content calendar | W | W | R | — | — | R | R (own deal) |
| Audit log | R | R (no owner-actions) | — | — | — | — | — |

Design notes:
- The contract test "**Player cannot read contracts**" and "**Guest cannot post**" are in the M0 matrix test, generated from this table, so the table and code cannot drift. The matrix lives as data in `packages/authz/matrix.ts`; this document is regenerated from it.
- **Wellness is different:** default-deny even for Owner. A player creates `permission_grant(subject=staff_user, scope='wellness', expires_at)`. Enforced by RLS on `wellness_checkin` (not only app code), every read audited, and grants visible to the player at any time.
- Contract sharing with the subject player is an explicit per-document grant, default off (D-09).
- Audit log is append-only (DB role has `INSERT` but no `UPDATE/DELETE`), hash-chained (`prev_hash`) so tampering is detectable. Logged: contract view/edit/download/sign, payment change, role change, invite, export, deletion, wellness grant/read, file signed-URL issue, login from new device.

---

## 5. Data model

Postgres, Drizzle, `uuid v7` keys (time-sortable), `created_at/updated_at/deleted_at`, `version int` on shared mutable rows. Every tenant table has `org_id` and an RLS policy. Groups:

**Identity & tenancy** — `user`, `account`, `session` (Auth.js), `organization`, `membership` (org role), `team` (org + `game_id` + optional `edition`), `team_membership` (team role), `invite`, `game_account_link` (Riot/Steam/etc., encrypted tokens), `consent_record`, `guardian_consent`, `permission_grant`, `api_key`, `webhook`.

**Games** — `game` (registry mirror, string id), `game_module_config` (per-team overrides: enabled panels, scrim rules, stat targets).

**People** — `player_profile` (public-portfolio fields split from private), `staff_profile`, `talent` (CRM), `trial`, `transfer`.

**Comms** — `channel` (org/team/dm/structured), `thread`, `message` (`seq`, `type`: text/scrim_request/poll/vod_review_request/feedback_card, `payload jsonb`), `reaction`, `pin`, `voice_room`, `recording_consent`, `search_document` (tsvector + trigram, permission-tagged), `notification`, `notification_rule`.

**Ops** — `event` (practice/scrim/match/other, tz-aware `tstzrange` + IANA tz), `event_attendance`, `availability` (recurring rules + exceptions), `practice_template`, `practice_plan`, `task`, `action_item_link`, `calendar_feed` (ICS token), `activity_event`.

**Competition** — `opponent`, `match`, `match_participant`, `match_map`/`match_round` (game-agnostic core; game data in jsonb validated by module), `stat_snapshot`, `scouting_report` (+ versions), `scrim_listing`, `scrim_request`, `tournament`, `bracket`, `bracket_match`, `tournament_registration`.

**Tactics & review** — `strategy` (tags, owner, status), `tactical_board` (+ `board_snapshot`, Yjs update log), `lineup_asset`, `vod_asset`, `vod_comment` (timestamp + frame drawing json), `clip`, `clip_playlist`, `review_assignment`.

**People development** — `goal`, `feedback`, `one_on_one_note`, `wellness_checkin`, `load_metric` (derived).

**Money** — `contract`, `contract_version` (immutable, hash of file), `contract_signature` (signer, method, IP, UA, timestamp, doc hash), `payment`, `prize_split`, `budget`, `budget_line`, `sponsor`, `sponsor_deliverable`, `content_event`.

**Platform** — `audit_log` (hash-chained), `integration`, `provider_credential` (envelope-encrypted), `file_object` (bucket key, size, sha256, encryption key ref), `outbox_event` (transactional outbox → realtime/webhooks/notifications), `export_job`, `deletion_request`, `feature_flag`.

Important modelling choices:
- `team.game_id` is a string validated against the generated module registry, never a Postgres enum.
- Contract rows are only ever inserted (versions); "current" is a pointer. Status is a state machine in `domain` (`draft → sent → signed → active → expiring → ended`; `expiring` is derived from `end_date - notice_period`, not stored).
- Monetary values are `bigint` minor units + ISO 4217 currency; **no float money anywhere**. FX is display-only, rate stored per payment.
- Timezones: store UTC instants + the IANA zone of the event; recurring availability stores local wall-time + zone so DST is handled correctly.

---

## 6. Feature → milestone map

| Brief § | Milestone |
|---|---|
| Design system, shell, auth, orgs/teams/RBAC, game switcher, audit-log skeleton | **M0** |
| 5.1 channels/threads/DM/reactions/pins, structured messages (scrim request, poll, review request, feedback card), presence, notifications, global search (v1), Discord bridge (import first) | **M1** |
| 5.2 + 5.8 roster, presence board, scheduling + availability heatmap + conflict detection, practice planner, tasks, ICS feed (Google/Outlook OAuth sync later); **1:1 notes, goals, wellness check-ins (consent-gated), data export/deletion UI** | **M2** |
| 5.3 dashboards, 5.4 scouting, 5.5 tactical board + playbook, Valorant adapters | **M3** |
| 5.5 Live Guidance, 5.6 Match Day, 5.5b VOD review, voice rooms + Match Comms | **M4** |
| 5.7 contracts, e-sign, payroll, budgets, recruitment, transfers; 5.9 sponsors | **M5** |
| Five more Game Modules | **M6** |
| 5.6 tournament hub + scrim finder | **M7** |
| PWA + push, public profiles, API/webhooks, AI assistant, perf + a11y pass, GDPR/DPDP export & deletion hardening | **M8** |

Voice (LiveKit) moves from M1 to **M4** because Match Comms is its real reason to exist and it needs the consent + recording pipeline; M1 ships text + presence only. GDPR/DPDP export and deletion is **built incrementally** (each milestone registers its tables in a `personal-data-registry`), with the end-to-end flow verified in M8.

---

## 7. Milestones

Every milestone: runs end-to-end (UI + API + DB + realtime where relevant) → tests → commit → this file updated with **Done / Stubbed / Next**.

### M0 — Foundation
- Repo, pnpm/Turborepo, TS strict, ESLint (incl. custom `require-define-route` rule), Prettier, Vitest, Playwright, husky + lint-staged, GitHub Actions (typecheck, lint, unit, e2e, build), Docker Compose (Postgres, Redis, MinIO, Mailpit; LiveKit added M4), zod-validated env.
- `packages/ui`: tokens (colour, type, spacing, radius, elevation, motion) as CSS variables + Tailwind preset; dark primary, light supported; per-game accent theme via `data-game`; motion presets and a **motion setting** (system / full / reduced) honoured by Framer Motion `MotionConfig` and CSS.
- Component library on shadcn/ui primitives, each with loading/empty/error states: Button, Input, Select, Dialog, Sheet, Tabs, Table, Toast, Tooltip, Avatar, Badge, Skeleton, CommandPalette, EmptyState, ErrorState, ConnectionBanner.
- Auth (Auth.js unless the open question below changes it) with Discord + Google login; invites; org create; team create with game; membership + team roles.
- `packages/authz` with matrix-as-data, `can()`, generated test suite; `defineRoute`; RLS on all M0 tables; audit log v1 (append-only, hash chain).
- App shell: animated sidebar, route transitions (250–400 ms), **game-container switcher** with themed transition (accent morph + shader gradient), Cmd/Ctrl-K palette, animated onboarding flow.
- Seed script with clearly-labelled demo org.
- **Exit criteria:** `docker compose up` + `pnpm seed` → sign in → create org → invite → switch between two game containers; permission matrix tests green; Lighthouse ≥ 90 on `/login` and `/app` shell (with the WebGL layer lazy-loaded); axe clean.

### M1 — Comms + presence
Socket.IO service with Redis adapter; channels, threads, DMs, mentions, reactions, pins; structured message types as first-class objects; embeds; presence; notification centre + rules (in-app, email via Mailpit/SMTP now, push in M8, Discord webhook); offline action queue; FTS search v1; Discord history import (JSON export) with relay deferred. **Exit:** two browsers converse in real time, drop network, reconnect without loss or duplicates (Playwright).

### M2 — Team ops
Roster (role/status/availability/form placeholder/contract-status placeholder), tz-aware scheduling, availability heatmap, conflict detection (pure fn + property tests), practice planner with templates and attendance, load monitor v1, tasks board with match/person links, ICS export feed. **Exit:** optimistic version conflicts demonstrated in an e2e test with two clients. **Also: submit Riot production-key application** (needs working prototype).

### M3 — Valorant (deep)
Adapters: Riot (RSO link flow, match list/detail, rate-limited queue, mockable), CSV importer with mapping UI, manual entry. Player dashboard (role-aware, form curve, consistency, baselines, goals), team dashboard (map win rates, side splits, economy, compositions), compare view, scouting report builder + templates + auto pre-match brief, tactical board (Konva + Yjs, tokens for agents/utility, layers, timeline scrubbing, snapshots), playbook and lineup library, PDF + share-link reports. Charts follow the `dataviz` skill (colour-blind-safe palette + non-colour encodings). **Exit:** a CSV of 20 matches becomes a full dashboard; two coaches co-edit a board with cursors.

### M4 — Match Day + Live Guidance + VOD + voice
LiveKit in Compose; voice rooms with PTT, screen share; Match Comms (coach whisper, caller priority, **consent-gated** recording via Egress); Match Day full-screen (checklist, countdown sequence, sub status, veto helper, one-tap report); Live Guidance (audience-scoped cards, pings, timers, ruleset warning); VOD upload (multipart presigned) / link, timestamped comments, frame drawings, clips, review assignments.

### M5 — Contracts & finance
Encrypted document store + versioning, contract CRUD + state machine + timeline scrubbing UI, in-app signing flow (with legal caveats surfaced in-product and in docs), expiry/renewal BullMQ alerts, payments + schedules + prize splits + budget vs actual, talent CRM + trials + transfers, sponsors + deliverables. Every read/write audited. Manager/Owner only, verified by tests.

### M6 — Remaining modules
CS2 (GSI via Arena Bridge, demo parsing worker), Dota 2 (OpenDota adapter, GSI), LoL (Riot adapter, drafts), Rocket League (Ballchasing), EA FC (manual/CSV, edition config). Each on the shared interface with a conformance test suite (`game-sdk/conformance`) that every module must pass, and the "seventh module" fixture test.

### M7 — Tournaments & scrim finder
Brackets (single/double elim, groups, Swiss) as pure generators with property tests + a visual bracket (React Flow or custom SVG — decided by spike); external tournament tracking; small internal tournament hosting with check-in; scrim listings/requests/results.

### M8 — Polish
PWA + web push, performance pass, WCAG 2.2 AA audit (axe + manual screen-reader pass), public team/player profiles, public API + webhooks (OpenAPI from zod), AI assistant (Claude API; retrieval-only over the org's data; every claim cites the rows behind it; refuses to state a number not present in the data), GDPR/DPDP export + deletion end-to-end.

---

## 8. Testing strategy

- **Unit / property (Vitest):** authz matrix (generated), scheduling conflicts and DST, contract state machine, money math, bracket generators, form/consistency metrics, burnout rules, CSV mappers, adapter normalisers (recorded fixtures, never live calls in CI).
- **Integration:** real Postgres + Redis via Testcontainers; RLS tests that connect as a tenant-scoped role and attempt cross-tenant reads (must return 0 rows); audit-log immutability test.
- **Contract tests:** every Route has a schema; OpenAPI snapshot diff in CI.
- **E2E (Playwright):** onboarding → invite → switch game; two-browser chat with offline/reconnect; scheduling conflict; contract visible to Manager, 403 for Player; board co-edit; Match Day flow; reduced-motion run of each critical flow.
- **Quality gates:** axe on every route in CI, Lighthouse CI budget (perf ≥ 90 on core screens), bundle-size budget, `tsc --noEmit`, lint, no `any` in `packages/domain`.

---

## 9. Security, privacy, compliance

- **Encryption:** contracts and provider tokens use **envelope encryption** (AES-256-GCM data key per object, wrapped by a master key from env/KMS; key id stored on `file_object`). MinIO/S3 SSE additionally on. Files are only ever served via short-lived signed URLs (each issuance audited); no public buckets.
- **Rate limiting:** Redis token buckets per user/IP/org on every route + stricter on auth, invites, exports, signed-URL issuance. Input validated by zod on every endpoint (enforced by `defineRoute`). CSP, HSTS, strict cookies, CSRF for cookie-auth mutating routes.
- **Voice recording consent:** recording cannot start until every participant present has an explicit consent record for that room session; a persistent recording indicator is shown; late joiners are prompted and recording pauses until resolved. Consent is stored and auditable.
- **GDPR / DPDP (India):** consent records per purpose, notice at collection, data export (JSON + files zip), deletion with a **retention-hold** where law requires keeping records (e.g. financial/contract records) — the deletion request UI explains what was erased and what was retained and why. Personal-data registry maps every table/column to a purpose and retention rule. **Minors:** esports rosters often include under-18 players. `date_of_birth` is captured; under-18 accounts require guardian consent (`guardian_consent`) and behavioural-tracking-style features (wellness analytics, performance profiling shared externally, public profiles) are off until it is recorded. Exact obligations and timelines under the DPDP Act and its Rules **must be confirmed with counsel before launch** — this plan builds the mechanisms, it is not legal advice.
- **Wellness:** stored separately, RLS-enforced, explicit grants, all reads audited, burnout indicators are transparent deterministic rules over the player's own submissions, and always display the inputs. No ML, no inference from non-submitted data.
- **E-signature caveat:** the in-app flow captures signer identity (email OTP), intent, timestamp, IP/UA and document hash, giving a defensible audit trail, but enforceability varies by jurisdiction and document type; some contracts (e.g. minors, certain employment terms) need counsel-reviewed formats or a recognised provider (e.g. Aadhaar eSign in India). The signing layer is an interface so a provider can be swapped in.
- **Scrapers:** scouting scrapers are off by default, per-source, honour robots.txt and rate limits, display a "may violate source terms" warning, and are never used for logged-in or gated content.
- **Compliance with game publishers:** Riot disclaimer displayed in the footer/about; no unfair-advantage features; no gambling; no memory reading; GSI only via sanctioned config files.

---

## 10. UI direction & tooling plan

**Feel:** premium game client × modern productivity tool. Dark-first, crisp 1 px borders, restrained depth, alive-but-not-noisy.

**Type:** a strong display face for headings (candidates: *Space Grotesk*, *Sora*, *Unbounded* — final pick after a spike screenshot comparison) with *Inter* or *Geist* for UI; tabular numerals in all stat displays. Self-hosted via `next/font`.

**Motion:** micro 120–220 ms, route 250–400 ms; `layoutId` shared-element list→detail; animated numbers; skeletons that match final layout; GSAP only for the Match Day countdown and contract-timeline scrub. Global `MotionConfig` + `useReducedMotion` fallback (opacity-only) + in-app setting.

**How each requested repo/plugin is used** (and where it is *not* used):

| Item | Use | Guardrail |
|---|---|---|
| **react-three-fiber** (v9, React 19) | Onboarding hero, game-switcher transition backdrop, Match Day countdown backdrop. | Client-only, `dynamic(..., {ssr:false})`, mounted on `IntersectionObserver`, DPR ≤ 1.5, paused when tab hidden. **Never on data-dense screens** (chat, dashboards, tables). |
| **shadergradient** (`@shadergradient/react`, R3F ^9) | Ambient per-game backdrop behind the shell header/switcher and auth pages; colour bound to the game accent token. | Falls back to a static CSS gradient when `prefers-reduced-motion`, motion setting = reduced, WebGL unavailable, low-power/`hardwareConcurrency ≤ 4`, or Save-Data. |
| **liquid-glass-js** | **Spike only** (half a day in M0): evaluate on 2–3 small static surfaces (switcher pill, command palette). Its html2canvas capture is a poor match for live-updating content. | Isolated in `packages/ui/effects`, behind a flag. Default glass is **CSS `backdrop-filter`** (+ optional SVG displacement filter as Chromium progressive enhancement). Decision recorded in D-15 after the spike. |
| **liquid-logo** | It is a standalone tool, not a package: use it (MIT) to design the animated brand mark, export MP4/PNG for marketing, and port the *idea* (edge-detect + fluid shader) to a small R3F shader for the logo on the login/onboarding screens if the spike looks right. | Attribution retained; asset generated once, not runtime-heavy. |
| **ui-aesthetics-skill** | Install into `.claude/skills/ui-aesthetics/`; apply at every UI review: hierarchy before decoration, restraint, motion that clarifies. | I will read its SKILL.md before enabling it. |
| **superpowers** | Plugin providing brainstorming / TDD / plan / verification workflows. Install by you in an interactive session (`/plugin install superpowers@claude-plugins-official`); I cannot run `/plugin` commands from here. | Optional; the repo works without it. |
| **ruflo** | **Recommendation: skip.** It is a large multi-agent harness that registers its own MCP server and swarm/memory layer, overlapping Claude Code's built-in subagents, and adds a sizeable third-party execution surface to a repo that will hold contract and wellness code. Your call — see open question Q5. | If you say yes, install in a throwaway worktree first and review what it writes. |
| Skills available to me now | **`dataviz`** for every chart (palette, mark specs, legend/tooltip rules, colour-blind safety) — used from M3. `theme-factory`, `canvas-design`, `web-artifacts-builder`, `artifact-*` target standalone artifacts/documents, not this Next.js app, so they are **not** used for the product UI (I may use `canvas-design` for brand poster assets). | — |

**Performance budget:** core screens ship zero WebGL in the critical path; heavy canvases (Konva boards, R3F) are route-level dynamic imports; only `transform`/`opacity` animated; `content-visibility` on long lists; virtualised message list; image/asset budgets enforced by Lighthouse CI.

**Accessibility:** WCAG 2.2 AA tokens verified for contrast in both themes at token-definition time (script), visible focus ring token, roving-tabindex keyboard model, ARIA live regions for realtime events (polite), charts always pair colour with shape/pattern/label, data-table alternatives for every chart, every animation has a reduced-motion equivalent.

---

## 11. Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | Riot production key approval is slow or denied | High / High | Apply at end of M2 with working prototype; whole product works via CSV/manual; adapter mockable; Riot code path isolated. Personal keys are refused for VALORANT, so do not plan on them |
| R2 | WebGL polish blows the Lighthouse ≥ 90 budget | Medium / Medium | Strict guardrails in §10; Lighthouse CI on every PR; fallback gradients |
| R3 | Scope: this is ~9 products | High / High | Vertical slices, module conformance suite, cut-list per milestone (§12) |
| R4 | Realtime conflict bugs (chat ordering, CRDT growth) | Medium / High | Server `seq`, idempotency keys, Yjs snapshot compaction, two-client e2e tests |
| R5 | Cross-tenant data leak | Low / Critical | RLS + `can()` + generated matrix tests + cross-tenant integration tests in CI |
| R6 | Contract/e-sign legal exposure | Medium / High | Provider interface, in-product caveats, counsel review before real use |
| R7 | Minors' data (DPDP/GDPR) | Medium / High | DOB + guardian consent gates from M0 schema; counsel confirmation |
| R8 | Third-party API/ToS drift (OpenDota, Ballchasing, scrapers) | Medium / Medium | Adapter isolation, recorded fixtures, health checks, scrapers off by default |
| R9 | Live Guidance misused where rulesets forbid coach comms, or perceived as in-game advantage | Medium / High | Human-authored only, ruleset warning acknowledgement per match, org-level "disable live guidance" switch, no publisher data piped in |
| R10 | Node 25 on this machine is a non-LTS line and no `pnpm` | Certain / Low | Pin Node 22/24 LTS via `.nvmrc` + `engines`; Docker images on LTS; `npm i -g pnpm`; CI pinned to LTS |
| R11 | Auth library churn (Auth.js maintenance status) | Medium / Medium | Verify at M0 scaffold; wrap behind `packages/authn` so it can be replaced |

---

## 12. Cut-list (if a milestone runs long, cut in this order)

Discord relay (keep import) → Google/Outlook calendar OAuth sync (keep ICS) → OCR for FC → clip playlists → Swiss pairings → AI assistant → shared-element transitions on secondary screens → light theme polish.

---

## 13. Open questions (max 5 — defaults apply if unanswered)

**Resolved 2026-09-21:** Q1 Auth.js · Q3 India-first hosting · Q4 minors supported (guardian consent in M0) · Q5 skip ruflo. **Still open:** Q2 (Riot developer account) — proceeding with the mock + CSV default.

| # | Question | Default I will use |
|---|---|---|
| Q1 | **Auth: self-hosted Auth.js vs hosted Clerk?** Clerk is faster to ship but sends user identity to a US vendor (relevant to DPDP) and adds per-MAU cost; Auth.js keeps data in our DB and lets the Fastify service verify sessions directly. | Auth.js, wrapped behind `packages/authn` |
| Q2 | **Do you already have (or can you register) a Riot developer account?** Applying early is the only way the live Riot integration ships in a reasonable time. | Build against mock + CSV; you register and I prepare the application text |
| Q3 | **Where will this be hosted / where do users live?** India data residency vs EU vs US changes region choices and DPDP/GDPR posture. | Cloud-agnostic Docker; Postgres/S3 region configurable; India-first assumptions |
| Q4 | **Are under-18 players expected on rosters?** Determines whether guardian-consent gating is built in M0 or deferred. | Built in M0 (cheap now, expensive later) |
| Q5 | **Install `ruflo`?** (see §10) | No |

---

## 14. Progress log

| Milestone | Status |
|---|---|
| Planning | ✅ Done |
| **M0 Foundation** | ✅ **Done (2026-09-21)**: see below |
| **UI redesign pass** | ✅ **Done (2026-09-22)**: see below |
| M1–M8 | ⬜ Not started |

### M0: what is done

- **Repo & tooling:** pnpm 12 + Turborepo monorepo, TypeScript strict, ESLint 9 (incl. React-hooks rules), Vitest, Playwright, GitHub Actions CI (lint, typecheck, unit/integration, build, e2e), Docker Compose (Postgres 18, Redis, MinIO, Mailpit), zod-validated env that **refuses** dev login / placeholder secrets / missing master key in production.
- **Auth & tenancy:** Auth.js (beta v5, JWT sessions) with email link, optional Discord/Google, dev-only demo login; organisations, game containers (teams), memberships, per-team roles, invitations (hashed tokens, 7-day expiry, email-bound), role changes with owner/manager rules and last-owner protection.
- **RBAC & data safety:** permission matrix as data (176 generated tests + named guarantees: Player cannot read contracts, Guest cannot post, wellness default-deny, managers cannot see owner-only audit entries); **Postgres RLS** on every tenant table with a non-superuser runtime role; tests run **as that role** and prove cross-tenant reads/writes fail; append-only, **hash-chained audit log** with tamper detection; `defineRoute` (authn → CSRF/origin → rate limit → membership → permission → validation) with an architecture test that fails if any API route bypasses it.
- **Minors:** date of birth captured, guardian-consent request + public consent page, gated-feature policy (`featureAllowedForUser`), shell banner.
- **Game Modules:** SDK contract + conformance suite; six modules (data only) with accent themes verified for WCAG contrast; codegen registry, with a test proving a 7th game is discovered from a new folder alone; EA FC edition modelled as data (FC 27 current).
- **Design system:** token source of truth in TS → generated CSS (dark primary, light supported, per-game accent as registered `@property` so it morphs); 36 contrast tests + a drift test (that test exists because a real naming bug slipped through and the a11y e2e caught it); 18 components with loading/empty/error states; motion + theme providers with an **in-app motion setting**; Space Grotesk + Geist.
- **App shell:** animated sidebar (`layoutId` active pill), **game-container switcher with themed flood transition**, Cmd/Ctrl-K palette, connection banner, route transitions, animated onboarding flow (profile → guardian → org → first team), overview / team home / members + invites / audit log / settings pages, each with loading, empty and error states. Seed script with clearly-labelled **DEMO DATA** org.
- **Verification (all run on this machine):** 318 unit + integration tests, 17 Playwright tests (permissions, CSRF, onboarding, accent morph, reduced motion, axe WCAG 2.2 AA on 6 screens: **0 violations**), lint clean, typecheck clean, production build OK. Lighthouse (production build, mobile defaults): **accessibility 100, best-practices 96, performance 89–97** (team page 89, everything else ≥ 90; LCP ≈ 3.5 s under simulated slow 4G is the main remaining cost, targeted in M8).

### M0: what is stubbed or deferred (honest list)

- Data sources for every game show **"Not built yet"**; manual entry/CSV land in M2/M3.
- **No realtime yet** (chat, presence, live cursors): `ConnectionBanner` reflects browser online/offline only.
- Riot / Discord / Google OAuth buttons render only when credentials are configured; none are tested against the real providers.
- `liquid-glass-js` spike **not done** (glass is CSS `backdrop-filter`); `liquid-logo` brand mark not produced; font pairing chosen without the planned visual spike.
- Emails are sent inside the DB transaction (no outbox); no CSP header; `users` table is not under RLS; JWT sessions have no server-side revocation (see D-33, D-40).
- Data export / account deletion UI, wellness check-ins, goals, 1:1 notes (brief §5.8) are **not built**; scheduled into M2.
- CI workflow is written but **has not run on GitHub** (no remote configured); the same steps pass locally.
- `ruflo` intentionally not installed; `superpowers` requires you to run `/plugin install superpowers@claude-plugins-official` in an interactive session.

### UI redesign pass (2026-09-22): what is done

Route: full rebuild of the visual layer (thesis "liquid broadcast console"). See `docs/DESIGN_QA.md` for the checklist and measurements, `docs/PREMIUM_ROADMAP.md` + `docs/RISKS.md` for the premium plan (awaiting your review), `CHANGELOG.md` for user-facing notes.

- **Repos used:** `react-three-fiber` (liquid mark canvas), `shadergradient` (sign-in/onboarding field), **`liquid-logo`** (shader ported to R3F with a procedural hexagon mask, tinted per game), **`liquid-glass-js`** (vendored `container.js` with a `destroy()` leak fix and `html2canvas-pro`, on sign-in/onboarding only, CSS fallback). Skills used: `ui-aesthetics` (thesis, non-card layouts, restraint), `dataviz` (sparkline/bars/role-coverage specs). `superpowers` was not installable from here; `ruflo` skipped by decision.
- **New:** condensed display type + mono eyebrows, obsidian palette, non-card section layout, signature intro (2.4 s, skippable), per-game background art + themed switch transition, sparkline/bar/role-coverage components on **real** data (`getOrgOverview`, tested against RLS), empty-state art, command palette 2.0 (actions, recents, `g`-chords), opt-in synthesized sound.
- **Verified:** 321 unit/integration tests, 30 Playwright tests (incl. intro skip/auto-dismiss/reduced-motion, sound opt-in, palette actions, glass fallback, light-theme axe), lint, typecheck, production build. Lighthouse: a11y 100, best-practices 96, CLS 0, perf 89–91; **LCP 2.9–3.8 s misses the 2.0 s target**.

### Redesign: stubbed / not done

- Tier 1 features are **not started** (waiting for your review of the roadmap). Not built: customisable dashboards, Season Wrapped, undo/version history, guided onboarding checklists.
- Onboarding and Join/Guardian pages are not in the axe sweep; no human screen-reader or colour-blind-simulation pass yet.
- Intro/hero moments are judged from screenshots and automated tests; frame-rate on real GPUs was not measured.

### Next: M1, Comms + presence

`apps/realtime` (Fastify + Socket.IO + Redis adapter), channels / threads / DMs / mentions / reactions / pins, structured message types (scrim request, poll, review request, feedback card), presence, notification centre + rules, offline action queue, FTS search v1, Discord history import. Before starting: add a `session_version` claim so realtime tickets can be revoked; decide Auth.js beta vs. alternatives (D-33).
