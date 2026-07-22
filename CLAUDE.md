# CLAUDE.md — IronFlow

Copy this file to the repository root at project init.

## What this repo is

IronFlow: a multi-sport endurance training platform (triathlon, running, cycling).
Turborepo monorepo, Next.js web + Expo mobile, Supabase backend.

The specification bundle lives in `/spec`. It is the source of truth. Read
`/spec/03-ALGORITHM.md` before changing anything under `packages/core/physio`.

## Architecture rules

- `packages/core/physio` — **pure functions only.** No React, no Supabase, no fetch, no
  `Date.now()` (pass time in). Deterministic: same inputs → same outputs.
- `packages/core` — shared business logic, hooks, types. All algorithm logic lives here,
  never duplicated into `apps/web` or `apps/mobile`.
- `apps/*` — presentation and platform glue only. If you are writing a formula in an
  app, it is in the wrong place.
- `packages/api-client` — the only place that talks to Supabase or third-party APIs.

## Hard rules

1. Never hardcode a physiological constant outside `physio/constants.ts`.
2. Every constant needs a citation comment pointing at `/spec/REFERENCES.md`.
3. Every estimate carries `{ value, confidence, provenance }`. Never strip it.
4. RLS enabled on every table. Service-role key is server-only, always.
5. No `any` in `packages/core`. Zod-validate everything crossing a network boundary.
6. Activity streams are lazy-loaded. Never fetch streams for a list view.
7. FIT parsing happens server-side (Edge Function), never on device.
8. Timezone bugs are the most common class of bug in this domain: store UTC, compute
   in the athlete's local zone, and test across a DST boundary.
9. Do not use `localStorage`/`sessionStorage` in shared code.
10. Every plan mutation writes an audit row with a machine-readable reason code.

## Testing

- `physio` targets 100% branch coverage. It is pure; there is no excuse.
- Golden fixtures in `/spec/07-ACCEPTANCE.md` are contract tests. If one breaks, the
  change is wrong until proven otherwise.
- Property tests for zone construction, ramp caps, and taper bounds — invariants that
  must hold for all inputs, not just fixtures.

## Commands

```bash
pnpm dev            # all apps
pnpm test           # all tests
pnpm test:physio    # engine only — run this constantly
pnpm typecheck
pnpm db:migrate
pnpm db:seed        # loads synthetic athlete fixtures
```

## When you are unsure

Ask. Do not guess at physiology, do not guess at a constant, do not guess at an API
contract. Guessing in this domain produces plausible-looking output that is wrong in
ways nobody notices for months.
