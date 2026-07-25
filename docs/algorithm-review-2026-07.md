# Algorithm Review — July 2026

Research-backed review of the IronFlow engine against current endurance-training practice, plus
the onboarding gaps you flagged (race date, goal time, baseline ability per sport).

**Nothing in this document has been implemented.** It is the proposal to approve or amend first.

> **Research method note.** The `perplexity-search` skill could not run: it needs an
> `OPENROUTER_API_KEY` (a secret only you can set) and `litellm` is not installed in this
> container. Research below was done with the built-in web search. Worth re-running the
> physiology-sensitive items (§2.4, §2.5) through Perplexity for peer-reviewed depth before
> we commit the constants.

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

**Also needed — a minimum-viable-window check.** Research consistently gives a standard 70.3
plan as **20 weeks** (8 base / 6 build / 6 peak), with **12 weeks** as the compressed
time-crunched option; base phase alone is 8–12 weeks. Proposed new constants:

| Event | Recommended weeks | Hard minimum |
|---|---|---|
| Ironman | 24 | 16 |
| 70.3 | 20 | 12 |
| Marathon | 16 | 12 |
| Olympic | 16 | 10 |
| Half marathon / 10k | 12 | 8 |
| Sprint / 5k | 8 | 6 |

Below the recommended figure the engine should **say so plainly** ("this is a compressed plan;
here's what we cut") rather than silently producing a thinner plan — the honesty principle the
rest of the engine already follows. Below the hard minimum it should recommend a later race.

> ⚠️ These week counts are **coaching convention, not peer-reviewed physiology**. They belong in
> `constants.ts` cited as convention, or in a separate policy module. Flagging explicitly because
> CLAUDE.md forbids guessing at constants — I'd rather you approve these numbers than have me
> quietly adopt them.

### 2.2 Baseline capability onboarding *(new — required)*

**Change.** Replace `startingLoad` at the API boundary with questions an athlete can actually
answer, and derive the load internally.

```ts
export interface BaselineAbility {
  // "How long can you go continuously, right now, comfortably?"
  longestRunMin?: number;
  longestRideMin?: number;
  longestSwimM?: number;        // distance is the natural unit for swimming
  sessionsPerWeek: number;      // what they're actually doing now
  typicalWeeklyHours: number;
}
```

`startingLoad` is then computed from `typicalWeeklyHours × sessionsPerWeek` against the
TRIMP zone weights we already have — one small pure function, fully testable.

**Why this exact metric set.** It matches how the sport actually assesses readiness. Published
entry requirements for beginners are stated precisely this way:

- **Olympic distance:** swim 800 m continuously, ride 60 min, run 30 min
- **Sprint distance:** ride ~20 min, run ~10 min continuously, swim 100 y–750 m depending on source

So the same inputs give us **two** things for free:

1. A defensible `startingLoad`.
2. A **readiness-to-start gate**: if the athlete's baseline is below the event's entry
   requirement, the plan should open with a preparation block rather than assuming a base that
   isn't there. This is a genuine safety feature — it's the same class of problem as G1/G2
   (ramping from a fitness that doesn't exist).

**Additional benefit — this fixes G2 properly.** The season simulation established that G2 must
compare against a *recent peak* long session. For week 1 there is no history, so the peak is
undefined and G2 is unchecked. `longestRunMin` / `longestRideMin` **are** that seed: the first
week's long session should be capped against what the athlete has actually done. Right now
nothing stops week 1 prescribing a 3-hour ride to someone whose longest is 45 minutes.

### 2.3 Goal time *(new — required)*

**Change.** Capture `goalTime` per race; use it for (a) a feasibility verdict, (b) race-pace
targets, (c) pacing guidance — never to inflate the plan.

**Why, and the important caveat.** The standard tool is the **Riegel formula**
`T2 = T1 × (D2/D1)^1.06`. Research is clear on its limits:

- The 1.06 exponent was fitted to pooled data and is **too optimistic for untrained runners,
  too conservative for elites**.
- It **underpredicts recreational marathon times by 10 minutes or more**.
- First-time marathoners should carry a **3–5% buffer** for pacing inexperience.
- Accuracy degrades the further you extrapolate — a 10 k predicts a half far better than a 50 k.

**Proposal:** implement Riegel *with* an explicit correction and, crucially, return it as an
`Estimate` with confidence and provenance like every other engine number — lower confidence for
long extrapolations and first-timers. This fits our existing `{value, confidence, provenance}`
contract exactly. A bare predicted finish time would violate our own P2 rule.

Feasibility check: compare goal time against current ability and weeks available, and say
honestly when a goal needs either more time or a softer target. That is a differentiating
feature — most platforms just accept the goal.

### 2.4 Critical Swim Speed as a first-class anchor *(gap)*

**Change.** Add a CSS estimator: `CSS = (400 − 200) / (T400 − T200)` m/s from a 400 m and 200 m
time trial in one session (~5 min recovery between).

**Why.** Swimming is currently the weakest sport in the engine. `criticalIntensity` nominally
covers "CP (W) or CS (m/s) or **CSS (m/s)**" but there is **no CSS estimator** and no swim field
test. CSS is the swim equivalent of FTP/LT2, is the standard in triathlon coaching, and is a
race-specific pace — exactly what a long-course swim leg needs. It also feeds the swim TSS path
and would let `sessions/library`'s "10 × 100 m at CSS pace" actually resolve to real numbers.

This also gives §12 a swim field-test protocol, which it currently lacks.

**Related, already logged:** `D-SWIM-IF` — §5.1 defines swim `IF = CSS speed / actual speed`,
which inverts (IF > 1 when swimming *easier* than CSS). Still awaiting your clarification;
worth resolving in the same pass.

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

## 4. Recommended order

1. **Baseline ability + race date** (§2.2, §2.1) — unblocks real plan generation and seeds G2.
2. **Goal time + Riegel-with-confidence** (§2.3) — completes onboarding.
3. **CSS estimator + swim field test** (§2.4) — closes the weakest sport.
4. Smaller items (§2.5).

Items 1–3 are the difference between a demo and a usable product.

---

## 5. Decisions needed from you

1. **Approve or amend the minimum-weeks table** in §2.1 (coaching convention, not physiology).
2. **Heat trigger margin** (°C wet-bulb) — still open from `D-HEAT-MARGIN`.
3. **Swim IF direction** — resolve `D-SWIM-IF`.
4. **G2 semantics** — confirm the peak-based reading (`D-G2-PEAK`) is what you intend.
5. Whether the readiness-to-start gate should **block** a race choice or merely **warn**.

---

## Sources

- [Third Coast Training — Olympic distance 12-week beginner plan (entry requirements)](https://thirdcoasttraining.com/how-to-finish-your-first-olympic-distance-triathlon-12-week-training-plan-for-beginners/)
- [Triathlete — 8-week sprint triathlon plan for beginners](https://www.triathlete.com/training/getting-started/8-week-sprint-triathlon-training-plan-beginners/)
- [TRI247 — Beginner triathlon training guide](https://www.tri247.com/beginner-triathlon/triathlon-training-beginner-guide)
- [Triathlete — 20 weeks to your first 70.3](https://www.triathlete.com/training/20-week-training-plan-first-70-3-triathlon/)
- [Sport Coaching — Ironman 70.3 training guide](https://sportcoaching.com.au/ironman-70-3-training-guide/)
- [RunnersConnect — How accurate are race calculators? (Riegel)](https://runnersconnect.net/race-calculators/)
- [Sport Calculator — VDOT, Critical Speed & Riegel explained](https://sport-calculator.com/blog/how-to-predict-race-times-vdot-critical-speed)
- [Marathon Handbook — marathon race time predictor](https://marathonhandbook.com/marathon-race-time-predictor/)
- [MyProCoach — Critical Swim Speed calculator & zones](https://www.myprocoach.net/calculators/critical-swim-speed/)
- [North Endurance — Critical Swim Speed](https://www.northendurance.co.uk/critical-swim-speed)
- [Tri Training Harder — CSS swim testing protocol](https://tritrainingharder.com/blog/2013/10/swim-testing-critical-swim-speed.html)
