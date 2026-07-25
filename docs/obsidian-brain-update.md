# Obsidian Brain Update — IronFlow

**For:** the agent maintaining the Obsidian vault for this project.
**Task:** fold the state below into the vault. Nothing here needs verifying against the repo —
it is written from the repo as of this commit.

Suggested note structure: one MOC (`IronFlow`) linking to `IronFlow/Engine`,
`IronFlow/Web App`, `IronFlow/Data & Infra`, `IronFlow/Decisions`, `IronFlow/Open Questions`,
`IronFlow/Roadmap`.

---

## 1. What IronFlow is

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

**308 tests, 100% branch coverage. All golden fixtures F1–F13 implemented.**

| Area | Modules |
|---|---|
| Athlete model (§2, §6) | `anchors/{hrMax,hrRest,criticalPower,dfaAlpha1,reconcile}` |
| Zones (§3) | `zones/{build,seiler}` |
| Load (§5) | `load/{tss,trimp,srpe,fitness,meanMax}` |
| Classification (§3.4) | `distribution/{policy,classify}` |
| Planning (§8, §9) | `plan/{macro,micro,taper,assemble,generate,races,invariants}` |
| Adaptation (§10) | `readiness/{score,response,return}`, `plan/{reschedule,actions,replan}` |
| Sessions (§7) | `sessions/{library,strength,heat}` |
| Durability (§11) | `durability/decoupling`, `load/meanMax` |
| Field tests (§12) | `plan/fieldtest` |

**Phase-8 gate passes:** a 12-week simulated season across 20 synthetic athletes with zero
guardrail violations (`__tests__/season.test.ts`).

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
3. **Minimum plan weeks per event** — proposed table is coaching convention, not physiology;
   needs sign-off.
4. **G2 semantics** — confirm the peak-based reading.
5. **Readiness-to-start gate** — should an under-prepared athlete be blocked or warned?

---

## 6. Next major workstream (proposed, not built)

See `docs/algorithm-review-2026-07.md` for the full argument. Summary:

**The engine can't currently be driven by a real athlete.** It asks for `totalWeeks` and
`startingLoad` (a "3-week rolling mean load") — numbers no athlete can supply. Missing entirely:

- **Race date** → derive plan length from it, with a minimum-viable-window warning.
- **Baseline ability per sport** (longest continuous run/ride in minutes, longest swim in metres,
  current sessions/week and weekly hours) → derives `startingLoad`, gates readiness to start, and
  seeds the week-1 long-session cap that G2 currently can't check.
- **Goal time** → feasibility verdict + race-pace targets, via Riegel *with* an explicit
  correction (it underpredicts recreational marathons by 10 min+; first-timers need a 3–5%
  buffer) and returned as an `Estimate` with confidence, never a bare number.
- **Critical Swim Speed** `CSS = (400 − 200) / (T400 − T200)` — swimming is the weakest sport in
  the engine; there is no CSS estimator and no swim field test.

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
