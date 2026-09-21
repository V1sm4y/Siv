# Premium Roadmap

_Written 2026-09-21 against the code as it exists today (Milestone 0 + the UI redesign pass). Scores are my judgement, not measurements; the reasoning is in §4._

## 1. Where the product actually is

Built and verified: auth, organisations, game containers, invitations, RBAC enforced in the API **and** Postgres RLS, hash-chained audit log, guardian consent for minors, six data-only Game Modules, design system, animated shell, onboarding, and (this pass) a full visual redesign.

**Not built:** chat/presence (M1), scheduling/roster ops (M2), Valorant analytics/scouting/boards (M3), Match Day/VOD (M4), contracts/finance (M5), the other five game modules in depth (M6), tournaments (M7).

That matters for tiering. The addendum assumes M0–M3 exist. They don't, so most of the **Intelligence layer (A)** cannot be built honestly yet: a "grounded" Copilot with nothing stored to ground on would be either empty or (worse) invented. The ordering below reflects that.

## 2. Scoring method

| Axis | Scale | Meaning |
|---|---|---|
| **Impact** | 1–5 | Effect on adoption, retention, willingness to pay, or trust. |
| **Effort** | 1–5 | 1 ≈ days, 3 ≈ 1–2 weeks, 5 ≈ a month or more, including tests and states. |
| **Risk** | 1–5 | Legal / ToS / privacy / security exposure if done wrong (detail in `RISKS.md`). |
| **Deps** | text | What must exist first. |
| **Ratio** | Impact ÷ Effort, rounded | Used for ordering inside a tier. |

Tier rules: **Tier 1** = buildable on today's architecture *or* cheap now and expensive to retrofit later. **Tier 2** = high value but blocked on an unbuilt milestone. **Tier 3** = design for, do not build.

## 3. Scored backlog

### A. Intelligence layer

| Feature | Impact | Effort | Risk | Deps | Tier |
|---|---|---|---|---|---|
| Team Copilot (grounded AI) | 5 | 4 | 3 | Stored match/scrim/roster data (M2–M3); retrieval layer; citation model | **2** (after M3) |
| Auto post-match report | 5 | 3 | 2 | Match data + edit/publish flow (M3) | **2** |
| Practice recommender | 4 | 3 | 2 | Scheduling + performance gaps (M2–M3) | **2** |
| Opponent tendency engine | 4 | 4 | 3 | Scouting data (M3); sample-size logic | **2** |
| "What changed?" diff view | 4 | 3 | 1 | Time-series stats (M3) | **2** |
| Role-fit / roster-balance | 4 | 2 | 1 | Roster + in-game roles. **Partly live now** as *role coverage* on team pages | **1 (extend later)** |
| Win-probability / momentum | 3 | 4 | 2 | Per-round data; must be labelled as estimates | **3** |
| Meeting & comms summaries | 3 | 4 | **5** | Voice (M4), consent-gated transcription, wiretap/DPDP law | **3** |

### B. Scheduling and operations

| Feature | Impact | Effort | Risk | Deps | Tier |
|---|---|---|---|---|---|
| Smart scheduler | 5 | 3 | 1 | Availability + events (M2) | **2** (first item after M2) |
| Scrim network | 4 | 4 | 3 | M2, reputation model, abuse controls | **2** |
| Tournament ops kit | 4 | 4 | 2 | M4/M7 | **2** |
| Bootcamp / travel logistics | 2 | 3 | 2 | Finance (M5) | **3** |
| Equipment & account inventory | 2 | 2 | **4** (credentials) | Reference-only entries, no plaintext secrets | **3** |

### C. Money, contracts, sponsors

| Feature | Impact | Effort | Risk | Deps | Tier |
|---|---|---|---|---|---|
| Multi-currency finance | 4 | 4 | 3 | Contracts/payments (M5); FX source | **2** |
| Prize-money splitter | 4 | 3 | 3 | M5; auditable statements | **2** |
| Contract intelligence | 4 | 4 | **4** (not legal advice) | M5 documents + clause library | **2** |
| Sponsor portal | 4 | 3 | 2 | Guest role exists ✔; content calendar (M5) | **2** |
| Expense reports & approvals | 3 | 3 | 2 | M5 | **2** |

### D. Player and talent ecosystem

| Feature | Impact | Effort | Risk | Deps | Tier |
|---|---|---|---|---|---|
| Verified player portfolio | 4 | 3 | **4** (Riot RSO, minors) | M3 linked accounts; guardian gate ✔ | **2** |
| Talent marketplace / recruitment | 4 | 5 | **4** | Cross-org discovery, minors, employment norms | **3** |
| Trial scorecards | 3 | 2 | 2 | Talent CRM (M5) | **2** |
| Development pathways | 3 | 3 | 1 | Roster + goals (M2) | **2** |
| Wellbeing suite | 4 | 3 | **4** | Consent ✔, RLS grants ✔; **needs M2 UI** | **2 (first after M2)** |

### E. Communication upgrades

| Feature | Impact | Effort | Risk | Deps | Tier |
|---|---|---|---|---|---|
| Live Match Comms 2.0 | 5 | 5 | 3 | LiveKit + consent pipeline (M4) | **2** |
| Async video feedback | 3 | 4 | 3 | VOD (M4), storage | **2** |
| Structured decisions / polls | 4 | 2 | 1 | Chat (M1) | **2** (ships with M1) |
| Migration tools (Discord/Sheets/Notion) | 4 | 3 | 2 | M1/M2 data models | **2** |
| Bots & integrations, public API | 4 | 4 | 3 | Scoped API keys; M1 | **2** |

### F. Platform, trust, business

| Feature | Impact | Effort | Risk | Deps | Tier |
|---|---|---|---|---|---|
| **Security suite:** 2FA, session mgmt, audit search/export, data export & deletion | 5 | 3 | 2 | Sessions (needs `session_version`, D-33), audit ✔ | **1** |
| **Localisation (i18n) infrastructure** en/es/pt/hi + RTL-ready layout | 4 | 3 | 1 | Cheap now, painful to retrofit into every string | **1** |
| **Feature flags + billing/plans** (Stripe, seats, trials, usage) | 5 | 4 | 3 | Orgs ✔; India recurring-payment rules | **1** |
| **Observability** (structured logs, tracing, error monitoring, privacy-respecting analytics) | 4 | 2 | 1 | None | **1** |
| SSO (Google/Microsoft) | 3 | 3 | 2 | Auth layer | **2** |
| White-label & custom domains | 3 | 4 | 3 | Billing tier; TLS/domain-takeover controls | **2** |
| Enterprise: IP allow-lists, encrypted backups, status page | 3 | 3 | 2 | Infra | **2** |
| PWA + push | 4 | 3 | 1 | M1 notifications | **2** |
| Desktop companion (Tauri/Electron) | 3 | 5 | **5** (anti-cheat/overlay ToS) | **Design only** | **3** |
| Native mobile apps | 3 | 5 | 1 | Design spec only | **3** |

### Polish and experience (cross-cutting)

| Item | Impact | Effort | Risk | Status |
|---|---|---|---|---|
| Visual redesign, signature intro, themed game-switch, data-visual language, empty-state art, microcopy | 5 | 4 | 1 | **Done in this pass** |
| Sound design (off by default) | 2 | 2 | 1 | **Done in this pass** |
| Command palette 2.0 (actions, recents, chords) | 4 | 2 | 1 | **Done (v1) in this pass**; item-level search grows with each module |
| Undo / version history | 4 | 3 | 1 | **Tier 1 infra**: needs a shared revision model before M2 adds mutable objects |
| Guided onboarding checklists + sample-data mode | 4 | 3 | 1 | **Tier 1** (demo seed already exists; needs in-app "sample data" toggle) |
| Customisable dashboards | 3 | 4 | 1 | **Tier 2**: needs real widgets from M2–M3 |
| Season Wrapped / milestones | 3 | 3 | 1 | **Tier 2**: needs a season of data; no streak mechanics |
| Performance (LCP < 2.0 s, no CLS) | 4 | 3 | 1 | **Ongoing**: see §5 |

## 4. Why this order

Everything that makes the product feel *premium* on day one is either **trust** (security, data export/deletion, observability), **reach** (i18n: Hindi/Spanish/Portuguese from the start, since retrofitting strings later touches every file), or **business readiness** (feature flags and billing, since every later premium feature needs a gate). Those four are independent of the unbuilt milestones, so they are Tier 1 even though none is glamorous.

The glamorous features (Copilot, post-match reports, opponent engine, smart scheduler) all consume data that M1–M3 will create. Building them now means demoing on invented data, which the brief forbids. They are Tier 2 and should follow M2/M3 in this order: **smart scheduler → wellbeing → auto post-match report → Copilot**, because each depends on the one before (availability → consent-gated player data → match data → retrieval over all of it).

The high-risk items (meeting transcription, talent marketplace with minors, desktop overlays, equipment credentials) are Tier 3: designed, documented in `RISKS.md`, not built.

**My recommendation:** Tier 1 below, then continue M1 → M2 → M3, then Tier 2 in the order above. I would not start the Intelligence layer before M3 exists.

## 5. Tier 1: proposed build list (awaiting your review)

| # | Item | Scope | Exit criteria |
|---|---|---|---|
| 1 | **Security suite** | `session_version` revocation, session list + "sign out everywhere", TOTP 2FA with recovery codes, audit search + CSV/JSON export, data export (zip) and deletion request with retention holds | Permission tests; 2FA e2e; export contains every table in the personal-data registry |
| 2 | **i18n infrastructure** | `next-intl`, extracted strings, en/es/pt/hi catalogues, locale-aware dates/numbers/currency, logical CSS properties (RTL-ready), pseudo-locale test | No hard-coded UI strings (lint rule); pseudo-locale e2e; Hindi renders correctly |
| 3 | **Feature flags + plans** | Flag service (DB + cache), plan entitlements (free / team / org), seat counting, usage dashboard, Stripe Checkout + webhooks in **test mode**, trial logic | Entitlement tests; webhook idempotency tests; gates enforced server-side |
| 4 | **Observability** | Structured JSON logs with request ids (already threaded), OpenTelemetry tracing, error monitoring hook, privacy-respecting product analytics (no PII, opt-out) | Trace across web → DB; analytics events documented; consent honoured |
| 5 | **Undo & revision model** | Generic `revision` table + `withRevision()` helper; soft-delete + undo toast for destructive actions; adopt on teams/invites | Undo tests; revision history UI on one entity |
| 6 | **Guided onboarding + sample-data mode** | Role-based checklists, dismissible tips (persisted), in-app sample-data toggle (uses seeded `is_demo` data) | Checklists per role; permanent dismissal; demo badge always visible |

Not in Tier 1 by choice: Intelligence, marketplace, desktop app.

## 6. Delivered in the redesign pass (2026-09-21)

Full visual-system rebuild (route: **full rebuild**, thesis "liquid broadcast console": a quiet flat base plane, one live accent, and liquid material reserved for floating layers and brand moments):

- Liquid-metal brand mark (R3F port of liquid-logo's shader, tinted per game), signature intro (< 3 s, skippable, Esc), themed game-switch transition with per-game background art.
- `liquid-glass-js` (vendored, MIT, with leak fix and modern-colour snapshotting) on the sign-in and onboarding surfaces, with a CSS-glass fallback.
- Non-card layouts, condensed display type + mono labels, real-data sparklines/meters/role-coverage, custom empty-state art, opt-in sound cues, palette actions + recents + `g`-chords.
- Full details and the QA checklist: `docs/DESIGN_QA.md`; user-facing notes: `CHANGELOG.md`.
