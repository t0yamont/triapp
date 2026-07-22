# 08 — Implementation Roadmap

Reordered from the original spec. The key change: **the engine is built before the UI
that displays it**, and real data arrives before the engine is written. The original
ordering put charts (weeks 6–8) ahead of the metrics engine (weeks 9–10) and the plan
algorithm last, which means the highest-risk, highest-value component gets built when
schedule pressure is highest.

Estimates assume one developer working with an agent.

---

## Phase 1 — Foundation (weeks 1–2)

- Turborepo + pnpm, `apps/web`, `packages/{core,ui,api-client,config}`
- Supabase project, all migrations from `04-DATA-MODEL.sql`, RLS on every table
- Auth: email/password, Google, Apple
- Onboarding steps 1–4 and 6 (availability), plus consent capture
- Design tokens and base component library
- Test harness: Vitest, fast-check, Playwright skeleton
- Copy `/spec` and `CLAUDE.md` into the repo

**Gate:** Phase 1 criteria in `07-ACCEPTANCE.md` §C.

---

## Phase 2 — Data in (weeks 3–5)

- FIT/TCX/GPX parser as an Edge Function (**build this first**, it unblocks everything)
- Activity ingest, normalisation, laps, streams incl. RR intervals
- Deduplication, idempotent webhook handling
- Garmin OAuth + Health/Activity APIs behind a feature flag; MCP-sourced seed fixtures
  generated for development
- Historical backfill job with progress reporting
- Onboarding steps 5, 7, 8
- Sync status UI

**Gate:** Phase 2 criteria. Real activity data in the database before Phase 3 starts.

---

## Phase 3 — Engine: athlete model (weeks 6–8)

`03-ALGORITHM.md` §2, §3, §6.

- `physio/constants.ts` with every cited constant
- HRmax / HRrest derivation with confidence
- DFA-a1 LT1/LT2 detection with artefact rejection and multi-session aggregation
- Critical power / critical speed fitting; swim CSS
- Anchor reconciliation → `athlete_model_current`
- Zone construction, both modes, all three modalities
- Threshold history UI

**Gate:** Phase 3 criteria. This is the phase where the product becomes different from
its competitors — do not compress it.

---

## Phase 4 — Engine: load & durability (weeks 9–11)

`03-ALGORITHM.md` §5, §11.

- Three load metrics per session; disagreement detection
- CTL/ATL/TSB combined and per sport; monotony, strain
- Session classification, both methods; distribution accounting
- Decoupling and durability index
- Mean-max curves
- Analytics screens: PMC, distribution, durability, mean-max
- Activity detail with overlay charts and lazy streams

**Gate:** Phase 4 criteria.

---

## Phase 5 — Engine: planning (weeks 12–15)

`03-ALGORITHM.md` §4, §7, §8, §9, §12.

- Session template library with sport-specific rendering
- Macrocycle layout from race calendar
- Microcycle construction against availability
- Guardrails G1–G10 in `invariants.ts`, enforced at every write
- Taper generation
- Race impact, multi-race resolution
- Field test scheduling
- Strength and heat blocks
- Calendar and plan UI

**Gate:** Phase 5 criteria. A 24-week Ironman plan that satisfies every invariant.

---

## Phase 6 — Engine: adaptation (weeks 16–17)

`03-ALGORITHM.md` §10.

- Readiness scoring with component breakdown
- Asymmetric response rules
- Weekly re-planning triggers
- Athlete actions (move/swap/shorten/skip/block) with week repair
- Illness and injury handling
- `plan_mutations` audit and the explanation surfaces in `06-UX.md` §6

**Gate:** Phase 6 criteria.

---

## Phase 7 — Execution & mobile (weeks 18–21)

- Garmin Training API integration; workout push with a 10-day rolling window
- Republish on mutation; FIT workout download fallback
- Expo app: Today, Calendar, Activity detail, Races (read-heavy screens first)
- Apple HealthKit
- Push notifications
- EAS build pipeline; TestFlight

**Gate:** Phase 7 criteria. Push to a physical device.

---

## Phase 8 — Launch readiness (weeks 22–23)

- Data export and hard delete, self-service
- Consent versioning verified
- Privacy policy, sub-processor list, medical disclaimer
- Observability: sync dashboard, engine decision log, alerting
- 12-week simulated season across 20 synthetic athletes, zero guardrail violations
- Performance pass: p95 dashboard load <1.5 s, plan generation <2 s
- Coach mode scaffolding visible and disabled

**Gate:** Phase 8 criteria.

---

## Deferred (post-v1)

Coach mode functionality · Wahoo/Polar/Suunto · Strava (pending terms review) ·
Trainer control · Route planning · Social · Altitude camp planning · Cycle-phase
periodisation (pending evidence)

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Garmin API approval delayed or refused | Blocks workout push, degrades data quality | FIT upload path ships day one and is permanent; push is behind a flag |
| Garmin Training API grant refused separately from Health API | No device push | FIT workout download fallback, built in Phase 7 regardless |
| DFA-a1 does not work well on this user population | Weakens the core differentiator | Field tests and CP fitting are independent paths to the same anchors; confidence model already handles it |
| Strava terms prohibit an intended feature | Rework | Strava is supplementary only, never load-bearing |
| Engine complexity overruns | Schedule | Phases 3–6 are sequenced so each ships a usable increment; Phase 3 alone (threshold detection + zones) is a shippable product |
| Special-category data compliance gap | Legal, blocking | Built into Phase 1 and gated at Phase 8, not retrofitted |
