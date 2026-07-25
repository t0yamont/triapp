# Obsidian Brain Update — TriFlow

**For:** the agent maintaining the Obsidian vault for this project.
**Task:** fold the state below into the vault. Nothing here needs verifying against the repo —
it is written from the repo as of this commit.

Suggested note structure: one MOC (`TriFlow`) linking to `TriFlow/Engine`,
`TriFlow/Web App`, `TriFlow/Data & Infra`, `TriFlow/Decisions`, `TriFlow/Open Questions`,
`TriFlow/Roadmap`.

---

## 0. Latest — rebrand + onboarding UI is live (this update)

Two things changed since the previous sync (which covered the engine-layer goal-time/CSS work):

1. **The product was renamed IronFlow → TriFlow.** Scoped: user-facing text, docs, code
   comments. The internal `@ironflow/*` pnpm package scope (`core`, `ui`, `web`, `api-client`,
   `config`) was deliberately **not** touched — renaming it means editing every import
   specifier in the monorepo for zero user-visible benefit. If the vault has any old
   `IronFlow`-named notes, retitle them; internal package names in code snippets are correctly
   still `@ironflow/*` and should **not** be "corrected."
2. **The onboarding UI is wired up** — this closes the gap the previous sync flagged as
   "engine layer only." `RaceAndAbilityForm` (Step 7 of 8) now collects race date, event type,
   goal time, and current ability (longest continuous run/ride/swim, sessions/week, weekly
   hours, training age), shows live verdicts from the engine (plan-window adequacy, start
   readiness, Riegel goal-feasibility), and feeds a *real* `generatePlan` call instead of a
   hardcoded sample. Verified end-to-end with headless-Chrome screenshots of both the
   triathlon and running branches.
3. The UI font token switched **Inter → Geist** (UI) with JetBrains Mono unchanged (data),
   matching the "Instrument Glass" design export a user uploaded to Claude's design tool
   (`Downloads/Stamina Triathlon App Review.zip`, built from `docs/figma-redesign-brief.md`).
   That export also confirmed every existing colour token, component spec, and climate palette
   match what was already built — no other visual changes were needed.

Design provenance note for the vault: the "Stamina" triathlon app screenshots the user
supplied were a **competitor reference**, not the target design — they were fed into Claude's
design tool alongside the IronFlow/TriFlow brief to produce the Instrument Glass exploration
above. Worth a `#competitor-reference` tag distinct from `#design-system` if the vault tracks
that distinction.

---

## 1. What TriFlow is

An adaptive multi-sport endurance training platform (triathlon / running / cycling). The
**physiology engine is the product**; everything else feeds it data or displays its output.

Non-negotiable principles (these are the vault's most important content — they explain nearly
every design decision):

1. **A number is never shown without its confidence.** Every estimate is
   `{ value, confidence, provenance }` and confidence is never silently increased (I14).
2. **Every plan change is explained** in one athlete-readable sentence, with a machine-readable
   reason code, written as exactly one audit row (I13).
3. **Downgrade-only adaptation.** A bad readiness signal can cut today's load immediately; a good
   one can never add (I12). Increases happen only at week boundaries on multi-day evidence.
4. **Hard guardrails, not ACWR.** G1–G10 are checked in one place and no plan violating one is
   persisted.
5. **Dark-first UI** — used pre-dawn and post-session.
6. The engine is **pure**: no React, no Supabase, no network, no clock. Time is always an argument.

---

## 2. Architecture

```
apps/web            Next.js 15 App Router — presentation only, no formulas
packages/core/physio  THE ENGINE — pure functions, 100% branch coverage enforced
packages/core/ingest  FIT / TCX / GPX parsers, normalize, dedupe
packages/api-client   the ONLY place that talks to Supabase
packages/ui           design tokens + components
supabase/             21 tables, complete RLS, migrations applied
```

Repo: `t0yamont/triapp`, working branch `claude/new-session-1p7n87`.
Spec bundle in `/spec` is the source of truth; `/spec/03-ALGORITHM.md` is the engine spec.

---

## 3. Engine state (as built)

**341 tests, 100% branch coverage. All golden fixtures F1–F13 implemented.**

| Area | Modules |
|---|---|
| Athlete model (§2, §6) | `anchors/{hrMax,hrRest,criticalPower,criticalSwimSpeed,dfaAlpha1,reconcile}` |
| Zones (§3) | `zones/{build,seiler}` |
| Load (§5) | `load/{tss,trimp,srpe,fitness,meanMax}` |
| Classification (§3.4) | `distribution/{policy,classify}` |
| Planning (§8, §9) | `plan/{macro,micro,taper,assemble,generate,races,invariants}` |
| Onboarding (new) | `plan/{onboarding,goalTime}` — race date, baseline ability, goal time |
| Adaptation (§10) | `readiness/{score,response,return}`, `plan/{reschedule,actions,replan}` |
| Sessions (§7) | `sessions/{library,strength,heat}` |
| Durability (§11) | `durability/decoupling`, `load/meanMax` |
| Field tests (§12) | `plan/fieldtest` |

**Phase-8 gate passes:** a 12-week simulated season across 20 synthetic athletes with zero
guardrail violations (`__tests__/season.test.ts`).

**New since the last brain sync — onboarding is unblocked.** The engine previously required
`totalWeeks` and a `startingLoad` no athlete could supply. Now: `weeksToRace`/`assessPlanWindow`
derive plan length from a race date; `baselineWeeklyLoad`/`baselineLongestBySport` derive the
ramp base and seed week-1's G2 check from questions an athlete can answer ("how long can you
currently run/ride/swim continuously"); `assessStartReadiness` gates plan start against an
event's entry requirement; `predictRaceTime`/`assessGoalFeasibility` give a goal-time verdict via
a **volume-tiered Riegel exponent** (Vickers & Vertosick 2016); `fitCriticalSwimSpeed` adds the
CSS anchor swimming was missing, with its own `css_test` provenance tier (0.65). Full writeup and
research citations in `docs/algorithm-review-2026-07.md`; the decision record is
`DECISIONS.md` → `D-GOAL-TIME-CSS`. **Now wired to the onboarding UI** (§0 above) — race date,
baseline ability, and goal time are collected in `RaceAndAbilityForm` and drive a real
`generatePlan` call. `fitCriticalSwimSpeed` itself is still engine-only (no swim field-test
UI yet — that's the next gap, see §5 item 7 below).

### Web app
Six working surfaces: Today, Calendar (drag-to-move with live engine week repair), Activities,
Analytics, Races, Settings — plus auth, onboarding, and a plan-generation flow. Visual identity
is **"Instrument glass"**: near-black ground, frosted-glass panels, periwinkle accent, and an
**ambient aurora background that tints to the athlete's readiness climate** (primed / steady /
strained / overreached / peaking). Design brief: `docs/figma-redesign-brief.md`;
system: `apps/web/DESIGN.md`; product truth: `apps/web/PRODUCT.md`.

### Data
Plans persist (`training_plans` → `plan_weeks` → `workouts`) and read back into Today and
Calendar, falling back to a labelled sample athlete when there's no live plan.

---

## 4. Decisions log (`DECISIONS.md`) — worth a note each

The two most conceptually important, both found by the season simulation:

- **`D-G2-PEAK`** — G2 (long-session growth) must compare against the athlete's *recent peak*, not
  last week. Read literally it contradicts G4, which **mandates** a recovery-week volume cut and
  therefore guarantees a bounce-back G2 would flag. Two mandatory guardrails cannot contradict, so
  the literal reading is wrong. The injury vector is a **new** longest session, not a return to
  one already handled.
- **`D-S3-DAY-PLACEMENT`** — the weekly quality session is kept off swim days. The S3 slot caps at
  40 min vs 90 for aerobic, so when it landed on the swim day that sport's longest session swung
  between weeks — a swim *growing* 36 → 69 min inside a recovery week.

Others: `D-HEAT-MARGIN`, `D-SWIM-IF`, `D-TAPER-BOUNDS`, `D-FIELDTEST-READINESS`, `D-READINESS-MODEL`,
`D-F10-REPAIR`, `D-DFA-TESTING`, `D-SCOPE`, `D-RLS-COMPLETE`, `D-TYPEGEN`.

---

## 5. Open questions (needs a dedicated note — these block work)

1. **Heat trigger margin** — §7.4 says a block is prescribed when race conditions exceed the
   athlete's norm "by a defined margin" but never defines it. Currently a required caller input
   rather than an invented constant.
2. **Swim IF direction** — §5.1 defines swim `IF = CSS speed / actual speed`, which inverts
   (IF > 1 when swimming *easier* than CSS).
3. **Minimum plan weeks / entry-requirement sign-off** — implemented with values cross-checked
   against multiple coaching sources (MyProCoach, Campfire Endurance, IRONMAN, Triathlete), but
   still convention, not physiology; wants explicit owner sign-off.
4. **G2 semantics** — confirm the peak-based reading.
5. **Readiness-to-start gate** — should an under-prepared athlete be blocked or warned?
6. ~~**Onboarding UI**~~ — done (§0 above). `RaceAndAbilityForm`, Step 7 of 8.
7. **Swim field test in the UI** — `fitCriticalSwimSpeed` exists but nothing in `apps/web` yet
   captures a 200m/400m time trial to call it. Natural next step for §2.5.

---

## 6. Next major workstream — §2.1–2.4 done and wired to the UI, §2.5 open

See `docs/algorithm-review-2026-07.md` for the full argument and `DECISIONS.md` →
`D-GOAL-TIME-CSS` for what the Perplexity re-run changed. Summary of what shipped:

- **Race date** (`weeksToRace`, `assessPlanWindow`) → plan length derives from it, with an
  honest `recommended`/`compressed`/`too_short` verdict instead of silently thinning the plan.
- **Baseline ability per sport** (`BaselineAbility`, `baselineWeeklyLoad`,
  `baselineLongestBySport`, `assessStartReadiness`) → derives the ramp base, gates readiness to
  start, and seeds the week-1 G2 check.
- **Goal time** (`predictRaceTime`, `assessGoalFeasibility`) → Riegel with a **volume-tiered**
  exponent (1.06/1.09/1.12 by weekly hours, Vickers & Vertosick 2016), confidence-floored rather
  than rejected on wide extrapolation, returned as a full `Estimate`.
- **Critical Swim Speed** (`fitCriticalSwimSpeed`) → `CSS = (400−200)/(T400−T200)` from a
  200m/400m pair, with a pacing-consistency check and its own `css_test` (0.65) provenance tier.

**Still open (§2.5 of the review, not built):** the heat-trigger margin constant, and a
swim-specific microcycle template (research showed beginners run 3 swims/week — technique,
endurance, short intensity — while the engine currently treats swim as generic aerobic fill).

**Update — wired.** Race date, baseline ability, and goal time are now live in `apps/web`
onboarding (§0 above, `RaceAndAbilityForm`). CSS (`fitCriticalSwimSpeed`) is the one piece
still engine-only, with no swim-test capture screen yet.

Useful vault links: `#endurance-training`, `#periodisation`, `#hrv`, `#critical-power`,
`#critical-swim-speed`, `#riegel`, `#durability`, `#guardrails`.

---

## 7. Repo conventions

- 100% branch coverage on `physio` is enforced by the test config — new engine code needs tests.
- Physiological constants live **only** in `physio/constants.ts`, each with a citation comment
  pointing at `/spec/REFERENCES.md`.
- Golden fixtures live in `supabase/seed/fixtures/*.json` and are contract tests.
- Any deviation from the spec is logged in `DECISIONS.md`.
- Commands: `pnpm test:physio`, `pnpm --filter @ironflow/core test:coverage`, `pnpm typecheck`.
- Research: `scripts/perplexity_query.py "question"` — stdlib-only OpenRouter/Perplexity caller
  (no `litellm`; that pulled in a Rust toolchain build for one HTTP POST). Needs
  `OPENROUTER_API_KEY` in the environment.
