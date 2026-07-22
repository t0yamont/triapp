# 01 — Product Specification

## 1. What IronFlow is

An adaptive training platform for endurance athletes in triathlon, running and cycling.
It ingests wearable data, builds a physiological model of the athlete, generates a
periodised plan targeting their races, pushes structured workouts to their watch, and
re-plans continuously as evidence about the athlete accumulates.

**Positioning:** the differentiator is not the UI and not the integrations — both are
table stakes. It is that the plan is anchored to *measured individual physiological
thresholds* rather than percentages of an estimated maximum, and that it says out loud
how confident it is in every number it uses.

## 2. Users

**Primary (v1):** the self-coached endurance athlete, 4–15 h/week, owns a GPS watch,
targets 1–3 races a year, has 1–5 years of structured training experience. Technically
literate, wants to understand *why* the plan says what it says.

**Secondary (v2):** coaches managing 5–40 athletes. The data model is multi-tenant from
day one and coach-mode UI is scaffolded-but-disabled, but no coach features ship in v1.

**Explicitly not v1:** absolute beginners (needs different safety rails), team sports,
strength-first users, sub-3 h/week users.

## 3. Product pillars

1. **Connect** — one-time setup, then data appears without the athlete thinking about it.
2. **Model** — build the best physiological picture the available data supports, and
   be explicit about its uncertainty.
3. **Plan** — periodised, race-driven, evidence-based, continuously adapted.
4. **Execute** — the workout is on the watch before the athlete leaves the house.
5. **Explain** — every plan decision has a human-readable reason.

## 4. Product invariants

These hold in every release. A change that violates one is a breaking change.

| # | Invariant |
|---|---|
| P1 | The athlete can always see *why* a session was prescribed or changed. No unexplained plan mutations. |
| P2 | The engine never claims more confidence than it has. Estimated values are visibly marked as estimates. |
| P3 | The athlete can move, swap, shorten or skip a session. The athlete cannot edit plan structure. (See §5.) |
| P4 | The plan degrades gracefully. Missing HRV, missing power, missing swim data → the plan still works, with lower confidence and more conservative progression. |
| P5 | Load never ramps faster than the guardrails in `03-ALGORITHM.md` §5.3, regardless of what any other subsystem requests. |
| P6 | The app gives training guidance, not medical advice, and says so where it matters. |
| P7 | Data is the athlete's. Full export and hard delete, both self-service. |

## 5. Plan editability model (resolved)

The original spec forbade all athlete edits. That is brittle — real life moves sessions —
but free-form editing destroys the periodisation the engine is responsible for. The
resolution:

**Athlete MAY:**
- Move a session to another day within the same week (`MOVE`)
- Swap two sessions' days (`SWAP`)
- Shorten a session by up to 40% duration (`SHORTEN`)
- Skip a session (`SKIP`)
- Mark a day unavailable, in advance or retroactively (`BLOCK`)

**Athlete MAY NOT:**
- Change a session's sport, structure, or intensity target
- Change weekly load targets or phase boundaries
- Add sessions to the plan (unstructured activities are recorded but sit outside the plan)

**Every athlete action triggers re-validation** against the week invariants in
`03-ALGORITHM.md` §7. If an action breaks an invariant, the engine repairs the rest of
the week and tells the athlete what it did. If it cannot repair, it says so and takes
the least-bad option, logged.

## 6. Scope decisions (answered, with rationale)

| # | Decision | Rationale |
|---|---|---|
| D1 | Multi-tenant, product-ready from day one | RLS, per-athlete isolation, quotas, and audit logging are far cheaper to build in than to retrofit |
| D2 | Garmin is the flagship integration; Strava, Apple Health, Wahoo, Polar, Suunto follow | Garmin covers the target user and is the only one that supports both rich data in *and* structured workouts out |
| D3 | Structured workout push to device is v1 scope, gated on Garmin Training API approval | It is the difference between a plan and a training partner. Ships behind a flag; FIT-file download is the fallback |
| D4 | Stack challenged: **web-first**, mobile in Phase 7 | See `02-ARCHITECTURE.md` §1. Native adds ~40% build time for features the athlete mostly consumes on the watch |
| D5 | Zones: 5-zone display anchored to LT1/LT2 where known, %HRR fallback, plus a 3-zone roll-up used *only* for distribution accounting | See `03-ALGORITHM.md` §3. Distribution policy is meaningless in a 5-zone frame |
| D6 | Intensity distribution is phase-dependent (pyramidal → polarised) | Best current evidence; see `03-ALGORITHM.md` §4 |
| D7 | Load is tracked with three parallel metrics, not one | See `03-ALGORITHM.md` §5. Any single metric fails on some sport or some data availability |
| D8 | ACWR is **not** implemented | Conceptually and statistically criticised; ramp-rate guardrails replace it |
| D9 | HRV-guided daily adjustment: yes, conservative, downgrade-only | Evidence favours it but effect sizes are small; asymmetric rules avoid overreacting to noise |
| D10 | Strength training in-plan | Consistent evidence for economy and fatigue resistance |
| D11 | Field tests are scheduled by the engine, with passive estimation as backup | Passive-only estimation drifts and cannot detect what the athlete never does |
| D12 | Durability is a first-class tracked metric | It is the determinant that matters most for long-course racing and almost no consumer app models it |
| D13 | Heat adaptation blocks are prescribed when a hot race is targeted | Cheap, high-yield, evidence-backed |
| D14 | Fuelling stays a separate product; IronFlow exposes a handoff contract | Keeps both products coherent; see `05-INTEGRATIONS.md` §6 |
| D15 | Athlete availability constraints are collected at onboarding and respected by the planner | Single biggest driver of plan adherence |

## 7. Out of scope for v1

Social feed, segments/leaderboards, live tracking, nutrition logging, route planning,
gear/maintenance tracking, coach billing, team management, indoor trainer control
(ANT+/FE-C), video content, race registration.

## 8. Success criteria for v1

1. An athlete completes onboarding and receives a plan in under 6 minutes.
2. The engine detects LT1 and LT2 for at least one sport within 3 weeks for an athlete
   using an RR-capable HR strap, without any lab test.
3. Prescribed workouts appear on the athlete's watch without manual transfer.
4. Plan adherence (sessions completed as prescribed, ± tolerances) exceeds 75% over
   an 8-week block for an athlete who set realistic availability.
5. Every plan change in the audit log has a reason code that renders as a sentence
   the athlete understands.
