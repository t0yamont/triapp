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

---

## D-REPLAN-WIRING — §10.3 weekly re-planning, run against real training weeks

**Status:** implemented (evaluation + audit; one action applied). **Spec:** §10.3.

**What was missing.** `weeklyReplan` is a pure *decision* function and was fully tested, but
nothing built its `WeeklyReplanContext` and nothing acted on its output — `ReplanCard` existed
and rendered decisions from a hardcoded context in `analytics-demo.ts`. So §10.3 had never
seen a real training week.

**Undefined means "no evidence", and that is load-bearing.** `buildReplanContext` leaves
`hrAtPaceChangeFrac`, `bodyMassChangeFrac` and `durabilityWorsening` **undefined** rather than
defaulting them, because `weeklyReplan` reads undefined as "no evidence" and stays silent,
while a default of `0` would assert *"measured, and unchanged"* — evidence the athlete never
gave. Those three need ingested activity data, so 4 of the 6 triggers are reachable today and
the other 2 correctly never fire. Explicitly tested.

**Only finished weeks count.** A week still in progress always looks like under-completion and
would trip `REPLAN_UNDERCOMPLETION` every time it was evaluated mid-week. `today` is passed in
rather than read from a clock, so this stays testable.

**Zone minutes are summed, not averaged.** The rolling 3-week distribution aggregates raw
minutes across the window instead of averaging three percentages, which would silently weight a
30-minute week equally with a 12-hour one.

**Evaluate on load; apply only when asked.** Evaluating is a pure read and happens
automatically. Applying writes to the plan, so it is an explicit athlete action — the same rule
`D-READINESS-RESPONSE` established, for the same reason: a page that happens to be open must
never rewrite the plan, and it would race with itself. §10.3 says these fire at the week
boundary; doing that *automatically* belongs to the scheduled job
(`supabase/migrations/…_scheduled_jobs.sql`), not to a mounted component. The card is explicit
about the distinction — "what the weekly re-plan **would** change" until applied.

**Applied vs recorded.** `reduce_weekly_target` is the one decision carrying a concrete number
(`newWeeklyTarget`), so it rewrites the upcoming week's `plan_weeks.load_target`. The other
five change how the *next week is generated*, and plan regeneration isn't wired — they are
audited but not applied. Recording them keeps the reasoning in the data rather than losing it,
and makes the gap visible where someone will actually see it. A failed audit insert rolls the
target change back, as everywhere else.

---

## D-ACTIVITY-LINK — activity upload, and the join to the session it completed

**Status:** implemented (upload + match + link). **Spec:** §5, §7 (dedupe); hard rules #6, #7.

**What was already there.** The whole server side existed and was tested: FIT/TCX/GPX parsers
(`@ironflow/core/ingest`), the dedupe rules, `upsertParsedActivity`, and the `ingest` Edge
Function that composes them. What was missing was any way to *put a file in*, and the join
back to the plan.

**The join was the real gap.** `activities.planned_workout_id` and
`workouts.completed_activity_id` both existed in the schema and were **never written by
anything**, and `workouts.status` was never set to `completed`. That is why completion rate —
which §10.3 reasons over for `REPLAN_UNDERCOMPLETION` / `REPLAN_FULL_RAMP` — had nothing real
behind it. A wrong match quietly distorts the plan's view of training, so the matching lives in
the engine as pure, tested logic (`plan/completion.ts`), not inline in a handler.

**Matching rules, and why.**
- **Day beats duration.** Same-day wins over a neighbouring day even if the neighbour's
  duration is closer. An athlete who did 40 minutes of a planned 90 still did *that* session,
  and the shortfall is exactly the signal §10.3 needs — matching it elsewhere would hide it.
  Duration only breaks ties within a day.
- **±1 day**, because long rides slip to Sunday and late sessions cross midnight once
  timezones apply. Wider and a mid-week session starts absorbing the weekend's activity.
- **Never across sports**, except that either leg may complete a `brick`. A silent
  swim→run mismatch is worse than no match: the athlete can always link by hand, but cannot
  easily discover a wrong attribution.
- Never re-matches an already-linked session.

**Parsing stays server-side** (hard rule #7). The browser posts raw bytes to the Edge Function
and never touches the parser. The follow-up link is a separate, typechecked call from
`api-client` rather than being added to the Deno function, which is outside `pnpm typecheck`.

**No `plan_mutations` row for a completion.** Rule #10 covers plan *mutations*; linking an
activity records what the athlete did, and leaves the plan itself untouched. Adapting the plan
in response (§10.2/§10.3) is audited, as it should be.

**Failures don't lose data.** An activity that matches nothing is still stored — it is training
either way, just not attributed. If the back-link write fails, the workout side is reverted so
a workout never points at an activity that doesn't point back.

---

## D-DECOUPLING-STOP / D-ANALYTICS-LIVE — decoupling at ingest, Analytics on real data

**Status:** implemented, with one deliberate limit. **Spec:** §11/§11.1, §5.2.

**Only decoupling could be computed honestly.** The task was "load, zone and decoupling
columns at ingest". Investigating first showed **most of that is blocked, and not by the
ingest step**:

| Column | Needs | Status |
|---|---|---|
| `decoupling_pct` / `decoupling_valid` | streams only — it's a within-session HR:intensity comparison | **Computed at ingest** |
| `external_load` (TSS) | CP / LT2 speed / CSS | Blocked — no anchors persisted |
| `internal_load` (TRIMP) | HR zones ⇒ `AthleteModel` ⇒ **hrMax *and* hrRest** | Blocked |
| `time_in_s1_s`…`s3_s` | the same zones | Blocked |
| `perceived_load` (sRPE) | an athlete-entered RPE | Blocked — nothing collects it |

Nothing writes `athlete_anchors`, `athlete_zones` or `athlete_model_current` anywhere in the
codebase. And `hrRest` has **no population formula in the spec at all** — that is the standing
open question `D-HRREST-POP`. Filling TSS/TRIMP would therefore have required inventing a
threshold, producing plausible numbers that are wrong in ways nobody notices — exactly what
`00-AGENT-BRIEF` forbids. Those columns stay null.

**`decouplingFromStreams`** (pure, 13 tests) turns per-sample HR + power/speed into the two
halves `computeDecoupling` expects. Choices worth keeping: halves split by **elapsed time**,
not sample count, so irregular sampling doesn't skew them; **zero-intensity samples are
dropped**, because coasting would drag the second half's mean down and manufacture drift; and
an invalid reading is **stored, not discarded** — the percentage is still evidence, and
`decoupling_valid` is exactly how §11.1 says to mark it untrustworthy. Swim and strength
return null rather than a meaningless ratio.

**`D-DECOUPLING-STOP` — a new flagged convention.** §11.1 invalidates a reading when there was
"no long stop" but never defines one. `DECOUPLING_LONG_STOP_S = 120` is a convention, not
physiology: long enough to ignore traffic lights, short enough to catch a break that lets HR
recover. Overridable per call. Flagged for sign-off like `D-HEAT-MARGIN`.

**Analytics is now live where the data is real, and says where it isn't.** Decoupling is
genuinely measured; distribution is genuinely the athlete's completed sessions, run through
the same `isWithinTolerance`/`isModerateDrift` the sample uses so the verdicts can't diverge.
**CTL/ATL/TSB are computed from the planned load of completed sessions**, because measured
load needs the thresholds above. The shape and trend are right; the units are "what the plan
asked for", not "what the body received" — so `loadBasis: 'planned_completed'` is carried
through and the chart says so in plain words rather than implying measurement. Swap to
`'measured'` the moment activities carry `internal_load`; `fitnessSeries` itself doesn't change.

---

## D-ATHLETE-MODEL — the athlete model is finally persisted

**Status:** implemented (HR anchors + zones). **Spec:** §2.1–§2.3, §3.

**The longest-standing gap in the repo.** `deriveHrMax`, `deriveHrRest`, `reconcileAnchor` and
`buildZones` have existed since the first commit and **nothing ever wrote an athlete model**.
Without one there are no zones; without zones there is no TRIMP and no time-in-zone — which is
why those columns are null on every activity and why Analytics runs on planned load.

**Everything derives from data the athlete actually gave.** Resting HR comes from their morning
check-ins (`daily_metrics.resting_hr`, which `D-WELLNESS-NORM`'s card already collects), and
HRmax from the age formula against the date of birth onboarding already captures — upgraded
automatically by any measured value, since `deriveHrMax` prefers lab/observed/reported over a
formula. Nothing is invented; if neither anchor can be derived, **no model is written at all**.

**`D-HRREST-POP` is sidestepped, not resolved.** That open question asks for a *population
default* resting HR. This needs none: the athlete's own readings are a better input than any
table, and the population default remains unanswered for the case where an athlete has never
checked in. The question stays open.

**Refuses a contradictory model.** A non-positive HR reserve (a reported HRmax below measured
resting HR) returns null rather than building zones on nonsense. Combined confidence is the
**minimum** of the components, never an average (`D-COMBINED-CONF`) — a lab-tested HRmax must
not disguise a weakly-known resting HR.

**Zones are versioned, not overwritten.** A refresh sets `valid_to` on the current rows and
inserts new ones, so a past prescription can still be explained by the zones in force at the
time. Anchors likewise get `superseded_at` rather than being replaced.

**Refreshed on check-in**, the moment new resting-HR data exists — a deliberate action, not a
render effect, per `D-READINESS-RESPONSE`. A failure there is swallowed: the check-in is the
athlete's data and must save regardless; the model is derived and can be rebuilt.

### A real bug this surfaced: `D-PROVENANCE-ENUM-DRIFT`

Persisting anchors revealed that the database `provenance` enum was **never extended** with
`css_test` and `riegel_prediction` when `D-GOAL-TIME-CSS` added them to
`PROVENANCE_CONFIDENCE`. Any attempt to store an anchor carrying either would have failed at
runtime with an enum violation — undetected until now only because nothing wrote anchors at
all. Migration `20260726100000_provenance_add_tiers.sql` adds them; `database.types.ts` was
hand-updated to match, since regenerating needs a live connection (`D-TYPEGEN`).

> The migration must be applied to the hosted project before anything persists a `css_test` or
> `riegel_prediction` anchor. The HR anchors written today use pre-existing values, so they
> work either way.

---

## D-TIME-IN-ZONE-INGEST — time-in-zone and TRIMP are binned at ingest

**Status:** implemented. **Spec:** §3.1, §3.4, §5.1.

`D-ATHLETE-MODEL` persisted the zones; this spends them. `activities.internal_load`,
`time_in_s1_s`, `time_in_s2_s` and `time_in_s3_s` are now written for every uploaded activity
that has an HR stream and a zone set — the first *measured* load in the product.

**Binned at ingest, not on read.** Stored streams are bytea-packed and `streams.ts` has
`packInt16`/`packFloat32` but **no unpacker**, so computing this later would mean writing one
plus a recompute job. Ingest has the parsed samples already in hand. It also gets the
physiology right: the zones applied are the ones in force *when the session happened*, which is
exactly why `athlete_zones` is versioned rather than overwritten.

**The cost of that choice, stated plainly: there is no backfill.** An activity uploaded before
the athlete's first check-in has no model, so no zone set, so null load columns — permanently,
until a recompute path exists. Null is the honest value; binning against a guessed zone system
would make `internal_load` *look* measured. This is the same trade `D-HRREST-POP` leaves open:
without a population resting-HR default, an athlete who has never checked in has no zones.

**Boundaries are `[lower, upper)` with the top zone inclusive, and out-of-range HR is clamped,
not dropped.** A sample exactly on a boundary lands in the higher zone consistently, so nothing
is double-counted. A HR above the modelled HRmax is genuinely maximal work (and a hint the
HRmax anchor is low); one below modelled resting HR is genuinely easy. Discarding either would
silently shorten the session, which is worse than binning it at the edge.

**Sample duration is the gap to the next sample, capped.** A device recording at 5 s, or pausing
mid-session, must not be read as 1 Hz. A gap longer than `maxSampleGapS` (default 60 s) counts
only that cap — otherwise a paused device credits hours of Z1 nobody trained. Dropout samples
(zero/non-finite HR) are skipped entirely.

**The stored zone set is Zod-validated on read, not cast.** `ZonesCard` casts its jsonb
(`z.zones as unknown as ZoneSet`) because a wrong render is visible and harmless. Ingest turns
those boundaries into numbers that are then stored permanently, so `zoneSetSchema` validates
them and a corrupt set yields null load rather than a silently mis-binned session.

**Not done here:** `activities.session_goal_zone` (that's the *plan's* goal for the session, so
it belongs to the link step, not the stream), `external_load`/TSS (still needs CP/CS/CSS from a
field test), and the Analytics swap from planned to measured load — see the note in
`live-analytics.ts`: it needs a third honest `loadBasis` for the mixed window and days keyed by
`activityLocalDate`, not UTC.

---

## D-ACTIVITY-LIST-LIVE — the activities list reads the athlete's own uploads

**Status:** implemented. **Spec:** §5.1, `06-UX`; hard rules #6, #8.

The upload control was live and the list beneath it was **fiction**: `activities-demo.ts` rendered
four fabricated sessions while `getActivitiesInRange` sat in `api-client` with no callers. An
athlete could upload a file, have it parsed, deduped, matched to a planned session and its load
measured (`D-TIME-IN-ZONE-INGEST`) and see none of it. `lib/live-activities.ts` +
`useLiveActivities()` close that loop, following the `live-plan.ts` pattern: null when there is
nothing live, so the page falls back to the sample rather than showing a broken state.

**A load figure is `number | null`, and the row prints "—", not `0`.** This is the whole design
problem of the step. `external_load` (TSS) is null for everyone — it needs CP/CS/CSS. `internal_load`
is null for anything uploaded before the athlete's model existed. `perceived_load` is null always,
because **nothing in the app collects an RPE**. A zero would be a claim that the session was
effortless; the dash says "not computable", which is true and is what §2.4's honesty discipline
implies for load as much as for anchors.

**The list total is TRIMP only — never a sum across metrics.** TSS and TRIMP are different
scales; adding them produces a number that means nothing. When no activity in the window carries
a TRIMP, the chip omits the load figure rather than showing `0`.

### A real bug this surfaced: `loadsDisagree` was invented, and cited the spec for it

`activities-demo.ts` carried `loadsDisagree()` — "the spread exceeds ~20% of the largest
(§5.1, F11)" — putting a warning triangle on rows. **§5.1 says no such thing.** The actual rule is
`loadDisagreement = |z(external) − z(internal)|` against the athlete's own rolling distribution,
flagged above **1.5 SD**. The 20%-spread heuristic was fabricated, mis-cited to the spec, and —
worse — with null figures coerced to zero it would have flagged **every real activity** as
disagreeing.

Deleted rather than ported. It is also **not computable today**: a disagreement needs *both*
metrics, and TSS is null for everyone, so the honest §5.1 version can only be written once a
field test produces CP/CS/CSS. `activities.load_disagreement` stays null meanwhile. When it is
built it belongs in `physio/load/`, with the 1.5 SD threshold in `constants.ts` cited to
REFERENCES.md — not in an app file.

**`unplanned` replaced the demo's decorative `partial` badge** for live rows: `planned_workout_id
is null` is real, available without a join, and useful ("this wasn't in your plan"). Deriving
"partial" properly needs the linked workout's planned duration — a join this list doesn't need.

**Hard rule #8 is tested, not just respected.** A row's day comes from `activityLocalDate` (the
per-activity `local_tz_offset_min` captured at ingest), never the UTC prefix of `start_time`. The
mapper is pure and covered across a late-evening session, one west of UTC, and **the Europe/Madrid
DST boundary of 25 Oct 2026** — the case CLAUDE.md explicitly asks for.

**`apps/web` gained a test runner** (`vitest`, `lib/**/*.test.ts` only) — it had none, so
`live-plan.ts`'s mappers have never been tested. Components stay untested on purpose: they are
presentation glue, whereas "which local day is this" and "absent or zero" are exactly the logic
that fails silently.

---

## D-SRPE-CAPTURE — the athlete can finally say how hard it felt

**Status:** implemented. **Spec:** §5.1 (Foster et al. 2001, `REFERENCES.md`).

§5.1 specifies three parallel load models and insists on computing all three, because they
disagree in informative ways. Two are sensor-bound: TSS needs CP/CS/CSS, TRIMP needs HR plus
zones. **sRPE needs nothing but a number from the athlete — and nothing in the app had ever asked
for one.** `activities.rpe` and `perceived_load` were null on every row, so the cheapest of the
three metrics was the only one with no path to existing, and §5.1's cross-check had nothing to
compare.

`setActivityRpe` (api-client) + `useActivityRatings` + `RpeControl` close it: rate a session from
its row in [[Activities and Settings]], and `perceived_load = srpe(rpe, minutes)` is stored
alongside the rating.

**Duration comes from the stored activity, never the caller.** The athlete rates effort; the app
already knows how long they went for. This also keeps `rpe` and `perceived_load` guaranteed
consistent, since one is derived from the other in the same write.

**`perceivedLoadFor` is pure and rejects a fractional RPE.** `rpe` is a `smallint`, so 6.5 would be
rounded by Postgres while `perceived_load` kept the unrounded product — the two would then
disagree permanently, with nothing to reveal it. 0 is rejected too: on the CR10 scale 0 is *rest*,
and this rates a session that happened.

**The scale is CR10 as session-RPE actually defines it**, with verbal anchors only on the values
Foster anchors (1 very very easy, 2 easy, 3 moderate, 4 somewhat hard, 5 hard, 7 very hard,
10 maximal). The gaps are deliberately unlabelled — inventing words for 6, 8 and 9 would change
what the athlete is being asked. The control and the page footer both say **"whole session"**: an
athlete who rates their hardest interval inflates the load on exactly the sessions the plan most
needs to read correctly.

**Ratable from any row, not just after upload.** Putting the prompt only in the upload result
would leave `perceived_load` null forever on every activity the athlete didn't rate within seconds
of uploading — including everything already ingested. This forced the list row to stop being one
giant `<button>`: a button inside a button is invalid and unreachable by keyboard, so the row is
now a container whose *title* is the navigation target.

**One hook for the list, not one per row.** `useSupabase()` memoises per component, so a hook
inside each row would construct a browser client and its auth listener per activity. The page owns
`useActivityRatings()` and rows are dumb. (The per-component memo is a pre-existing sharp edge in
`lib/supabase.ts` worth turning into a context if more list-level writes appear.)

**No audit row**, for the same reason as `D-ACTIVITY-LINK`: hard rule #10 covers plan *mutations*,
and this records what the athlete felt rather than changing what was asked of them.

**Verified reachable under RLS:** `own_rows on activities` is `for all` with
`athlete_id = auth.uid()`, so the anon-key client may update its own rows; no service-role path is
needed.

---

## D-TODAY-REAL-SESSION — Today shows the athlete's own session

**Status:** implemented. **Spec:** §7.1, §3.1, §2.4.

`today/page.tsx` passed `buildTodayView().session` — the **sample athlete's** session — to both
`VerdictHero` and `SessionShapePanel`, unconditionally. Every athlete saw "VO₂ intervals · 75m ·
3×5m @ 300–330 W" as their headline session regardless of what their plan said.

**This was not a missing-data gap, it was wrong data.** A null renders "—" and is honest; this
rendered a confident, specific, plausible workout that belonged to nobody. `00-AGENT-BRIEF`'s
warning is exactly this failure mode: *plausible-looking output that is wrong in ways nobody
notices for months*. Worse, the surrounding page — week strip, coming up, readiness, check-in —
was already live, which made the fabricated centre **more** credible.

**The data was already in hand.** The same component read `todayRow` from the persisted plan one
line above, purely to pass `workoutId`/`goal_zone` into the check-in so §10.2 could adapt it. So
the app rewrote the athlete's real workout in the database while describing a different one on
screen, and the adaptation banner narrated that change over the sample's session.

**Two things `toPlannedSession` deliberately refuses to invent:**

1. **The interval breakdown.** `workouts.structure` holds only
   `{ kind, durationMin, goalZone }` — the `toWorkoutRow` shortcut — so the work/recovery pattern
   of an interval session is *not persisted anywhere*. The shape bar renders the one block the
   data attests to. Fabricating 3×5min would be the very bug being fixed. A real silhouette needs
   `sessions/library.ts` (§7) wired into plan generation, which also fixes the generic names.
2. **Targets with no anchor.** With no `ZoneSet` the row carries duration only and
   `targetsConfidence: 0`, plus a note saying zones don't exist yet — rather than a number with
   no evidence behind it.

**Where the targets come from is the point.** Heart-rate ranges are derived from the athlete's
persisted `athlete_zones` (S1 spans Z1–Z2, S2 spans Z3–Z4, S3 is Z5), and `targetsConfidence`
carries `anchorConfidence` straight through. This is design commitment #1 — *every number honest
about how sure it is* — reaching the primary screen for the first time. The jsonb is
Zod-validated, not cast: these bpm numbers are shown to an athlete as targets to train at.

**Two sibling lies fixed with it**, both the same class:

- `SessionShapePanel` hardcoded the confidence label `"Watts from your ramp test, 34 days ago"` —
  a test that never happened. The note now travels on the session (`targetsNote`), so a live
  session cannot inherit the sample's claim.
- The adaptation banner fell back to `view.adaptation` ("the engine eased today's VO₂ session").
  Against a real, untouched session that is a false claim of a plan change, so a live session with
  no check-in yet now shows `UNADAPTED`, and the sample's `plan_change` attention item is
  filtered out.

## D-DUPLICATE-PLAN-CLEANUP — a diagnostic for damage already done

`D-AUTH-DESTINATION` stops new duplicate active plans; it cannot undo the ones the old behaviour
created. `supabase/diagnostics/duplicate_active_plans.sql` finds them and archives the ones never
trained against.

**Not "keep the newest".** That is merely what `getActivePlan` happens to do (`order by created_at
desc limit 1`), and it is how the damage hides: the newest empty duplicate shadows the plan the
athlete actually trained against, taking its workouts and completion history out of view. The
script ranks by *evidence* — completed workouts, linked activities, audit rows — and only then by
recency, and it **archives rather than deletes**, so nothing an athlete did is lost and a wrong
call is reversible. STEP 3 ships commented out, inside a transaction, with a re-check before
commit.

---

## D-SESSION-LIBRARY-WIRED — §7 session templates reach a generated plan

**Status:** implemented. **Spec:** §7.1, §7.2, F13.

`sessions/library.ts` had existed since early on with **one exported function** (`renderVo2max`)
and **no caller outside its own test**. Plan generation never touched it. Instead
`api-client::toWorkoutRow` derived name, purpose, template id and structure from `isHard` +
sport — a §7 formula living in the persistence layer, which `CLAUDE.md` explicitly forbids
("If you are writing a formula in an app, it is in the wrong place"). The visible results were
that every workout was called "Ride — aerobic" or "Run intervals", and every `structure` was the
placeholder `{ kind, durationMin, goalZone }`.

That placeholder is why [[Today Dashboard]] could not draw a real session silhouette: the
work/recovery pattern was **not persisted anywhere**.

**Purpose is now decided by the planner** (`micro.ts::sessionPurpose`), because it is a planning
decision — it depends on the phase, the week type and which slot the session landed in.
`WeekSession.purpose` had been an optional field since the first commit with nothing ever setting
it; it is now **required**, which deleted the last dead fallback in `generate.ts` and made the
type tell the truth. Only purposes the placer can actually produce are assigned: no threshold
(it emits no S2-only work), no bricks, no strength.

**Duration is the invariant that made this non-trivial.** The canonical bike VO₂ session is
~63 min; the planner's S3 slot cap is 40. A structure that disagreed with `planned_duration_min`
would be two contradictory numbers for one session, and that column drives load and every
guardrail. `renderSession` therefore renders to **exactly** the allocated duration, and a test
asserts it across every sport × purpose × duration combination, plus across every workout of a
generated 16-week plan.

**What flexes and what does not.** The *format* is the physiological claim and is never rescaled —
30/15 for the bike, 3–4 min for the run — because that divergence is the whole point of F13. Only
the repetition count flexes to fit the slot. Warm-up and cool-down are capped at a fraction of a
short session rather than eating it whole.

**`durability` puts its race-pace block in the final third** (§7.2, §11). Not decoration: the
decoupling reading compares the session's two halves, so a harder block placed early would
manufacture drift. Placed last, it builds and measures durability at once.

**An easy session is left unembellished.** One steady block. Inventing structure for an aerobic
run would be inventing a prescription.

### The shape bar, and two bugs the tests caught

`toSessionIntervals` flattens the stored structure for [[Today Dashboard]]'s silhouette. Two
defects in the first attempt, both found by tests written from the spec rather than from the
implementation:

1. **Rounding drift.** Rounding each block independently rendered a 40-minute session as 43 —
   next to a header printing "40m". Fixed with largest-remainder rounding, the same technique
   `distribution/classify.ts` uses to keep percentages summing to 100.
2. **Unreadable expansion.** A bike VO₂ set expands to 78 alternating slivers; merging adjacent
   same-zone blocks doesn't help because the zones alternate by design. Past a readable budget a
   repeat is now **summed** rather than drawn out — one work block, one recovery block, same
   totals and the same alternation at set level — while a run's 5 × 3 min still draws every
   repetition.

Older plans stored the placeholder structure, so the flattener returns null for those and the
session falls back to a single block rather than rendering nothing.

---

## D-I15-ENFORCED — confidence now caps intensity, not just ramp rate

**Status:** implemented. **Spec:** §2.4, §14, invariant I15, Phase-5 gate.

Invariant I15: *"With anchor confidence <0.30, no generated workout has `goalZone = 'S3'`."*
It did not hold. A probe against `generatePlan` at confidence 0.20 produced **11 S3 (VO₂max)
workouts in a 12-week plan**.

`confidence.ts` had always computed the full §2.4 behaviour table correctly — including
`maxSZone: 'S1'` for the critical tier, with a comment claiming it *"guarantees invariant I15"*.
But ==`maxSZone` appeared nowhere in `plan/*.ts`==. `constructMicrocycle` was never even passed
confidence; `assemblePlan` had it and forwarded it only to `applyRampCap`. So confidence
governed **how fast load grew and never how hard the sessions were** — half of the product's
first design commitment ("low confidence slows progression, shifts intensity targets
conservatively, and forces earlier testing") was simply absent.

`z5VolumeFraction` was unconsumed for the same reason, so the fix covers both: `MicroInput`
takes a **required** `confidence`, S3 is only placed when `maxSZone === 'S3'`, and G6's phase cap
on S3 minutes is multiplied by `z5VolumeFraction`. The two are multiplicative because they
constrain different things — the phase caps intensity *distribution*, confidence caps how much
of it we are willing to prescribe on the evidence available.

**The critical tier still gets a full week**, not an empty one: §2.4 says "aerobic and technique
work only", not "stop training". The placer fills every available day with S1 work and the §7.2
purposes stay meaningful.

**Why the existing gate never caught it.** The Phase-8 season simulation runs 20 synthetic
athletes at `confidence: 0.3 + (i % 7) * 0.1` — **0.30 to 0.90**. The cohort's floor sat exactly
on the I15 boundary, so no athlete was ever in the tier the invariant is about. The cohort now
extends to 0.15, and the gate asserts I15 across it plus a z5-volume comparison between tiers.
A test that cannot fail is worth nothing: reverting the one-line `allowS3` change fails four
tests, including the season gate.

> [!warning] Reachability, stated honestly
> Today the app only ever generates a plan at onboarding, with a hardcoded
> `NEW_ATHLETE_CONFIDENCE = 0.3` — which is the *low* tier, one hundredth above the boundary. So
> this path is not currently reachable through the UI. It becomes load-bearing the moment plan
> regeneration uses the athlete's **real** model confidence, where an age-formula HRmax scores
> `population_formula = 0.2` and combined confidence is the *minimum* of components — i.e. the
> moment the "apply the rest of the adaptation decisions" gap is closed. The ceiling is in place
> before that happens rather than being a landmine underneath it.

**Also unconsumed, not fixed here:** `ConfidenceBehaviour.blocking` (true only for the critical
tier — §2.4's "UI-blocking, test within 7 days") is read by nothing. An athlete dropped to
aerobic-only work is currently told *nothing* about why, or that a field test would lift it.
That is a UI gap and belongs with the field-test capture screen.

---

## D-F15-DEGRADATION — §14 is code now, not prose

**Status:** implemented. **Spec:** §14, F15, Phase-5 gate.

F15 gates Phase 5 and **had never been written** — no fixture, no test. §14's degradation matrix
existed only as a table in the spec: `deriveHrMax`/`deriveHrRest` returned null and told the
caller to "degrade", and no caller knew what that meant.

`physio/degradation.ts` makes the matrix a table the way `confidence.ts` does for §2.4, plus the
fixture `F15-degradation.json` and 16 tests. Pure and **total**: every capability combination
returns a complete answer, because "no crash, no null targets" is precisely what F15 asserts.

**RPE is the floor, and that is the point.** `sessionTargets` always returns at least one target,
because RPE needs no sensor — which is exactly why §14 falls back to it. An athlete with no HR
anchors used to get a session card showing duration and nothing else; they now get a real
prescription. Modalities are ordered most-objective-first: with a power meter you read watts and
treat RPE as a sanity check; with neither, RPE *is* the prescription.

**Power and pace are named without a band.** The modality is prescribable but the *number* needs
a CP/CS/CSS anchor no field test has produced. Naming the modality and admitting the number is
missing is the honest half of the answer; inventing a watt range would be the dishonest one.

**Swim exclusion applies to *measured* load, not planned load.** §14 says "exclude from load
totals with a visible note". `sumMeasuredLoad` does that. It deliberately does **not** touch the
planner's arithmetic: planned load is duration × zone weight and needs no swim data at all, so
excluding planned swim volume would distort the ramp guardrails for no gain. The note is
mandatory whenever anything is excluded — a silently smaller total is indistinguishable from an
easy week.

**Wired, not shelved.** `toPlannedSession` now builds its target rows from `sessionTargets`, so
this is reachable from [[Today Dashboard]] the day it lands. That is deliberate: `sessions/library.ts`
sat uncalled for months and `maxSZone` was computed and never read — an engine module with no
caller is the failure mode this repo keeps producing.

`capabilitiesOf` is honest about being provisional: `hasHr` is real (a zone set exists only when
HR anchors were derived); the rest are `false` because **no athlete has a CP/CS/CSS anchor**, so
no power or pace target is expressible for anyone, and nothing yet inspects activity history for
a power meter or swim data. §14's safest answer is the degraded one, so unknown ⇒ false is the
correct direction, not a placeholder that flatters.

### `D-RPE-BANDS` — flagged, needs sign-off

§14 says to prescribe by RPE and §5.1 cites Foster's CR10 for sRPE, but ==the spec never states
which RPE corresponds to which zone==. `RPE_BY_SZONE` (S1 2–4, S2 5–7, S3 8–10) follows Foster's
verbal anchors mapped onto the LT1/LT2 boundaries the S-zones already encode, and is deliberately
conservative at the top — S3 starts at 8, not 7, so an athlete steering by feel under-shoots
rather than over-shoots the hardest work. Same posture as `DECOUPLING_LONG_STOP_S`: the engine
needs a number to prescribe anything at all, so it uses a documented convention and says loudly
that it is one.

**Also unresolved:** §14 asks for swim "stroke-count targets" but gives no way to derive one, and
an athlete with no swim data has no baseline to derive it from. The target is therefore an
instruction ("hold it steady across lengths"), not a fabricated number.

---

## D-FIELD-TEST-CAPTURE — a test result can finally be recorded

**Status:** implemented (swim CSS). **Spec:** §6.3, §12, §5.1.

§12 opens with *"tests are prescriptions, not suggestions"*, and `nextFieldTest` has been telling
athletes **when** to test since early on — wired into [[Today Dashboard]] and `PlanGeneration`.
Nothing anywhere recorded what a test **measured**. So `fitCriticalSwimSpeed` had no caller
outside its own test, no athlete ever acquired a threshold anchor, `athlete_anchors` held only
HR anchors, and `external_load` was null for every activity ever ingested.

**Swim-only, and that is a considered scope, not a shortcut.** CSS is the one anchor that
*requires* a human to type something in: §6.3 fits critical power and critical speed **passively**
from mean-max efforts in ordinary training, explicitly "no test". A bike or run capture form would
be asking the athlete for data the engine is supposed to derive on its own — building it would
create the wrong habit and the wrong UI. Bike/run TSS is unblocked by wiring mean-max fitting to
ingested streams, not by another form.

**A refused fit is an outcome, not an error.** `fitCriticalSwimSpeed` rejects wrong distances, a
400 m faster than the 200 m, and a 200 m paced so hard the pair no longer describes a sustainable
speed. Each gets its own sentence. This matters more than usual: an inflated CSS silently becomes
every swim target *and* every swim TSS value until the next test, so "we couldn't use that" is the
correct answer, not something to round away.

**Anchors are superseded, never overwritten** — the previous current row gets `superseded_at`,
matching how `persistAthleteModel` treats HR anchors, so a past prescription stays explicable.

**The read half shipped with the write half.** `deriveAthleteModel` now folds stored sport anchors
into `model.sports` via `toSportAnchors`, and ingest scores swims with `toSwimTss`. Writing a row
that nothing reads is the exact dead end this repo keeps re-creating — `sessions/library.ts` sat
uncalled for months, `maxSZone` was computed and never read, `getActivitiesInRange` had no
callers. Not a fourth time.

**What it unlocks, precisely:** swim `external_load`. Bike and run TSS remain null, because they
need CP/CS, which need mean-max fitting over stored streams — and `streams.ts` still has no
unpacker. §14's `cpFitAllowed` stays false for everyone, so power and pace targets still name a
modality without a number.

> [!warning] The migration finally matters
> This is the **first code path that writes `provenance = 'css_test'`**, the value migration
> `20260726100000_provenance_add_tiers` adds. Until it is applied, the insert fails with an enum
> error. `recordCssTest` detects that specific failure and returns `status: 'blocked'` with an
> actionable sentence, rather than surfacing a driver error or — worse — appearing to succeed.

**Inherited open question:** a stored swim TSS carries `D-SWIM-IF`. §5.1 defines swim
`IF = CSS / actual`, so swimming *easier* than CSS **inflates** the score. Implemented
spec-literal with the flag carried into `toSwimTss`; if that question resolves the other way,
every stored swim TSS changes with it.

---

## Five open questions, resolved (27 July 2026)

The owner delegated these. Each is recorded with the reasoning so they can be reversed on
evidence rather than re-argued from scratch.

### 1. `D-HEAT-MARGIN` — resolved: 3 °C wet-bulb, as product policy

§7.4 prescribes a heat block when race conditions exceed the athlete's norm "by a defined
margin" and never defines it. It is now `HEAT_TRIGGER_MARGIN_C = 3`, a **product-policy default**
(explicitly not a cited physiological threshold), overridable per athlete.

**Why 3, and why a default at all.** Leaving it a required input meant the UI would have to ask
an athlete a question no athlete can answer. The value is set low because the risks are
asymmetric: the preferred intervention is 20–30 min of passive sauna that costs no training
quality, while an unacclimated athlete in a hot race risks a bad day at best and heat illness at
worst. Over-prescribing is cheap; under-prescribing is not. Revisit with a citation if one exists.

### 2. `D-SWIM-IF` — resolved: the spec formula is inverted; implemented correctly

§5.1 writes swim `IF = CSS speed / actual speed`. Implemented as `actual / CSS`, matching every
other sport.

**Why deviate.** The literal formula makes IF *rise* as the athlete swims easier, so a recovery
swim would score more load than a threshold set — the arithmetic contradicts the meaning of
"intensity factor", and the resulting sTSS would corrupt CTL/ATL for anyone who swims. F6 pins
only the cubic exponent, not the value, so no golden fixture moves. This is recorded as a
**spec erratum**, not a licence to reinterpret other formulas.

### 3. Minimum plan weeks / entry requirements — signed off as product policy

`PLAN_WEEKS_BY_EVENT` and `EVENT_ENTRY_REQUIREMENTS` stand as implemented (cross-checked against
MyProCoach, Campfire Endurance, IRONMAN and Triathlete). They remain the only constants without a
REFERENCES.md citation and stay flagged as convention. They gate warnings and advice, never
safety limits — a wrong value produces worse advice, not an unsafe plan — so convention is an
acceptable basis. Any coach review should start here.

### 4. `D-G2-PEAK` — confirmed

G2 compares against the athlete's recent *peak* long session, not the immediately preceding week.
The literal per-week reading contradicts G4, which mandates a recovery-week volume cut and so
guarantees a bounce-back that G2 would flag; two mandatory guardrails cannot contradict. The
injury vector is a **new** longest session, not a return to one already handled. Unchanged.

### 5. Readiness-to-start gate — resolved: warn and prepare, never block

`assessStartReadiness` stays advisory. An athlete below an event's entry requirement gets a
preparation block and a plain explanation, and is never prevented from choosing the race.

**Why.** Blocking is both paternalistic and ineffective — the baseline is self-reported, so a
blocked athlete simply re-enters a better number and the engine ends up planning from a fiction
*and* has lost their trust. Warning keeps the honest answer valuable, which is what makes the
rest of the adaptive system work. It also matches the framing already in the product: the
shortfall is the plan doing its job, not the athlete being behind.
