# IronFlow

An adaptive, multi-sport (triathlon / running / cycling) endurance training platform.

> **The physiology engine is the product.** Everything else exists to feed it data or
> display its output. The engine is pure, sport-agnostic where possible, fully unit-tested,
> and every number it produces carries a `confidence` and a `provenance`. See
> [`spec/`](./spec) for the full build specification and [`spec/03-ALGORITHM.md`](./spec/03-ALGORITHM.md)
> for the engine itself.

## Status

This repository is being built in verifiable increments against the roadmap in
[`spec/08-ROADMAP.md`](./spec/08-ROADMAP.md). What exists today:

- **Foundation** — Turborepo + pnpm workspace, shared TS config, Vitest + fast-check harness.
- **`packages/core/physio` — the pure engine core**: athlete model, threshold detection,
  zones, and load metrics (Phase 3); the **planning engine** (Phase 5) — G1–G10
  progression **guardrails**, taper, distribution policy, sport-specific session templates,
  macrocycle layout, microcycle construction, and full **plan assembly**; and the
  **adaptive engine** (Phase 6) — daily **readiness scoring** (§10.1); the asymmetric,
  **downgrade-only response rules** (§10.2): a bad signal cuts today's load immediately, a
  good one never adds (I12); and **athlete edits + week repair** (§8.4): a dragged session
  is honoured, the week is repaired to stay guardrail-valid, and the athlete is told exactly
  what else moved (F10). Every change emits exactly one audited mutation with an
  athlete-readable sentence (I13). The Phase-5 gate passes: *a 24-week Ironman plan that
  satisfies every invariant with no gaps*. Pure functions, no React/Supabase/network/clock.
  **100% branch coverage; golden fixtures (F1–F10, F13) and property tests pass.**
- **Database layer** (Phase 1) — Postgres migrations for all 21 tables with **complete
  row-level security** and an automated isolation test that proves each athlete sees only
  their own rows on every table. See [`supabase/`](./supabase).
- **Activity ingest** (Phase 2) — `packages/core/ingest`: pure **FIT / TCX / GPX parsers**
  (FIT decoded to streams incl. RR intervals for DFA-a1), normalization, idempotency, and
  cross-provider deduplication. Unit-tested.
- **`packages/api-client`** — the only place that talks to Supabase: typed clients
  (anon + service-role, with a browser guard), generated `Database` types, Zod-validated
  env, and the idempotent, dedup-aware ingest write path (`upsertParsedActivity`), all
  verified against the schema by `tsc`. The ingest **Edge Function** composes it with the
  parser (see [`supabase/functions/`](./supabase/functions)).
- **Web app** (Phase 1) — `apps/web` (Next.js 15) + `packages/ui` (design tokens +
  components from `06-UX.md`): Welcome → email/Google/Apple auth → About + health-data
  consent & medical disclaimer → the availability form. Builds and runs **without** a live
  Supabase connection (the client is read lazily), so it's verifiable now and connects when
  env is set.

The engine's UI surfaces (Today, Analytics, plan/calendar) come with Phase 3–5 — see
[`DECISIONS.md`](./DECISIONS.md) (`D-SCOPE`). The Edge Function and the app's data writes run
once the migrations are applied.

## Run the web app

```bash
pnpm --filter @ironflow/web dev     # http://localhost:3000  (works with no env; forms show a "connect Supabase" notice)
```

Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`
(template in [`.env.example`](./.env.example)) to enable auth and the onboarding writes.

### What the engine can do now

| Area | Modules | Golden fixtures / invariants |
|---|---|---|
| Athlete model | `anchors/hrMax`, `hrRest`, `criticalPower`, `dfaAlpha1`, `reconcile` | F3, F4, F5, I14 |
| Zones (both modes) | `zones/build`, `zones/seiler` | F1, F2, I1–I4 |
| Load | `load/tss`, `trimp`, `srpe`, `fitness` | F6 |
| Planning (§8) | `plan/{macro,micro,taper,assemble,invariants}`, `distribution` | F7, F8, I5–I11 |
| Adaptation (§10) | `readiness/{score,response}`, `plan/reschedule` | F9, F10, I12, I13 |
| Confidence → behaviour (§2.4) | `confidence` | ties I15 |
| Purity / determinism | (all) | I16 |

Run the engine with **zero environment** to see it end-to-end:

```bash
pnpm --filter @ironflow/core build
node examples/engine-demo.mjs
```

## Layout

```
ironflow/
├── spec/                     # the build specification (source of truth), committed
├── apps/
│   └── web/                  # Next.js 15 app — auth + onboarding (Phase 1)
├── packages/
│   ├── core/
│   │   ├── physio/           # THE ENGINE — pure, see spec/03-ALGORITHM.md §1
│   │   └── ingest/           # FIT/TCX/GPX parsers, normalize, dedupe — pure, tested
│   ├── api-client/           # the only place that talks to Supabase; typed to the schema
│   ├── ui/                   # design tokens + base components (06-UX.md §2)
│   └── config/               # shared tsconfig + Tailwind preset
├── supabase/
│   ├── migrations/           # Postgres schema + complete RLS (Phase 1)
│   ├── seed/fixtures/        # golden fixtures (F1–F6) as JSON contract tests
│   └── tests/                # automated RLS isolation test (Phase 1 gate)
├── examples/engine-demo.mjs  # runnable plain-Node walkthrough
├── CLAUDE.md                 # repo rules for Claude Code
└── DECISIONS.md              # deviation & decision log
```

## Commands

```bash
pnpm install
pnpm test               # all tests (Vitest)
pnpm test:physio        # engine only — run this constantly
pnpm --filter @ironflow/core test:coverage   # 100% branch enforced
pnpm typecheck          # tsc --noEmit across the workspace
pnpm build              # emit dist/ for the engine
```

## Working rules

The non-negotiables live in [`CLAUDE.md`](./CLAUDE.md) and
[`spec/00-AGENT-BRIEF.md`](./spec/00-AGENT-BRIEF.md). In short: the engine imports nothing
from React/Supabase/HTTP/the clock; every physiological constant is cited in
[`spec/REFERENCES.md`](./spec/REFERENCES.md) and lives only in `physio/constants.ts`; every
estimate carries `{ value, confidence, provenance }` and confidence is never silently
increased; and any deviation from the spec is logged in [`DECISIONS.md`](./DECISIONS.md).

> IronFlow provides training guidance, not medical advice. Athletes should seek medical
> clearance before beginning a training programme.
