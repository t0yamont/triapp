# Agent Brief — paste this to open a build session

You are building **IronFlow**, a multi-sport endurance training platform for triathlon,
running and cycling athletes. A complete specification bundle is in this directory.

## Before you write any code

1. Read `README.md`, `01-PRODUCT.md`, and `08-ROADMAP.md` in full.
2. Read `03-ALGORITHM.md` in full **even if the current task is UI or infrastructure**.
   Every part of the system exists to serve it, and the data model only makes sense
   once you understand what the engine needs.
3. Identify which phase in `08-ROADMAP.md` the current task belongs to, and re-read the
   acceptance criteria for that phase in `07-ACCEPTANCE.md`.
4. State your plan back before implementing. Include which files you will create, what
   the public interfaces are, and how you will test.

## Non-negotiable constraints

- **The physiology engine is pure.** `packages/core/physio` imports nothing from React,
  Supabase, Expo, or any HTTP client. Pure functions, typed in, typed out. It must be
  runnable in a plain Node script with no environment.
- **No invented constants.** Every physiological constant comes from
  `03-ALGORITHM.md` / `REFERENCES.md` and lives in `physio/constants.ts` with a citation
  comment. If you cannot find a value in the spec, stop and ask.
- **Confidence propagates.** Any function returning a physiological estimate returns
  `{ value, confidence, provenance }`. Downstream code must not discard confidence.
  Low confidence must visibly change plan behaviour (see `03-ALGORITHM.md` §2.4).
- **Never write a plan the athlete has not consented to.** The engine proposes; a
  transaction commits. Every plan mutation is logged with a machine-readable reason.
- **Row-level security on every table, no exceptions.** The service-role key never
  reaches client code.
- **Health data is special-category personal data under UK/EU GDPR.** See
  `02-ARCHITECTURE.md` §7 before implementing any storage, export, or deletion path.

## Working style

- Small, verifiable increments. Every phase gate in `07-ACCEPTANCE.md` must pass before
  moving on.
- Tests first for anything in `physio`. The golden fixtures in `07-ACCEPTANCE.md` are
  the contract.
- Do not scaffold ahead. Build what the current phase needs.
- If you disagree with a spec decision, say so and explain; do not silently deviate.
  Log the outcome in `DECISIONS.md`.

## What "done" means for a task

- Code written, typechecked, linted.
- Unit tests pass, including any golden fixture that touches the code.
- The relevant acceptance criteria in `07-ACCEPTANCE.md` are demonstrably met.
- `DECISIONS.md` updated if anything deviated from spec.
