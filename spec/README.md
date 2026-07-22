# IronFlow — Specification Bundle

A multi-sport (triathlon / running / cycling) training platform. This bundle is a
**build specification**, not documentation of an existing system. Nothing here has
been implemented yet.

## Read order

| # | File | What it is | Read when |
|---|---|---|---|
| — | `00-AGENT-BRIEF.md` | The prompt to open a build session with | First, always |
| — | `CLAUDE.md` | Repo-root rules for Claude Code | Copy to repo root at init |
| 1 | `01-PRODUCT.md` | Scope, users, product invariants, decision log | Before any planning |
| 2 | `02-ARCHITECTURE.md` | Stack, monorepo, sync design, security, compliance | Phase 1 |
| 3 | `03-ALGORITHM.md` | **The physiology + planning engine. The core of the product.** | Phases 4–6, and before touching anything in `packages/core/physio` |
| 4 | `04-DATA-MODEL.sql` | Postgres schema, RLS, indexes | Phase 1 |
| 5 | `05-INTEGRATIONS.md` | Garmin / Strava / Apple Health / FIT, workout push | Phase 2 |
| 6 | `06-UX.md` | Design system, navigation, screen specs, onboarding | Phase 1, 3 |
| 7 | `07-ACCEPTANCE.md` | Testable acceptance criteria + golden fixtures | Every phase — gates |
| 8 | `08-ROADMAP.md` | Phases, gates, definition of done | Planning |
| — | `REFERENCES.md` | Bibliography for `03-ALGORITHM.md` | When changing algorithm behaviour |

## The one thing to understand before building

Most training apps are activity databases with a plan generator bolted on. IronFlow
is the inverse: **the physiology engine is the product**, and everything else exists
to feed it data or display its output.

Concretely, this means:

- `packages/core/physio` is the highest-value code in the repo. It is pure, sport-agnostic
  where possible, fully unit-tested, and has **no dependency on React, Supabase, or any
  network client**. It takes typed inputs and returns typed outputs.
- Every number the engine produces carries a `confidence` value and a `provenance`
  string. A threshold estimated from a formula and one measured in a field test are
  never treated as equivalent.
- Algorithm constants live in one versioned file (`physio/constants.ts`) with a citation
  comment on every value. **Do not invent, round, or "simplify" a constant.** If a constant
  seems wrong, flag it — do not change it silently.

## Deviation policy

If implementation makes something in this spec impossible or clearly wrong, **stop and
report it** rather than silently substituting an approach. Write the deviation and its
reason to `DECISIONS.md` in the repo root. This applies with double force to anything
in `03-ALGORITHM.md`.
