# 07 — Acceptance Criteria & Golden Fixtures

Every phase gate below must pass before the next phase begins. These are contract tests,
not suggestions. A failing golden fixture means the change is wrong until proven otherwise.

---

## A. Engine invariants (property tests — must hold for all inputs)

Implement with `fast-check`. These are the safety properties of the system.

| # | Property |
|---|---|
| I1 | Zone boundaries are strictly monotonic increasing: `Z1.upper < Z2.upper < … < Z5.upper` |
| I2 | Every HR zone boundary lies within `[hrRest, hrMax]` |
| I3 | `pctHRR` and `bpm` for the same boundary always agree to within 1 bpm after rounding |
| I4 | In threshold-anchored mode, `Z2.upper == HR@LT1` and `Z4.upper == HR@LT2` exactly |
| I5 | No generated week has a load ramp exceeding the applicable G1 cap |
| I6 | No generated week contains >2 consecutive hard days (G5) |
| I7 | No generated week exceeds the athlete's declared weekly hour ceiling (G10) |
| I8 | Every taper reduces final-week volume into `[41%, 60%]` of pre-taper volume (G/§8.3) |
| I9 | Every taper retains ≥1 S3 session and session frequency within 1 of pre-taper |
| I10 | Every recovery week's load falls in `[55%, 70%]` of the preceding week |
| I11 | Weekly S3 time never exceeds 10% of weekly duration (8% in Base) |
| I12 | Readiness rules never *increase* prescribed load (asymmetry, §10.2) |
| I13 | Every plan write produces exactly one `plan_mutations` row with a non-empty reason |
| I14 | Confidence is never silently increased: an `Estimate` may only gain confidence via a higher-priority provenance |
| I15 | With anchor confidence <0.30, no generated workout has `goalZone = 'S3'` |
| I16 | Engine functions are pure: calling twice with identical inputs returns deep-equal outputs |
| I17 | Every plan week's session count ≥1 rest day (≥2 in a recovery week) |
| I18 | No session violates athlete availability (day blocked → no session that day) |

---

## B. Golden fixtures

Ship as `supabase/seed/fixtures/*.json`. Each is an input snapshot plus an expected
output snapshot. Regenerate only deliberately.

### F1 — Zone construction, threshold-anchored
Input: `hrMax 186, hrRest 44, HR@LT1 142, HR@LT2 168`.
Expected: `HRR = 142`; Z2 upper = 142 bpm = 69.0% HRR; Z3 upper = 155 bpm = 78.2% HRR;
Z4 upper = 168 bpm = 87.3% HRR; Z1 upper = 142 − 0.08×142 = 130.6 → 131 bpm.
Anchor mode `threshold_anchored`.

### F2 — Zone construction, HRR fallback
Input: `hrMax 190 (population_formula), hrRest 50, no thresholds`.
Expected: HRR = 140; boundaries at 120/134/148/162/176 bpm; anchor mode `hrr_fallback`;
combined confidence < 0.30; **and the plan generated from this model contains zero S3
sessions** (ties I15).

### F3 — HRmax formula correctness
Input: age 30.
Expected: HUNT `211 − 0.64×30 = 191.8`; Tanaka `208 − 0.7×30 = 187.0`.
Asserts the two are stored separately and the HUNT value is the one used.

### F4 — DFA-a1 threshold detection
Input: a synthetic RR series over a slow ramp with a known α1 crossing.
Expected: LT1 detected at α1 = 0.75 ± tolerance; provenance `dfa_a1_single`;
confidence 0.50. With three such sessions within 21 days spanning ≤6 bpm:
provenance upgrades to `dfa_a1_multi`, confidence 0.75, value = median.
Negative case: a series with 8% artefacts is **rejected**, no anchor produced.

### F5 — Critical power fit
Input: mean-max points `(180 s, 320 W), (300 s, 290 W), (600 s, 262 W), (900 s, 252 W)`.
Expected: CP and W′ from the 2-parameter hyperbolic fit, R² ≥ 0.95, W′ within
`[5000, 35000] J`, provenance `cp_model_fit`, confidence 0.70.
Negative case: adding a 45 s point must be **excluded** by the duration filter, not fitted.

### F6 — Load metrics
Input: a 3600 s bike file, NP 210 W, CP 250 W. Expected `TSS = 70.6 ± 0.1`.
Input: a 3600 s run at GAP 3.60 m/s, LT2 speed 4.00 m/s. Expected `rTSS = 81.0 ± 0.1`.
Input: a 2400 s swim, CSS 1.20 m/s, actual 1.05 m/s. Expected `sTSS` via cubic exponent.

### F7 — Taper generation, Ironman A race
Input: 18-day taper, pre-taper week load 700.
Expected: three taper weeks decaying at ~0.65; final week load in `[280, 413]`
(i.e. 40–60% of 700); ≥1 S3 session in every taper week; session count within 1 of
pre-taper; last 48 h contains one short activation session.

### F8 — Ramp guardrail
Input: a plan request asking for +18% next week.
Expected: generated week is capped at +8% (or +5% if confidence <0.5), and a
`plan_mutations` row exists with reason code `RAMP_CAP_APPLIED`.

### F9 — Readiness downgrade
Input: HRV 7-day mean below `baseline − 0.5×SD` for 2 consecutive days; today is a
scheduled S3 bike session.
Expected: session becomes S1 or rest; week load target reduced 10%; exactly one mutation
row with reason code `READINESS_2DAY_LOW` and an athlete-readable sentence.
Paired negative: HRV *above* the band for 3 days produces **no** plan change.

### F10 — Athlete move action
Input: athlete moves Thursday's threshold run to Friday, where a long ride is scheduled.
Expected: engine validates; G5 would be violated; the week is repaired (long ride shifted
or run relocated), and the response tells the athlete exactly what else moved.

### F11 — Distribution accounting divergence
Input: a week of 5 sessions where session-goal classification gives 80/0/20 and
time-in-zone gives 68/24/8.
Expected: both computed and stored; the S2 time-in-zone value (24%) exceeds the 25%
threshold check narrowly and does not warn; at 26% it does warn with reason code
`MODERATE_DRIFT`.

### F12 — Decoupling
Input: a 3-hour ride, first half HR/power ratio 0.62, second half 0.66.
Expected: `decoupling_pct = 6.45`, `decoupling_valid = true`; because >5%, the next
week's plan increases long-session aerobic volume rather than intensity, with reason
code `DURABILITY_LIMITER`.

### F13 — Sport-specific interval selection
Input: a VO₂max session requested for `bike` and for `run`, same athlete.
Expected: bike renders 3×13×(30/15); run renders 4–6×3–4 min. Asserts the sports do
**not** share an interval template.

### F14 — Timezone
Input: an athlete in `Europe/London` records an activity in `America/New_York` during a
DST transition week.
Expected: the activity lands on the correct local training day; the training week's
boundaries do not shift; weekly load totals are unchanged by the travel.

### F15 — Degradation
Input: an athlete with no HRV, no power meter, no swim data.
Expected: a valid plan is still produced; readiness computes from wellness + completion;
bike sessions prescribe HR and RPE targets; swim sessions prescribe RPE and stroke count;
swim load is excluded from totals with an explicit flag. No crash, no null targets.

---

## C. Phase gates

**Phase 1 — Foundation**
- [ ] All migrations apply cleanly; RLS verified by an automated test that authenticates
      as athlete A and confirms zero rows visible from athlete B, on every table
- [ ] Auth flows work including Apple Sign In on a physical device (when mobile lands)
- [ ] Onboarding completes and persists availability
- [ ] `pnpm test:physio` runs with zero engine code — the harness exists

**Phase 2 — Ingest**
- [ ] FIT upload parses into activities + laps + streams, including RR intervals
- [ ] Webhook replay is idempotent (test: deliver the same payload 3×, one row results)
- [ ] Dedupe correctly merges the same ride from two providers
- [ ] Historical backfill of 500 activities completes and reports progress
- [ ] F14 passes

**Phase 3 — Engine core**
- [ ] I1–I4, I14, I16 pass
- [ ] F1, F2, F3, F4, F5, F6 pass
- [ ] Zone construction works in both anchor modes
- [ ] Anchor reconciliation produces a stable `athlete_model_current`

**Phase 4 — Load & analytics**
- [ ] F6, F11, F12 pass
- [ ] CTL/ATL/TSB match a hand-computed reference series to 0.1
- [ ] Mean-max curves computed and cached; CP fit runs against real seed data
- [ ] Activity list renders 1000 activities without fetching a single stream (assert
      network calls in the e2e test)

**Phase 5 — Planning**
- [ ] I5–I11, I15, I17, I18 pass
- [ ] F7, F8, F13, F15 pass
- [ ] A 24-week Ironman plan generates in <2 s and satisfies every invariant
- [ ] Every generated plan has a complete phase layout with no gaps or overlaps

**Phase 6 — Adaptation**
- [ ] I12, I13 pass
- [ ] F9, F10 pass
- [ ] Every mutation renders a sentence an athlete understands (reviewed manually)
- [ ] Field test scheduling respects all placement rules in §12

**Phase 7 — Execution & mobile**
- [ ] Workout push reaches a real Garmin device
- [ ] Plan mutation republishes the affected pushed workout within one sync cycle
- [ ] FIT workout download fallback produces a file the device accepts

**Phase 8 — Launch readiness**
- [ ] Self-service data export produces complete JSON + original files
- [ ] Self-service delete cascades and revokes provider tokens, verified
- [ ] Consent records present and versioned for every user
- [ ] Sync health dashboard live with alerting
- [ ] Zero guardrail violations in `plan_mutations` across a 12-week simulated season for
      20 synthetic athletes
