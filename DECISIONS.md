# DECISIONS.md — deviation & decision log

Per `spec/00-AGENT-BRIEF.md` and `spec/README.md`: where implementation deviates from the
spec, or resolves something the spec left open, it is recorded here with its reason. This
applies "with double force" to anything in `spec/03-ALGORITHM.md`. Nothing in the physiology
engine was changed silently.

---

## D-SCOPE — First increment: foundation + pure engine core, cloud infra deferred

**Decision.** This increment builds (1) the Turborepo/pnpm foundation and test harness, and
(2) the pure physiology engine core (`packages/core/physio`): the athlete model, threshold
detection, zones, and load metrics — the parts with golden fixtures and property tests. It
does **not** yet scaffold Supabase, Next.js, auth, or onboarding.

**Reason.** The spec is emphatic that the engine is the product and must be built test-first
in small, verifiable increments, and that unverifiable scaffolding must be avoided ("Do not
scaffold ahead"). A live Supabase project / Vercel deployment cannot be provisioned or
verified in this environment, whereas the pure engine is fully runnable and testable here
(no network, no clock). Building the engine first also matches the roadmap's own stated
reordering rationale (`08-ROADMAP.md`: "the engine is built before the UI that displays it").

**Delivered against the gates:** Phase 1 "`pnpm test:physio` runs — the harness exists", and
Phase 3 "I1–I4, I14, I16 pass; F1–F6 pass; zone construction in both modes; anchor
reconciliation" (F4 included). Remaining Phase 3 UI and the Supabase/RLS Phase 1 items are
follow-ups.

---

## D-PROV-OBSERVED — Added `observed_max` provenance (0.80)

**Deviation.** `03-ALGORITHM.md` §2.1 lists the provenance ladder but omits the §2.2
"highest valid observed HR in the last 12 months" source, which §2.2 assigns confidence
0.80. Added `observed_max: 0.80` to `PROVENANCE_CONFIDENCE` / the `Provenance` type, **and**
to the `provenance` enum in the database migration (the spec SQL omitted it too), so an
`hr_max` anchor derived from an observation persists with the correct provenance.

**Reason.** The source is defined by the spec with an explicit confidence; representing it as
`field_test` (0.85) would misstate its trust and risk a silent confidence upgrade during
reconciliation (breaking I14). The 0.80 value is the spec's, not invented.

---

## D-RLS-COMPLETE — Completed the RLS policy set

**Deviation.** `spec/04-DATA-MODEL.sql` enables RLS on all 21 tables but writes policies for
only `profiles`, `activities`, and `activity_streams` ("Example … replicate for each"). A
table with RLS enabled and **no** policy denies all access. Migration `0003` therefore writes
the full set: an owner policy on every table (`athlete_id = auth.uid()`, `id = auth.uid()`
for profiles), parent-ownership policies for the four child tables without an `athlete_id`
(`activity_sources`, `activity_laps`, `activity_streams` → `activities`; `plan_weeks` →
`training_plans`), a both-parties policy on `coach_athlete_relationships`, and the inert
coach-read SELECT policies (present, returns no rows until coach mode ships — ARCH §6).

**Verification.** An automated isolation test (`supabase/tests/`) applies the migrations to a
real Postgres and asserts athlete A sees only its own row in every table, athlete B likewise,
and an unauthenticated caller sees nothing. It passes (Phase 1 gate).

---

## D-TYPEGEN — `Database` types generated without Docker

**Decision.** `supabase gen types` runs its introspection in a container, which fails here
(Docker Hub is egress-blocked). Instead, `packages/api-client/scripts/gen-database-types.mjs`
introspects `information_schema` / `pg_catalog` directly via `pg` and emits the same Supabase
`Database` shape. It was run against a local Postgres with the migrations applied to produce
`src/database.types.ts` (all 21 tables + 8 enums, incl. `observed_max`).

**Reason.** Accurate, complete types with no Docker dependency, and reusable: the team can
regenerate against their linked project with `DATABASE_URL=<db-url> pnpm --filter
@ironflow/api-client gen:types`. The api-client repository queries typecheck against these,
so schema/column drift is caught at compile time.

---

## D-DB-VERIFY — Local DB verification without Docker Hub

**Decision.** The committed RLS runner uses Docker, but Docker Hub's CDN is blocked by this
environment's egress policy (a 403 the proxy README says to report, not route around). The
migrations + RLS were instead verified against a real PostgreSQL 18.4 obtained from the
allowlisted npm registry (`embedded-postgres`), run as an unprivileged user. Same SQL, same
result: all 21 tables isolate by athlete. Both paths are documented in `supabase/tests/README.md`.

---

## D-HRREST-POP — Population resting-HR default is not invented

**Deviation.** §2.3 specifies a "population default by age and sex" (confidence 0.15) for
resting HR but gives no formula or table. `deriveHrRest` therefore requires the caller to
supply `populationDefault` as data; with no wearable/morning data and no supplied default it
returns `null` and the caller must degrade (§14).

**Reason.** "No invented constants" (`00-AGENT-BRIEF.md`). A resting-HR value is a
physiological constant; inventing one (e.g. 60 bpm) would violate that rule. **Flagged for
the spec owner:** please provide the population resting-HR reference (by age/sex) or confirm
it should come from an onboarding question.

---

## D-SWIM-IF — Swim intensity-factor direction looks inverted (needs confirmation)

**Concern (not yet resolved).** §5.1 defines swim `IF = CSS speed / actual speed`, whereas
run and bike use `actual / threshold`. As written, swimming *easier* than CSS (actual < CSS)
gives IF > 1 and *inflates* load — the opposite of the run/bike convention. `swimTss`
implements the spec literally (IF = CSS/actual) with a prominent code comment; nothing was
changed silently. F6 does not pin the swim number, only the cubic exponent, so both readings
pass the fixture.

**Flagged for the spec owner:** confirm whether swim IF should be `actual / CSS` (physically
consistent with run/bike) or is intentionally inverted. One-line fix in `load/tss.ts` once
confirmed.

---

## D-CP-CONF — `cp_model_fit` confidence scaling vs F5's nominal 0.70

**Decision.** §6.3 says confidence is 0.70 "scaled down toward 0.5 as R² approaches the
rejection threshold (0.95)". Implemented as a linear map R² ∈ [0.95, 1.0] → confidence
∈ [0.50, 0.70]. For F5's near-perfect fit (R² ≈ 0.9962) this yields ≈ 0.685, not the flat
0.70 the fixture's prose states.

**Reason.** The §6.3 scaling behaviour is preserved (a marginal fit is correctly less
trusted). The F5 test asserts provenance `cp_model_fit`, R² ≥ 0.95, W′ in bounds, CP ≈ 236.4,
and confidence ≈ 0.70 within tolerance (0.68–0.70) — the fixture's 0.70 is the nominal value,
matched within float tolerance, exactly as F6's numeric fixtures use ±0.1 tolerances.

---

## D-COMBINED-CONF — "Combined anchor confidence" = weakest link

**Decision.** §2.4 refers to "combined anchor confidence" without pinning the combination
rule. `combineConfidence` takes the **minimum** of the inputs; `sportAnchorConfidence`
returns `min(LT1, LT2)` when both thresholds exist, else HRmax confidence (the value zones
are actually built from).

**Reason.** Conservative by construction — the engine never claims more confidence than its
least-certain load-bearing anchor (invariant P2). Ties F2 (fallback, HRmax `population_formula`
0.20 → combined 0.20 < 0.30) and I15.

---

## D-CONF-CARRY — Intensity shift carried forward below 0.50 confidence

**Decision.** §2.4 states a 3% conservative intensity shift at the 0.50–0.74 tier and does
not restate it for lower tiers. The lower tiers carry the 3% forward (never a *less*
conservative value), so behaviour is monotonic in confidence.

**Reason.** Dropping the shift at lower confidence would make a *less*-informed plan *less*
conservative, contradicting the intent of §2.4. Documented in `confidence.ts`.

---

## D-ZONE-ROUNDING — Zones are built on integer HR bounds

**Decision.** `buildZones` rounds HRmax and HRrest to integers before constructing
boundaries, and derives each boundary's `pctHRR`/`pctHRmax` from its *rounded* bpm.

**Reason.** HR is an integer measurement and zones display in integer bpm. A fractional
HRrest (from the 5th-percentile estimate) would otherwise round the Z1 floor just below
HRrest, breaking I2 and showing a negative %HRR. Deriving percentages from the rounded bpm
makes I3 exact (`round(HRrest + pctHRR·HRR)` reproduces the stored bpm). Fixtures F1/F2 use
integer inputs and are unaffected; a regression test covers the fractional case.

---

## D-RUN-DPRIME — Run D′ bounds not gated

**Decision.** `W_PRIME_BOUNDS_J` (5–35 kJ) is applied only to `bike` fits. Run critical-speed
fits produce D′ in metres, for which §6.3 gives no bounds, so run fits are not gated on it.

**Reason.** Applying joule bounds to a metre quantity would be wrong. **Flagged:** run D′
physiological bounds are unspecified in the spec.

---

## D-TAPER-BOUNDS — Reconciling F7 and I8 at the 40/41% boundary

**Decision.** `generateTaper` lands the final taper week at `1 − reduction` of pre-taper
volume, clamped into **[40%, 60%]**. For the Ironman (60% reduction) that is exactly 40%
(280 of 700), which F7 accepts (`[280, 413]`).

**Reconciliation.** §8.3 describes volume *reduction* of "41–60%" and I8 states final volume
"[41%, 60%]", while F7's golden range is `[280, 413]` = 40–59% of 700 and the IM table row is
a 60% reduction (→ 40% volume). These are mutually inconsistent at the 40/41 boundary. F7 is
the golden fixture (the binding contract), so the taper targets the table value (IM → 40%)
and the tests assert the F7-consistent band [40%, 60%]. Also note F7's "~0.65 weekly decay" is
descriptive: hitting a 40% final week over 3 weeks requires ≈0.74/week, so the code derives
the decay to satisfy the *final-week* constraint (the tested one) rather than a fixed 0.65.

---

## D-DFA-TESTING — DFA-a1 verification strategy

**Decision.** The DFA-a1 path is verified by composing independently-validated stages rather
than one opaque synthetic-RR fixture: (a) the `dfaAlpha1` primitive is validated on canonical
signals (white noise → α ≈ 0.5, random walk → α ≈ 1.5); (b) artefact rejection is validated
against an 8%-artefact series (F4 negative); (c) the crossing/interpolation and ≥4-min-decline
logic is validated on a controlled α1-vs-intensity ramp (LT1 at 0.75, LT2 at 0.50); (d)
single→multi aggregation is validated directly. The RR artefact-detection threshold (20%
deviation from local median) is a signal-processing parameter, not a physiological constant,
so it lives with the algorithm rather than in `constants.ts`.

**Reason.** This gives rigorous, non-flaky coverage of every code path and every F4 assertion.
A full end-to-end synthetic-RR fixture (fractional-noise synthesis with a known crossing) is a
worthwhile follow-up but was not needed to satisfy F4.

---

## D-READINESS-MODEL — Response rules consume readiness bands, not raw streams

**Decision.** The adaptive engine is two pure stages. `readiness/score.ts` maps whatever
signals exist (HRV/RHR/sleep/wellness/completion) to a daily `{ score, band, components }`,
reweighting proportionally over present inputs (§10.1). `readiness/response.ts` then consumes a
*history of daily readiness* — each day a `band` plus the two signal-specific fields the rules
name explicitly (`hrvZ` for the ">2 SD crash", `restingHrDeltaBpm` for the ">7 bpm for 2 days"
rule) — and returns a single downgrade decision. The response layer never re-derives the score;
it acts on the band the score layer already produced.

**Reason.** §10.2's day-count rules are phrased against *readiness* ("below the SWC lower bound
for N days"), so the trailing-band count is the right trigger; only the HRV-crash and RHR rules
are signal-specific, so only those two carry dedicated fields. Keeping the two stages separate
keeps each pure and independently testable and avoids threading raw 60-day baselines through the
response path. F9's paired negative (above-band 3 days → no change) and I12 (never increases
load) fall straight out of this shape.

**Constants.** The §10.2 thresholds (1/2/4 below-days, 2 SD, 7 bpm/2 days, 10% trim, 5-day S3
suppression) are transcribed into `constants.ts` with a REFERENCES.md citation (hard rule #1).
The mid-week recovery conversion reduces the week to `RECOVERY_WEEK_LOAD_FRACTION` (0.62, the
midpoint of the G4 55–70% band — promoted out of a local in `assemble.ts` so both callers share
one cited value), i.e. −38%. The completion-rate→z mapping (85% neutral, 0.15 span) is a
presentational scaling, not a physiological constant, and is commented as such in `score.ts`.

---

## D-F10-REPAIR — What "G5 would be violated" means for a stacked move

**Decision.** `plan/reschedule.ts::moveSession` honours the athlete's drag, then repairs the
week by relocating the *one* session that has to move — the key session it collided with, or
the moved session itself — to the nearest available day that leaves the week fully
guardrail-valid, and reports every move it made (06-UX "Calendar"). F10 (threshold run → the
long-ride day) resolves as a two-move edit: run to Friday (athlete), long ride to Thursday
(engine), reported in one `plan_mutations` row (actor `athlete`, reason `ATHLETE_MOVE_REPAIRED`,
`ruleId` G5).

**Interpreting the fixture.** F10 says the move means "G5 would be violated." Two hard/key
sessions landing on the *same* day is not literally one of the coded weekly guardrails
(`consecutiveHardDays` counts hard *days*, and stacking two onto one day actually *lowers* the
consecutive count), but it is exactly what G5 ("≤2 consecutive hard days; a brick counts as one
hard day") exists to prevent. So the repair treats a same-day stack of two hard sessions as a
breach to clear (`G5_STACKED_HARD`), and — crucially — when searching for the relocation target
it rejects any day that would create a literal 3-consecutive-hard-days run. That rejection is
the concrete "G5 would be violated": e.g. shifting the long ride onto Saturday when Sunday is
already hard is refused, and the search falls back to a valid day.

**Scope.** This increment implements the `move` action + repair (what F10 exercises) only.
`swap`/`shorten`/`skip`/`block` and cross-training substitution (§10.4) are deferred; the repair
is a nearest-valid-day search, not a week re-optimiser (`ponytail:` in the module), and reverts
to reporting open breaches (`ATHLETE_MOVE_UNRESOLVED`) rather than silently dropping load when it
can't find a legal placement. The `PlanMutation` audit type was promoted to `physio/types.ts`
(actors engine/athlete/coach/system per 04-DATA-MODEL.sql) so readiness and reschedule share one
shape.

---

## D-FIELDTEST-READINESS — "readiness inside the SWC band" for test placement

**Decision.** §12's placement rule "readiness must be inside the SWC band on the day or the
test is postponed" is implemented as **not fatigued and not unknown**: `placeFieldTest` accepts
a day whose readiness band is `within` *or* `above`, and rejects `below` or `unknown`
(`READINESS_NOT_CLEARED`).

**Reason.** The rule's stated rationale is that "a test performed while fatigued produces a wrong
number that then poisons the plan for weeks." Fatigue is the `below` band. An unusually *fresh*
day (`above`) is an excellent test day, so postponing a test because the athlete is too rested
would be perverse; and an `unknown` band means we cannot clear the athlete, so we postpone.
Reading the band as a fatigue gate rather than a literal two-sided window matches the intent.
The other three placement rules — no test in a recovery week's first 3 days, ≥48 h after a hard
session, never within 10 days of a race — are implemented exactly as written.

**Scope.** `nextFieldTest` implements the §12 trigger table in priority order (pre-race battery
→ dropped-confidence re-anchor → fitness-change confirmation → phase-transition LT2 → routine
cadence). Deadlines that §12 states are used verbatim (fitness change 10 days, cadence 8/6 weeks
by confidence, full battery 6 weeks out); the phase-transition (7 days) and cadence "next slot"
(14 days) windows are engine defaults, since §12 gives those triggers a test but not an explicit
deadline.

---

## D-DESIGN-VERDICT — Today/Analytics rebuilt against the Claude Design canvas ("Instrument
Glass"), option 1c ("Verdict line")

**Decision.** The Claude Design project `TriFlow — Instrument Glass` (canvas
`TriFlow - Instrument Glass.dc.html`) explored three alternative Today layouts (1a "Session
brief", 1b "Instrument console", 1c "Verdict line") plus a new Analytics layout (1d) and a
foundations/components reference (1e), sharing one design system. The user picked **1c** for
Today. `/today` and `/analytics` were rebuilt against it: a fused session+readiness hero with a
linear (not ring) gauge, a new interval "session shape" bar, a "signals behind the score" panel,
a restyled week panel, a new "coming up" strip, and — on Analytics — a dedicated TSB card, a
dual-bar intensity-split card, a decoupling card with a limit line, and a new "what the weekly
re-plan changed" card.

**Deviations from the literal canvas, and why:**

1. **Nav rail unchanged (248px labelled), not 1c's 76px icon-only rail.** The canvas explores a
   narrower rail per-option; adopting it only for Today would make the nav width change when
   navigating between pages. `AppShell` (used by every page) was left as-is; only the Today page
   content changed. A global nav-width change is a separate decision if wanted.
2. **Mobile reflows responsively rather than replicating the literal 390px mobile frame.** The
   canvas's mobile composition drops "Coming up", the session's target list, and the whole
   "Attention" section to fit a fixed static frame. The redesign brief's own written mobile rule
   (§7: single column, priority order, wide content scrolls horizontally) doesn't say to drop
   content, so the implementation keeps every section and reflows it into one column on small
   screens instead — no functional loss on mobile.
3. **No fabricated "durability index."** 1e's Analytics mockup shows a 0–1 "durability index"
   card (e.g. "0.86 ▲") alongside aerobic decoupling. The engine (`durability/decoupling.ts`)
   computes decoupling %, not a separate 0–1 index, and no formula for one exists in
   `03-ALGORITHM.md`/`REFERENCES.md`. Rather than invent one, only the real decoupling metric was
   built (`DecouplingCard`), restyled with a limit-line chart. "No invented constants"
   (`00-AGENT-BRIEF.md`) is read to cover inventing a whole metric, not just a numeric constant.
4. **Analytics period tabs (6wk/12wk/6mo/Season) are omitted.** They'd require client-side state
   for a purely cosmetic filter with no wired data per period; out of scope for this pass.
5. **"What the weekly re-plan changed" is wired to the real `weeklyReplan` (§10.3) engine call**,
   not the canvas's static placeholder flags — this surfaces previously-unused engine output
   (§10.3 was implemented in Phase 6 but had no UI consumer yet).

---

## D-HEAT-MARGIN — The heat-block trigger margin is a caller input, not an invented constant

**Decision.** §7.4 prescribes a heat block when "a target race's expected wet-bulb conditions
exceed the athlete's training-environment norm **by a defined margin**" — but the spec never
defines that margin. Rather than invent a physiological threshold, `planHeatBlock` takes
`triggerMarginC` as a required input, so the number is an explicit product decision made
once, visibly, by the caller.

**Reason.** CLAUDE.md is explicit: do not guess at physiology or at a constant. A plausible-looking
default (say 4 °C) would be indistinguishable from a cited value once it sat in `constants.ts`,
and would silently decide whether athletes get a heat block at all. Everything §7.4 *does*
specify is implemented as cited constants: 8–14 exposures, finishing 5–10 days out, passive
20–30 min preferred, active sessions at reduced intensity targets and never scored as
under-performance.

**Open question for the spec owner:** what margin (°C wet-bulb) should trigger a block?

---

## D-G2-PEAK — G2 compares against the recent *peak* long session, not last week

**Decision.** `GuardrailWeek.priorLongestBySport` carries the athlete's **recent peak** longest
session per sport (rolling max over the last ~4 weeks), not the immediately preceding week's.

**Reason.** Read literally ("≤ +10% or +15 min per sport **per week**"), G2 and G4 cannot both be
satisfied: G4 *mandates* that a recovery week cut volume to 55–70%, which guarantees the next
loading week grows the long session by far more than 10% simply by returning to normal. The
Phase-8 season simulation surfaced this immediately — bike 185 → 221 min after a recovery week,
against a duration the athlete had already completed at 240 min three weeks running. Two
mandatory guardrails that contradict each other means the reading is wrong: the injury vector G2
names ("the classic long-run injury vector") is a **new** longest session, not a return to one
already handled. Peak-based comparison keeps G2 meaningful — it still catches genuine new peaks —
without firing on every planned recovery bounce-back.

## D-S3-DAY-PLACEMENT — the quality session is kept off swim days

**Decision.** `constructMicrocycle` places the week's S3 session on a non-long, **non-swim** day
where one exists (falling back to any non-long day).

**Reason.** Also found by the season simulation: the S3 slot carries a much tighter duration cap
(40 min) than an aerobic slot (90 min), so when the quality session landed on the swim day, that
sport's longest session swung between weeks purely because the slot moved or disappeared — a swim
*growing* 36 → 69 min inside a recovery week, which is both a G2 false positive and genuinely
wrong prescription. It is also better physiology: §7.2's library renders VO₂ work for bike and
run, while the swim in these plans is technique-focused.

---

## D-GOAL-TIME-CSS — Goal-time prediction and Critical Swim Speed, Perplexity-verified

**Decision.** Implemented `plan/goalTime.ts` (Riegel race-time prediction, volume-tiered
exponent) and `anchors/criticalSwimSpeed.ts` (CSS from a 200m/400m pair), closing two gaps
from `docs/algorithm-review-2026-07.md` §2.3–2.4. Both were verified against real literature
via Perplexity (`scripts/perplexity_query.py`) before implementation, per the user's
instruction not to guess at physiology.

**Riegel exponent.** Riegel's classic k=1.06 is optimistic for lower-volume recreational
runners at the marathon (underpredicts by 10+ minutes). Vickers & Vertosick 2016 (*BMC Sports
Science, Medicine and Rehabilitation*, >2M race results) give a volume-tiered exponent: 1.06
high-volume, 1.09 moderate, 1.12 low-volume. Implemented as `riegelExponent(weeklyHours)` —
the only training-volume signal onboarding actually collects (`BaselineAbility`). The paper's
"elite" tier (k=1.04) is not implemented: this product targets age-groupers (PRODUCT.md), and
we have no signal to distinguish elite from high-volume recreational.

**Confidence, not rejection, for wide extrapolation.** Riegel is most accurate near the known
distance (5k↔half) and degrades on wide extrapolation (10k→50k). Rather than reject predictions
beyond some ratio, `predictRaceTime` floors confidence toward `population_formula` (0.2) as the
distance ratio widens past `RIEGEL_LOW_CONFIDENCE_RATIO` (5×) — a low-confidence number is more
useful than none for a feasibility check, and confidence-gating is the pattern the rest of the
engine already uses (§2.4 tiers).

**CSS provenance tier.** Added `css_test: 0.65` to `PROVENANCE_CONFIDENCE`, between
`athlete_reported` (0.6) and `cp_model_fit` (0.7). Justification: Nikitakis & Toubekis found
CSS vs measured MLSS at r=0.87, SEE=0.033 m/s, bias 0.07±0.13 m/s — a real field test, but with
genuine disagreement against the lab standard it approximates, so it sits below `cp_model_fit`
(which the spec already treats as CP's ceiling) rather than at `field_test` (0.85).

**Entry-requirement correction.** The first-pass `EVENT_ENTRY_REQUIREMENTS` for 70.3/Ironman
were extrapolated proportionally from Olympic distance and overshot badly (e.g. 70.3 entry
swim was set to 1500m — nearly race distance). Cited 70.3 base-phase entry points (10 min
swim / 45 min bike / 20 min run, building over the base phase to 25 min / 2h / 8km) show the
entry bar for long-course is **not** proportionally higher than short-course: the extra
distance is what the long plan itself builds over its many more weeks. Corrected to
`swim 400–500m / ride 45–60min / run 20–25min` for 70.3/Ironman. `PLAN_WEEKS_BY_EVENT` was
also nudged: 10k recommended 12→10 weeks, olympic_tri minimum 10→12 weeks, both to sit inside
the ranges reported by MyProCoach, Campfire Endurance, IRONMAN's own 70.3 readiness content,
and Triathlete.

**Scope not implemented.** No composite triathlon goal-time model (swim+bike+run pacing) —
Riegel is a running formula with no established multi-sport equivalent in the spec, and none
is invented here. A per-sport goal (running legs only) is what's built.

---

## D-RACE-CALENDAR-CATALOG — Races page runs on the engine; onboarding offers real races

**Status:** implemented. **Spec:** §9 (race calendar resolution); 06-UX.md §5.

**The Races page now resolves through the engine.** It previously picked its A race with
`RACES.find((r) => r.priority === 'A')` and rendered the athlete's *stated* priorities as
fact — no demotion, no conflict detection, no taper or recovery derivation, none of §9. It
now maps its races to `RaceEntry[]` and calls `resolveRaceCalendar`, so what the page shows
is what the planner would actually do: the primary race, each race's treatment and its
engine-authored `note`, taper length, the G9 recovery block, and the `A_RACES_TOO_CLOSE`
warning when two A races sit inside the 12-week separation window. The sample athlete and a
real athlete go through the identical path (`lib/race-calendar.ts`), so the demo cannot drift
from real behaviour.

**Races are read live.** `getUpcomingRaces` (api-client) reads the rows onboarding already
writes; the page falls back to the sample athlete on no-env/signed-out/no-races/read-failure,
the same rule `live-plan.ts` established. `goal_time_s` supplies `expectedDurationH`, which is
what turns on the G9 recovery block — the athlete's own goal is the only expected-duration
signal available before there is training data to predict from.

**A curated race catalog, with per-entry date provenance.** Onboarding now asks for the
distance first and then offers real, dated races at that distance
(`apps/web/lib/raceCatalog.ts`), because a mistyped race date silently mis-sizes the entire
plan — `totalWeeks` comes from that date. Each entry carries `dateStatus`:
- `confirmed` — published for that edition, verified against organiser/press sources (Jul 2026).
- `provisional` — derived from the event's own fixed rule (Boston is Patriots' Day; Peachtree
  is 4 July; BOLDERBoulder is Memorial Day). The UI says so in warn tone and invites the
  athlete to override.

This mirrors `Estimate<T>`: a date we inferred must not render as a date the organiser
published. During research, a countdown site gave "London Marathon 2027: Monday 26 April" —
London is always a Sunday — which is exactly the failure mode the two-tier status exists to
contain.

**Coverage is deliberately uneven.** Long-course triathlon and big-city marathons publish
dates far ahead and are well represented; sprint/olympic triathlon and 5k are overwhelmingly
local, weekly, or announced late, and nothing there was verifiable, so those distances show
"no races listed yet" and fall through to freehand entry rather than being padded with
plausible-looking guesses. Freehand ("My race isn't listed") is always available at every
distance — the catalog is a convenience, never a gate.

**Known ceiling.** The catalog is a hand-maintained TS module (matching `eventMeta.ts`), so it
goes stale and cannot be edited by a non-engineer. Marked `ponytail:` in the source with the
upgrade path: a `race_catalog` table or an organiser feed, the moment either constraint bites.

---

## D-CALENDAR-PERSIST — Calendar moves are committed, with the first real audit row

**Status:** implemented. **Spec:** §8.4/F10 (week repair); hard rule #10, invariant I13.

**The gap.** `WeekBoard` ran `moveSession`, showed the repaired week and what the engine had
moved, then kept all of it in React state. A refresh discarded it. Worse, `plan_mutations` —
the table the schema calls "the product's credibility" — had **no writer anywhere in the
application**; the only insert in the repo was an RLS test seed, despite the engine already
returning a ready-made `PlanMutation` on every move.

**The commit gate is `remainingViolations`, not `mutation`.** `moveSession` returns a
mutation in the *unresolved* case too (`ATHLETE_MOVE_UNRESOLVED`), so its presence cannot mean
"safe to save". The contract is the one `RescheduleResult` already documents — *"Guardrails
still breached after the repair attempt (empty ⇒ safe to commit)"*. A move the engine can't
rebalance stays local for the athlete to review or undo, matching the UI's own wording.

**Mapping sessions back to rows.** `WeekSession` has no id, so `resolveWeekEdits` replays the
engine's `WeekEdit[]` **sequentially against a mutating day map** rather than resolving each
edit against the starting layout. That's required for correctness, not tidiness: a swap
(run Mon→Tue, bike Tue→Mon) or a session moved twice both mis-assign under independent
resolution. Unit-tested, including those two cases and an end-to-end agreement check against
real `moveSession` output.

**Atomicity.** The Supabase REST client can't span a transaction, so the workout updates and
the audit insert are separate calls. If the audit insert fails, the applied moves are **rolled
back** before throwing — rule #10 stays true in both directions rather than merely documented.
`original_scheduled_date` is written on the first move only, so the true original survives
repeated moves.

**Undo is a plan change too.** Undoing a committed move writes its own reversal plus its own
audit row (`ATHLETE_MOVE_UNDONE`, added to `RESCHEDULE_REASON`), instead of silently
diverging the board from storage — which would have reintroduced the exact bug this closes.

**Failure is visible.** A failed write reverts the board to what's stored and says so. The
save indicator is suppressed entirely for the sample athlete, where "Saved" would be a lie.

**Known ceiling.** The rollback is a compensating write, so a process death between the two
steps can still leave an unaudited move. Marked `ponytail:`. Acceptable for an
athlete-initiated drag that errors visibly and can be retried; move both into a Postgres
function called over RPC before anything writes plan changes unattended (weekly re-plan,
readiness downgrades), where nobody is watching to retry.

**Not verified end-to-end.** The pure resolver is unit-tested and the whole path typechecks,
but the actual Supabase round trip has not been exercised against a live database — no
signed-in athlete with a persisted plan was available in this environment.

---

## D-WELLNESS-NORM — daily check-in, and the readiness history it needs

**Status:** implemented. **Spec:** §10.1 (readiness score).

**The missing link.** `readinessScore` takes rolling means and baselines, not raw
observations, and §10.1 is emphatic: *"rolling means against a rolling baseline with an SWC
band, never single-day values."* Nothing in the codebase turned stored daily rows into that
shape, so readiness was unreachable from real data no matter what UI existed. That gap is now
`readiness/history.ts::buildReadinessInputs` — pure, deterministic, 22 tests.

**A check-in does not produce a score.** One morning of data can never be a readiness number;
the score only exists once a baseline does. `readinessCoverage` reports how many days are
logged and how many remain, so the UI can say "4 more days" instead of showing a confident
number derived from nothing. Below the threshold, Today keeps the sample and labels it as
sample.

**Thin-data rules** (`READINESS_MIN_ROLLING_SAMPLES = 2`, `READINESS_MIN_BASELINE_SAMPLES = 7`).
A one-value "rolling mean" is a single-day value, which §10.1 forbids, and an SD needs two
points. A metric below threshold is reported absent and `readinessScore` reweights over what
remains — the existing §10.1 behaviour, not new logic. A perfectly flat baseline (SD = 0) is
also treated as absent: it yields z = 0 for every value, which is the absence of signal rather
than evidence of normality.

**Wellness direction is now fixed, and this is the part worth revisiting.** §10.1 lists the
subjective inputs as "fatigue, soreness, stress, mood" on a 1–5 scale but never states which
end is good, while `ReadinessInputs.wellness` is documented "higher is better". Averaging a
mixed-direction scale would silently invert two of four inside the mean and quietly corrupt
every wellness z-score. All four are therefore enforced as **higher = better** (5 = fresh,
loose, calm, good mood), and the check-in UI labels each end explicitly so the athlete cannot
answer on the opposite scale. If the spec intends fatigue/soreness/stress as severity scales,
this must flip in both places at once — see [[Open Questions]].

**The undefined baseline window.** §10.1 gives explicit windows for HRV and resting HR
(7-day rolling, 60-day baseline) but says only "the athlete's own norm" for sleep and
wellness. Rather than invent a third number, `SLEEP_BASELINE_DAYS` / `WELLNESS_BASELINE_DAYS`
reuse the 60 days the spec does define. Flagged for sign-off, not silently adopted.

**Storage.** `daily_metrics` already had every column, including `readiness_score`,
`readiness_band` and `readiness_inputs` ("component breakdown, shown in UI") — no migration.
The check-in is an upsert on `(athlete_id, date)`, so revising this morning updates the day
rather than creating a second row. The derived readiness is stored alongside the raw inputs:
it's the engine's verdict *for that day*, and recomputing 60 days of history on every read to
redisplay it would be wasteful.

**Not verified end-to-end.** The engine and mappers are unit-tested and the whole path
typechecks, but no signed-in athlete has exercised the `daily_metrics` write against a live
database — same caveat as `D-CALENDAR-PERSIST`.

---

## D-READINESS-RESPONSE — the plan now responds to readiness (§10.2)

**Status:** implemented (day-level). **Spec:** §10.2; invariants I12/I13/I14.

**Closing the loop.** `D-WELLNESS-NORM` built the input half — check-in → readiness. This is
the output half: readiness → today's session actually changes, with an audit row.

**Scoring past days needs no-lookahead.** §10.2's rules count *consecutive* below-band days,
so a readiness *series* is required, not just today's score. `buildReadinessSeries` scores each
day using only data available as of that day — `buildReadinessInputs` already ignores rows
dated later. Without that, a check-in logged today would retroactively change what yesterday's
readiness "was", and "below band for 2 consecutive days" would quietly mean something
different on every run.

**Applied on check-in, not on render.** The adaptation is written when the athlete submits
their check-in — a deliberate action, at exactly the moment readiness changed. Doing it during
render would let any page load, refresh or re-mount silently rewrite the plan, and would race
with itself. This also makes the write naturally once-per-check-in rather than needing
idempotency guards against a render loop.

**Downgrade-only is enforced at the write boundary too.** `adaptedZone` returns a target only
when it is strictly *easier* than what's scheduled, so recovering readiness never restores a
hard session and no path can raise intensity (I12/I14). Property-tested across every
action × zone pair, not just the expected cases.

**Known ceiling — the day part only.** `weekLoadDeltaPct` and `suppressS3Days` (the week-level
half of the 2-day rule and of `convert_week_to_recovery`) are **not** applied to future
workouts. That belongs with `weeklyReplan`, and doing it half-way across a week is worse than
not yet doing it. Marked `ponytail:`; the audit row records the engine's full reason meanwhile,
so nothing is lost and the gap is visible in the data rather than only in code comments.

**Audit.** `actor: 'engine'` — this is the system responding, not something the athlete asked
for, and the reason code is the engine's own. A failed audit insert rolls the zone change back,
as in `D-CALENDAR-PERSIST`.
