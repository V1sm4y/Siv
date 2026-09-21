# Risks

_Legal, ToS, privacy and security risks per feature, with mitigations. Written 2026-09-21. I am not a lawyer; items marked **⚑ UNSURE** need counsel or verification against the current provider terms before any build. Severity: L / M / H / C(ritical)._

## How to read this

Each row: what could go wrong → severity → mitigation → status (**built** / **designed** / **flagged**). Risks already handled in the codebase are listed so reviewers can see what is *not* open.

## 1. Already mitigated in the current build

| Risk | Sev | Mitigation | Status |
|---|---|---|---|
| Cross-tenant data leak | C | Postgres RLS + `can()`; tests run as the non-superuser runtime role | built |
| Client-only permission checks | H | `defineRoute` mandatory; architecture test | built |
| CSRF on JSON endpoints | M | Origin check + JSON-only content type | built |
| Invite-token theft / brute force | M | 256-bit tokens, only SHA-256 stored, email-bound, 7-day expiry, rate-limited | built |
| Dev login reaching production | C | Config validation refuses; provider not registered in production; verified by the production-mode Lighthouse run returning 500 until reconfigured | built |
| Audit tampering | H | Append-only DB role + per-org hash chain, verified in UI for owners | built |
| Minors' data | H | DOB captured, guardian consent flow, gated feature policy | built (counsel review pending) |
| Open redirect via `?next=` | M | `safeNext` allow-lists relative paths | built |
| **liquid-glass-js page snapshot** | L | Snapshot is rendered client-side into a local WebGL texture (no upload). It captures whatever is on screen, so it is **only mounted on the sign-in / onboarding screens** (no member data), never in the authenticated shell | built |
| WebGL/perf harming low-power devices | M | Capability + reduced-motion + Save-Data + visibility gates; CSS fallbacks everywhere | built |
| Autoplaying audio | L | Sound cues are **off by default**, start only after a user gesture, and respect the toggle | built |

## 2. Open risks by feature group

### A. Intelligence layer

| Feature | Risk | Sev | Mitigation | Status |
|---|---|---|---|---|
| Team Copilot | Hallucinated stats presented as fact | H | Retrieval-only; every claim cites stored rows; refuses when data is insufficient; number-verification pass that rejects any figure not in the retrieved set | designed |
| Team Copilot | Sending org/player data to an LLM provider (privacy, DPDP cross-border) | H | Explicit org opt-in; strip direct identifiers; minors' data excluded unless guardian-consented; provider DPA; region setting. **⚑ UNSURE:** DPDP cross-border transfer status of the chosen provider | flagged |
| Post-match report / practice recommender | Coaching advice framed as certainty; biased by small samples | M | Show sample size + confidence; coach edit before publish; "why" panel | designed |
| Opponent tendency engine | Scraping opponent data against source ToS (VLR/Liquipedia) | H | User-uploaded/official-API data first; scrapers off by default, robots.txt + rate limits | designed |
| Opponent engine | Defamation / privacy of named opponents | M | Only factual, sourced match data; no free-text profiling of individuals | designed |
| Win-probability | Presenting estimates as predictions | L | Always labelled "estimate" with method and data window | designed |
| Meeting transcription | Recording consent, wiretap laws (all-party consent jurisdictions), DPDP, minors | **C** | All-party consent record before start, visible indicator, no recording of minors without guardian consent, retention limits, delete-on-request. **⚑ UNSURE:** per-jurisdiction rules; treat as **Tier 3, do not build** until counsel signs off | flagged |

### B. Scheduling and operations

| Feature | Risk | Sev | Mitigation | Status |
|---|---|---|---|---|
| Smart scheduler | Over-scheduling minors / ignoring school hours; overtraining | M | Hard recovery and school-hours constraints; explain each choice; load monitor | designed |
| Scrim network | Harassment, spam, doxxing between orgs; reputation gaming | H | Org verification, block/report, rate limits, reputation from logged events only, no free-text public reviews | designed |
| Scrim network | Sharing rosters (incl. minors) cross-org | H | Publish team-level info only; no player PII; opt-in | designed |
| Tournament ops kit | Evidence attachments contain personal data | M | Access limited to admins; retention policy | designed |
| Equipment/account inventory | Storing game-account credentials | **H** | **Never store plaintext**; reference-only entries or a vault integration | designed |

### C. Money, contracts, sponsors

| Feature | Risk | Sev | Mitigation | Status |
|---|---|---|---|---|
| Contract intelligence | Read as legal advice | H | Persistent "not legal advice" disclaimer; highlights are prompts to ask counsel; no automated legal conclusions | designed |
| E-signature | Enforceability varies (minors, employment, jurisdiction) | H | `SignatureProvider` interface; recognised provider where required (e.g. Aadhaar eSign in India); caveats in product. **⚑ UNSURE:** validity by jurisdiction | designed |
| Contract/payroll data | Highest-sensitivity data | C | Envelope encryption (AES-256-GCM), signed URLs, owner/manager only, every access audited | designed |
| Multi-currency | Wrong/stale FX presented as authoritative | M | Store rate, source and date per entry; labelled | designed |
| Prize splitter | Disputes over statements | M | Immutable, versioned, auditable statements; rules shown | designed |
| Sponsor portal | Sharing analytics a sponsor shouldn't see; misleading "reach" numbers | M | Org chooses fields; numbers must come from connected sources or be labelled "self-reported" | designed |
| Expenses | Receipt images with personal data | L | Same file controls as contracts | designed |

### D. Player and talent ecosystem

| Feature | Risk | Sev | Mitigation | Status |
|---|---|---|---|---|
| Verified portfolio | Publishing game data publicly without consent (**Riot requires RSO opt-in and warns linking makes data public**) | H | Explicit per-player opt-in per field; guardian consent for minors; revocable | designed |
| Verified portfolio | Coach references shown without permission | M | Per-reference permission | designed |
| Talent marketplace | Minors contacted by adults; grooming/safeguarding | **C** | **Tier 3.** Under-18 excluded or guardian-mediated, verified orgs only, message controls, reporting, safeguarding review. **⚑ UNSURE:** employment/agency regulation | flagged |
| Trial scorecards | Bias / discriminatory criteria; retention of candidate data | M | Criteria limited to role performance; retention limit; candidate can request deletion | designed |
| Wellbeing suite | Mistaken for medical advice; data misuse (**the most sensitive feature**) | **H** | Player-first visibility, explicit revocable grants (built: `permission_grants`), no scoring/diagnosis, crisis resources, RLS default-deny even for owners, reads audited. Guardian gate for minors (built). **⚑ UNSURE:** regional rules on health-adjacent data | designed |

### E. Communication upgrades

| Feature | Risk | Sev | Mitigation | Status |
|---|---|---|---|---|
| Voice/Match Comms | Recording without consent | H | Consent record from every participant, indicator, pause on unconsented join (D-26) | designed |
| Live Guidance | Violates tournament rules or gives in-game advantage from game data | H | Human-authored only; ruleset warning; never piped from publisher data; org-level off switch | designed |
| Async video feedback | Personal data in clips; storage abuse | M | Size/duration limits, access follows VOD permissions | designed |
| Discord bot | Message-content intent approval, rate limits, ToS | M | Slash commands and webhooks first; verify current Discord policy. **⚑ UNSURE** | flagged |
| Twitch/YouTube sync | API quota/ToS | L | Official APIs, read-only | designed |
| Migration importers | Importing other people's messages/personal data | M | Admin-only, preview + rollback, retention notice | designed |
| Public API / webhooks | Key leakage, over-broad scopes, SSRF via webhooks | H | Scoped hashed keys, per-org rate limits, webhook URL allow-listing and egress filtering | designed |

### F. Platform, trust, business

| Feature | Risk | Sev | Mitigation | Status |
|---|---|---|---|---|
| Billing (Stripe) | PCI scope; tax (GST/VAT); **India RBI rules for recurring card payments (e-mandate)** | H | Stripe Checkout/Portal only (never touch card data); tax handling; **⚑ UNSURE:** RBI recurring-payment compliance for Indian customers — verify before charging | flagged |
| Feature flags/entitlements | Client-side gating bypass | M | Server-enforced entitlements | designed |
| White-label/custom domains | Domain takeover, cert issuance abuse, phishing | H | DNS verification, managed TLS, disallow lookalike brands, review workflow | designed |
| SSO/2FA | Account lockout; recovery abuse | M | Recovery codes, admin recovery flow with audit | designed |
| Sessions (JWT) | No revocation today (D-33) | **M** | `session_version` claim in Tier 1 item 1 | flagged |
| Data export/deletion | Deleting records the law requires us to keep | M | Retention holds with explanation to the user | designed |
| Analytics | Tracking users without consent | M | No PII, opt-out, respect DNT/consent | designed |
| i18n | Mistranslated legal/consent text | M | Legal strings translated by qualified reviewers; English is authoritative | designed |
| Desktop companion | **Overlays and input hooks can trigger anti-cheat (e.g. Riot Vanguard) or violate publisher ToS** | **C** | **Tier 3, design only.** Only sanctioned feeds (GSI); no injection, no memory reads. **⚑ UNSURE:** per-publisher overlay policy (Overwolf-approved routes) | flagged |
| Content Security Policy | Missing today (D-40) | M | Nonce-based CSP in the security pass | flagged |

## 3. Open items to verify before building

1. DPDP Act and Rules: obligations and timelines for children's data and cross-border transfers (counsel).
2. Riot production-key terms and RSO scopes when the application is submitted.
3. RBI recurring-payment requirements for Stripe subscriptions in India.
4. Discord message-content intent policy and current bot rules.
5. Recording/transcription consent law in each launch market.
6. Overlay/companion-app policy for each publisher before any desktop work.
