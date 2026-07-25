# Algorithm Review — July 2026

Research-backed review of the IronFlow engine against current endurance-training practice, plus
the onboarding gaps you flagged (race date, goal time, baseline ability per sport).

> **Update — Perplexity re-run.** The original pass used built-in web search only
> (`OPENROUTER_API_KEY` wasn't reachable in that container). It has since been re-run through
> Perplexity (`scripts/perplexity_query.py`, stdlib-only, no `litellm`) for the physiology-
> sensitive items — §2.1 (minimum weeks), §2.2 (entry requirements), §2.3 (Riegel exponent),
> §2.4 (CSS validity). **§2.1–2.4 are now implemented** (see §0 below); the corrections the
> deeper research produced are logged in `DECISIONS.md` → `D-GOAL-TIME-CSS`. §2.5 (heat
> margin, swim IF) and the minimum-weeks/entry-requirement **sign-off** are still open.

## 0. What's implemented vs. still open

| Item | Status |
|---|---|
| §2.1 Race-date anchored planning | ✅ `plan/onboarding.ts` — `weeksToRace`, `assessPlanWindow` |
| §2.2 Baseline capability onboarding | ✅ `plan/onboarding.ts` — `baselineWeeklyLoad`, `baselineLongestBySport`, `assessStartReadiness` |
| §2.3 Goal time (Riegel, tiered, w/ confidence) | ✅ `plan/goalTime.ts` — `predictRaceTime`, `assessGoalFeasibility` |
| §2.4 Critical Swim Speed | ✅ `anchors/criticalSwimSpeed.ts` — `fitCriticalSwimSpeed` |
| §2.5 Heat trigger margin | ⏳ still a required caller input (`D-HEAT-MARGIN`) |
| §2.5 Swim-specific session template | ⏳ not built |
| Minimum-weeks / entry-requirement **sign-off** | ⏳ implemented with research-backed values (§2.1/§2.2 below, revised), but you should still review the numbers |

None of the web app / onboarding UI was wired to these yet — they're engine functions with
100% branch coverage, not a UI flow.

---

## 1. Headline finding

**The engine is physiologically sound but cannot be driven by a real athlete.**

`generatePlan` currently requires:

| Input | Problem |
|---|---|
| `totalWeeks` | The caller must already know how many weeks to plan. An athlete knows a **race date**. |
| `startingLoad` | "3-week rolling mean load" — a TRIMP-style abstraction. **No athlete can answer this.** |
| `confidence`, `trainingAgeYears` | Reasonable, but confidence presumes an athlete model that a new user does not have yet. |

There is no `raceDate`, no `goalTime`, and no baseline-ability input anywhere in
`packages/core/physio` or `packages/api-client`. The onboarding flow therefore hands the
engine numbers the app invented, which is why the Today/Calendar screens still run on a
sample athlete.

This is the highest-value change, and it is exactly what you identified.

---

## 2. Proposed changes

### 2.1 Race-date anchored planning *(new — required)*

**Change.** Add `raceDate` as the primary planning input; derive `totalWeeks` from it rather
than asking for it.

```ts
export interface PlanRequest {
  raceDate: string;        // ISO date — the anchor
  planStartDate: string;   // usually today
  eventType: EventType;
  // totalWeeks is DERIVED: floor(daysBetween(planStartDate, raceDate) / 7)
}
```

**Why.** Every real plan is built backwards from a date. We already have `daysBetweenISO` and
`weekStartISO`, and `layoutMacrocycle` already handles short windows by compressing — so this
is mostly plumbing, not new physiology.

**Also needed — a minimum-viable-window check.** ✅ **Implemented** as `assessPlanWindow` in
`plan/onboarding.ts`; a short window is named honestly (`recommended` / `compressed` /
`too_short`) rather than silently thinning the plan.

**Perplexity re-run (sonar-pro), cross-checking MyProCoach, Campfire Endurance, IRONMAN's own
70.3 readiness content, and Triathlete:**

| Event | Recommended weeks | Hard minimum |
|---|---|---|
| Ironman | 24 | 16 |
| 70.3 | 20 | 12 |
| Marathon | 16 | 12 |
| Olympic | 16 | 12 (was 10 — cited range is 12–16) |
| Half marathon | 12 | 8 |
| 10k | 10 (was 12 — cited range is 8–10) | 8 |
| Sprint | 8 | 6 |
| 5k | 8 | 6 |

Two values moved from the first pass (marked above) to sit inside the cited ranges; the rest
were already inside them. Values live in `PLAN_WEEKS_BY_EVENT` in `constants.ts`.

> ⚠️ Still **coaching convention, not peer-reviewed physiology** — now cross-checked against
> multiple named coaching sources rather than a single pass, but still worth your explicit
> sign-off (see §5).

### 2.2 Baseline capability onboarding *(new — required)* ✅ Implemented

**Change.** `BaselineAbility` in `plan/onboarding.ts` replaces `startingLoad` at the API
boundary with questions an athlete can actually answer:

```ts
export interface BaselineAbility {
  longestRunMin?: number;
  longestRideMin?: number;
  longestSwimM?: number;        // distance is the natural unit for swimming
  sessionsPerWeek: number;
  typicalWeeklyHours: number;
}
```

`baselineWeeklyLoad(b)` derives the ramp base from `typicalWeeklyHours`, valued conservatively
at the S1 zone weight (not a guessed intensity mix) — an under-estimate is the safe direction
to be wrong in, since G1 caps growth *from* this number.

**Entry requirements — corrected on re-run.** The Perplexity re-run confirmed the Olympic/Sprint
figures but caught a real error in the long-course ones: the first pass extrapolated Ironman/70.3
entry requirements *proportionally* from Olympic distance, landing at absurdly high numbers
(70.3 entry swim = 1500 m — nearly race distance). Cited 70.3 base-phase starting points (10 min
swim / 45 min bike / 20 min run, building over the base phase to 25 min / 2 h / 8 km) show the
entry bar for long-course is **not** proportionally higher than short-course — the extra distance
is what the long *plan itself* builds over its many more weeks.

| Event | swim | ride | run |
|---|---|---|---|
| Ironman | 500 m (was 2000 m) | 60 min (was 150 min) | 25 min (was 75 min) |
| 70.3 | 400 m (was 1500 m) | 45 min (was 120 min) | 20 min (was 60 min) |
| Olympic | 800 m | 60 min | 30 min |
| Sprint | 400 m | 20 min | 10 min |

`EVENT_ENTRY_REQUIREMENTS` in `constants.ts`; corrected values used directly, no separate
migration needed since nothing shipped against the wrong numbers yet.

Two things this unlocks:

1. A defensible `startingLoad`, without asking for a TRIMP number.
2. A **readiness-to-start gate** (`assessStartReadiness`): below an event's entry requirement,
   the plan opens with a preparation block, framed as the plan working rather than the athlete
   being behind. An unanswered baseline is treated as unknown, never as a deficit.

**Fixes G2 for week 1.** The season simulation established G2 must compare against a *recent
peak* long session (`D-G2-PEAK`). For week 1 there was no history, so the peak was undefined
and G2 unchecked — nothing stopped week 1 prescribing a 3-hour ride to someone whose longest is
45 minutes. `baselineLongestBySport(b)` seeds it. Swim is deliberately excluded from this seed:
converting a distance to minutes needs a pace we don't have until CSS is measured (§2.4), and a
guessed pace would put a fabricated number inside a guardrail.

### 2.3 Goal time *(new — required)* ✅ Implemented

**Change.** `plan/goalTime.ts` — `predictRaceTime` (Riegel, volume-tiered exponent) and
`assessGoalFeasibility` (compares a stated goal against the prediction).

**The exponent, resolved.** Riegel's classic `k=1.06` is optimistic for lower-volume recreational
runners at the marathon. The Perplexity re-run found the actual peer-reviewed correction:
**Vickers & Vertosick 2016** (*BMC Sports Science, Medicine and Rehabilitation*; >2M race
results) give a **volume-tiered exponent** — 1.04 elite / 1.06 high-volume / 1.09 moderate /
1.12 low-volume recreational. Implemented as `riegelExponent(weeklyHours)`, using the only
training-volume signal onboarding actually collects. The elite tier (1.04) is not implemented —
this product targets age-groupers (`PRODUCT.md`), and there's no signal to distinguish elite
from high-volume recreational.

**Confidence, not rejection, for wide extrapolation.** Riegel degrades the further you
extrapolate (a 10k predicts a half far more reliably than a 50k). Rather than reject predictions
past some ratio, confidence is **floored toward `population_formula` (0.2)** as the distance
ratio widens past 5×, ceiling at the `riegel_prediction` tier (0.6) for a near-distance
prediction. Returned as a full `Estimate` — never a bare number (P2).

**Not implemented:** the first-pass idea of a flat "3–5% first-timer buffer" — the tiered
exponent already captures most of that effect for a low-volume athlete, and "first-timer" isn't
a signal onboarding collects. Add if the tiered exponent proves insufficient in practice.

### 2.4 Critical Swim Speed as a first-class anchor *(gap)* ✅ Implemented

**Change.** `anchors/criticalSwimSpeed.ts` — `fitCriticalSwimSpeed`:
`CSS = (400 − 200) / (T400 − T200)` m/s from a 200 m and 400 m time trial in one session.
Rejects a pair with the wrong distances, a non-increasing split, or a 200 m sprinted more than
15% faster than the resulting CSS implies (an internal pacing-consistency check, since there's
no all-time-best to compare against on a first test).

**Confidence, verified.** The Perplexity re-run found the actual validation data: CSS vs.
measured MLSS at **r=0.87, SEE=0.033 m/s, bias 0.07±0.13 m/s** (Nikitakis & Toubekis) — a real
field test, genuinely useful, but with real disagreement against the lab standard it
approximates. Added a dedicated `css_test` provenance tier at **0.65** — between
`athlete_reported` (0.6) and `cp_model_fit` (0.7), reflecting exactly that: better than a
self-report, not as trustworthy as CP's own model fit.

Feeds the swim TSS path and lets `sessions/library`'s "10 × 100 m at CSS pace" resolve to real
numbers. Gives §12 a swim field-test protocol, which it lacked.

**Related, still open:** `D-SWIM-IF` — §5.1 defines swim `IF = CSS speed / actual speed`, which
inverts (IF > 1 when swimming *easier* than CSS). Not resolved by this pass; still needs your
clarification.

### 2.5 Smaller items

| Item | Finding | Proposal |
|---|---|---|
| Heat trigger margin | §7.4 says "a defined margin", never defines it | Already a caller input (`D-HEAT-MARGIN`) — needs your number |
| Swim session structure | Research: beginners do 3 swims/wk — technique + endurance + short intensity | Our micro-cycle treats swim as generic aerobic fill; consider a swim-specific template |
| First-week long session | Nothing caps it against actual ability | Covered by §2.2 above |

---

## 3. What should NOT change

The research did not contradict the engine's core. These are well-supported and should stay:

- **Three-zone accounting with both classifications** (session-goal + time-in-zone) — this is
  more rigorous than most commercial platforms.
- **Asymmetric, downgrade-only readiness response** — matches the evidence that HRV-guided
  training reduces *negative responders* rather than dramatically raising the mean.
- **Hard guardrails instead of ACWR** — ACWR's evidence base has weakened; our G1–G10 approach
  is the more defensible choice.
- **Confidence + provenance on every estimate** — this is the product's actual differentiator.
- **Durability / decoupling as a first-class model** — still rare in consumer platforms.

---

## 4. Recommended order — done through item 3

1. ✅ **Baseline ability + race date** (§2.2, §2.1) — unblocks real plan generation and seeds G2.
2. ✅ **Goal time + Riegel-with-confidence** (§2.3) — completes onboarding.
3. ✅ **CSS estimator + swim field test** (§2.4) — closes the weakest sport.
4. Smaller items (§2.5) — still open.

Items 1–3 were the difference between a demo and a usable product; they're now engine functions
with 100% branch coverage (341 physio tests total). **Not yet done:** wiring any of this into
the onboarding UI (`apps/web`) — these are engine-layer only.

---

## 5. Decisions needed from you

1. **Sign off the minimum-weeks and entry-requirement tables** — now cross-checked against
   multiple coaching sources via Perplexity (§2.1/§2.2), still convention rather than physiology.
2. **Heat trigger margin** (°C wet-bulb) — still open from `D-HEAT-MARGIN`.
3. **Swim IF direction** — resolve `D-SWIM-IF`.
4. **G2 semantics** — confirm the peak-based reading (`D-G2-PEAK`) is what you intend.
5. Whether the readiness-to-start gate should **block** a race choice or merely **warn**.
6. Whether to build the onboarding UI for baseline ability / race date / goal time next, or
   continue with §2.5 (heat margin, swim session template) first.

---

## Sources

### First pass (built-in web search)

- [Third Coast Training — Olympic distance 12-week beginner plan (entry requirements)](https://thirdcoasttraining.com/how-to-finish-your-first-olympic-distance-triathlon-12-week-training-plan-for-beginners/)
- [Triathlete — 8-week sprint triathlon plan for beginners](https://www.triathlete.com/training/getting-started/8-week-sprint-triathlon-training-plan-beginners/)
- [TRI247 — Beginner triathlon training guide](https://www.tri247.com/beginner-triathlon/triathlon-training-beginner-guide)
- [Triathlete — 20 weeks to your first 70.3](https://www.triathlete.com/training/20-week-training-plan-first-70-3-triathlon/)
- [Sport Coaching — Ironman 70.3 training guide](https://sportcoaching.com.au/ironman-70-3-training-guide/)
- [RunnersConnect — How accurate are race calculators? (Riegel)](https://runnersconnect.net/race-calculators/)
- [Sport Calculator — VDOT, Critical Speed & Riegel explained](https://sport-calculator.com/blog/how-to-predict-race-times-vdot-critical-speed)
- [Marathon Handbook — marathon race time predictor](https://marathonhandbook.com/marathon-race-time-predictor/)
- [MyProCoach — Critical Swim Speed calculator & zones](https://www.myprocoach.net/calculators/critical-swim-speed/)

### Re-run (Perplexity sonar-pro, via `scripts/perplexity_query.py`)

- Vickers, A. J., & Vertosick, E. A. (2016). *An empirical study of race times in recreational
  endurance runners.* BMC Sports Science, Medicine and Rehabilitation. (Volume-tiered Riegel
  exponent: 1.04 elite / 1.06 high-volume / 1.09 moderate / 1.12 low-volume; >2M race results.)
  — cited via the Rundida calculator's summary of the paper.
- Nikitakis, I. S., & Toubekis, A. G. — CSS vs. measured MLSS in swimmers (r=0.87, SEE=0.033 m/s,
  bias 0.07±0.13 m/s) — cited via a swim-science literature summary returned by the search.
- MyProCoach (Phil Mosley) — Sprint triathlon beginner guidance (8–12 weeks; entry bike/run
  duration).
- Campfire Endurance — Sprint/Olympic/70.3/Ironman typical training-duration ranges.
- IRONMAN's own 70.3 readiness content — 16–20 week guidance; 70.3 base-phase entry points
  (10 min swim / 45 min bike / 20 min run).
- Triathlete — 20-week first-70.3 plan (corroborates IRONMAN's own guidance).

> Note: Perplexity's sonar-pro model returns synthesized summaries with inline citation markers
> to sources it browsed, not direct links in every case — the entries above are attributed as
> the model presented them. Treat the Vickers & Vertosick and Nikitakis & Toubekis citations as
> pointers to go verify directly (e.g. via PubMed/Google Scholar) before treating them as final,
> rather than as confirmed direct quotes.
- [North Endurance — Critical Swim Speed](https://www.northendurance.co.uk/critical-swim-speed)
- [Tri Training Harder — CSS swim testing protocol](https://tritrainingharder.com/blog/2013/10/swim-testing-critical-swim-speed.html)
