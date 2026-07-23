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
- **`packages/core/physio` — the pure engine core** (Phase 3): athlete model, threshold
  detection, zones, and load metrics. Pure functions, no React/Supabase/network/clock.
  **100% branch coverage; all applicable golden fixtures and property tests pass.**
- **Database layer** (Phase 1) — Postgres migrations for all 21 tables with **complete
  row-level security** and an automated isolation test that proves each athlete sees only
  their own rows on every table. See [`supabase/`](./supabase).

Remaining Phase 1/2 (the `api-client` package, Next.js web app, auth UI, onboarding, and
activity ingest) are the next increments — see [`DECISIONS.md`](./DECISIONS.md) (`D-SCOPE`).

### What the engine can do now

| Area | Modules | Golden fixtures / invariants |
|---|---|---|
| Athlete model | `anchors/hrMax`, `hrRest`, `criticalPower`, `dfaAlpha1`, `reconcile` | F3, F4, F5, I14 |
| Zones (both modes) | `zones/build`, `zones/seiler` | F1, F2, I1–I4 |
| Load | `load/tss`, `trimp`, `srpe`, `fitness` | F6 |
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
├── packages/
│   ├── core/physio/          # THE ENGINE — pure, see spec/03-ALGORITHM.md §1
│   └── config/               # shared tsconfig
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
