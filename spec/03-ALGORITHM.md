# 03 — The Physiology & Planning Engine

> This is the core of the product. Read it in full before implementing any part of it.
> Every constant is cited. Do not change one without reading the citation in
> `REFERENCES.md` and logging the change in `DECISIONS.md`.

> **Revision r2 — evidence review, July 2026.** This pass re-checked every load-bearing
> citation against the primary source and added evidence the r1 draft was missing.
> Nine substantive changes; see §17 for the full register with citations and the engine
> consequence of each. Two were **corrections to overstated claims** (§0.1, §6.1), one
> was a **capability gap** (§7.2b, sub-threshold work), and the rest were refinements
> that make an existing rule more specific. No constant was changed without a source.

---

## 0. Design principles

**0.1 — Anchor to thresholds, not to maxima.**
Prescribing intensity as a percentage of a maximum (HRmax, VO₂max, peak power) produces
markedly different physiological strain in different athletes at the same percentage: at
a fixed 80% HRmax, individuals split across the moderate and heavy domains rather than
sharing one *(Iannetta et al. 2020; Jamnick et al. 2020)*. Threshold-anchored prescription
is the single most important design decision in the engine.

**State the benefit precisely — r1 overstated it.** The individual-participant-data
meta-analysis (42 studies, 1544 individuals) found threshold-anchored prescription
produced a **larger mean VO₂max gain** (4.1 vs 1.8 mL·kg⁻¹·min⁻¹ in controlled studies)
and a far **higher responder rate** (64% vs 16% exceeding a 1-MET minimum important
difference). It explicitly did **not** find reduced variability of adaptation — the SD of
change was equivalent (1.5 vs 1.7, BF = 0.55) *(Meyler et al. 2025, Sports Med
55:301–323)*. Reduced *acute* response heterogeneity is demonstrated for the heavy/severe
domain anchored to critical power *(Meyler et al. 2023, Exp Physiol 108:581–594)*, but at
moderate intensity independent crossover work has found no variance advantage
*(Pacitti et al. 2025; Shikaze et al. 2025)*.

**Engine consequence.** Threshold anchoring is justified as *"more athletes adapt, and
they adapt more"*, not as *"everyone responds the same"*. The engine must therefore keep
per-athlete response tracking (§10.3) rather than assuming a well-anchored plan makes
individual monitoring unnecessary. Copy in the UI must not promise consistency of
outcome.

**0.2 — %HRR is the presentation layer, thresholds are the model layer.**
All heart-rate zones are *displayed* as %HRR (Karvonen) because that is what the athlete
asked to see and it incorporates resting HR, so it tracks fitness state better than
%HRmax. But the zone *boundaries* are placed at LT1 and LT2 whenever those are known,
and only fall back to population %HRR bands when they are not. The two are reconciled:
every boundary is stored simultaneously in bpm, %HRR and %HRmax.

**0.3 — Confidence is a first-class value.**
Every estimate is `{ value, confidence: 0..1, provenance, measuredAt }`. Confidence
propagates through every calculation and *changes plan behaviour*: low confidence means
slower progression, more conservative intensity, and earlier scheduled testing.

**0.4 — Multiple imperfect metrics beat one authoritative metric.**
Every training-load metric fails somewhere: power-based TSS is unavailable when running
without a power meter, HR-based load is useless for short intervals and distorted by
heat and caffeine, sRPE is subjective. Compute all three, agree where they agree, and
surface disagreement rather than hiding it.

**0.5 — Asymmetric response to daily signals.**
A bad readiness signal can reduce today's load immediately. A good readiness signal can
never increase it. Load increases only happen at weekly planning boundaries, on
multi-day evidence. This makes the system robust to noisy single-day measurements.

**0.6 — Degrade, never fail.**
Every subsystem has a defined behaviour when its inputs are missing. See §14.

---

## 1. Engine architecture

```
packages/core/physio/
├── constants.ts          # every cited constant, single source of truth
├── types.ts              # AthleteModel, Zones, Session, Week, Plan, Readiness
├── anchors/
│   ├── hrMax.ts          # HRmax derivation + confidence
│   ├── hrRest.ts         # resting HR derivation
│   ├── dfaAlpha1.ts      # LT1/LT2 detection from RR intervals
│   ├── criticalPower.ts  # CP/W′ and critical speed fitting
│   ├── swimCss.ts        # critical swim speed
│   └── reconcile.ts      # merges all sources into one AthleteModel
├── zones/
│   ├── build.ts          # 5-zone construction (anchored or fallback)
│   └── seiler.ts         # 3-zone roll-up for distribution accounting
├── load/
│   ├── tss.ts            # per-sport external load
│   ├── trimp.ts          # internal load
│   ├── srpe.ts           # session RPE load
│   └── fitness.ts        # CTL/ATL/TSB, monotony, strain, ramp
├── distribution/
│   ├── classify.ts       # session-goal + time-in-zone classification
│   └── policy.ts         # phase-dependent distribution targets
├── durability/
│   └── decoupling.ts     # internal:external decoupling, durability index
├── readiness/
│   └── score.ts          # HRV/RHR/sleep/wellness → readiness
├── sessions/
│   ├── library.ts        # parameterised session templates
│   └── render.ts         # template + athlete model → concrete workout
├── plan/
│   ├── macro.ts          # phase layout from race calendar
│   ├── micro.ts          # week construction
│   ├── taper.ts          # taper generation
│   ├── invariants.ts     # week validation rules
│   └── replan.ts         # athlete-action and adaptation re-planning
└── testing/
    └── schedule.ts       # field test scheduling
```

**Purity contract.** No module in `physio/` may import React, Supabase, an HTTP client,
or read the system clock. Time is always an argument. This makes the entire engine
trivially testable and lets it run identically in an Edge Function, a test harness, and
a backfill script.

---

## 2. The athlete model

### 2.1 Structure

Per athlete, per sport (`run` | `bike` | `swim`):

```ts
interface SportAnchors {
  lt1: Estimate<{ hr: number; pace?: number; power?: number }>;  // aerobic threshold
  lt2: Estimate<{ hr: number; pace?: number; power?: number }>;  // anaerobic threshold
  criticalIntensity: Estimate<number>;   // CP (W) or CS (m/s) or CSS (s/100m)
  wPrime?: Estimate<number>;             // J, bike/run only
  economy?: Estimate<number>;            // sport-specific
  durabilityIndex: Estimate<number>;     // §11
}

interface AthleteModel {
  hrMax: Estimate<number>;
  hrRest: Estimate<number>;
  hrReserve: number;                     // hrMax − hrRest, derived
  sports: Record<Sport, SportAnchors>;
  bodyMass: Estimate<number>;
  updatedAt: ISODateTime;
}

interface Estimate<T> {
  value: T;
  confidence: number;        // 0..1
  provenance: Provenance;
  measuredAt: ISODateTime;
  sampleSize?: number;
}

type Provenance =
  | 'lab_test'            // 1.00
  | 'field_test'          // 0.85
  | 'dfa_a1_multi'        // 0.75  — ≥3 sessions agreeing
  | 'cp_model_fit'        // 0.70  — good-quality mean-max fit
  | 'athlete_reported'    // 0.60
  | 'dfa_a1_single'       // 0.50
  | 'passive_inference'   // 0.40
  | 'population_formula'; // 0.20
```

### 2.2 HRmax derivation

Priority order, highest available wins:

1. **Supervised max test** — confidence 1.00.
2. **Highest valid observed HR in the last 12 months** — confidence 0.80.
   Validity filter (all must hold): chest-strap or validated optical source; ≥10 s
   sustained at that HR after 3-second smoothing; not preceded by a >20 bpm jump in
   <5 s (strap artefact); session duration ≥10 min; the value is not >3 SD above the
   athlete's rolling 90-day HR peak distribution.
3. **Athlete-reported** — confidence 0.60.
4. **Population formula** — confidence 0.20:
   `HRmax = 211 − 0.64 × age`
   This is the **HUNT Fitness Study** equation *(Nes et al. 2013)*, which is better
   calibrated in physically active adults than the older `220 − age`. Note for
   implementers: the original IronFlow draft labelled this formula "Tanaka"; that is
   incorrect. Tanaka et al. 2001 is `208 − 0.7 × age`. Store the formula identifier
   alongside the value.
   **Both formulas carry a standard deviation of roughly 10–12 bpm.** A zone system
   built on estimated HRmax can be a full zone wrong. This is why confidence must
   propagate and why the engine aggressively schedules a test to replace it.

### 2.3 Resting HR derivation

1. Wearable overnight minimum: rolling 30-day **5th percentile** of nightly minimum HR.
   Percentile rather than minimum, to reject artefacts. Confidence 0.85.
2. Athlete-reported morning HR (5-day median). Confidence 0.60.
3. Population default by age and sex. Confidence 0.15.

`HRR = HRmax − HRrest`. Recompute whenever either component updates. Because HRrest
drifts with fitness and season, HRR is recomputed weekly and zone boundaries in bpm
shift accordingly — this is a feature, not drift, and is shown to the athlete.

### 2.4 How confidence changes behaviour

| Combined anchor confidence | Engine behaviour |
|---|---|
| ≥ 0.75 | Full progression rates. Intensity prescribed to the boundary. Test cadence 8 weeks. |
| 0.50 – 0.74 | Ramp cap reduced by 25%. Intensity targets shifted 3% conservative. Test cadence 6 weeks. |
| 0.30 – 0.49 | Ramp cap halved. Z5 work capped at 50% of nominal volume. Test scheduled within 14 days. |
| < 0.30 | No Z4/Z5 prescription at all. Aerobic + technique only. Test scheduled within 7 days, flagged in UI as blocking. |

This is the mechanism that makes an under-informed plan *safe* rather than merely
uncertain.

---

## 3. Zones

### 3.1 The 5-zone model (display and prescription)

Zones are always expressed to the athlete as **%HRR (Karvonen)**:

```
targetHR = HRrest + fraction × (HRmax − HRrest)
```

**Case A — LT1 and LT2 known (preferred).** Boundaries are pinned to physiology and
then back-computed into %HRR for display:

| Zone | Name | Lower bound | Upper bound |
|---|---|---|---|
| Z1 | Recovery | 0 | HR@LT1 − 0.08·HRR |
| Z2 | Endurance | HR@LT1 − 0.08·HRR | HR@LT1 |
| Z3 | Tempo | HR@LT1 | HR@LT1 + 0.5·(HR@LT2 − HR@LT1) |
| Z4 | Threshold | midpoint | HR@LT2 |
| Z5 | VO₂max | HR@LT2 | HRmax |

The 0.08·HRR width of Z2 is a presentation choice, not a physiological claim: it gives
the athlete a usable "top of easy" band immediately below LT1. Document it as such.

**Case B — thresholds unknown (fallback).** Population %HRR bands:

| Zone | %HRR |
|---|---|
| Z1 | 50–60% |
| Z2 | 60–70% |
| Z3 | 70–80% |
| Z4 | 80–89% |
| Z5 | ≥90% |

These are conventional Karvonen bands and are explicitly a placeholder. When the engine
is in Case B, the UI must say so, and §2.4 confidence rules apply.

**Zone storage.** Every boundary is persisted as `{ bpm, pctHRR, pctHRmax }` plus the
anchor mode (`threshold_anchored` | `hrr_fallback`). Never recompute a displayed zone
from a percentage at render time; render from stored bpm.

### 3.2 Pace and power zones

Same principle, anchored to LT1 and LT2 expressed in pace/power, with critical
speed/power as the LT2 proxy where a direct estimate is unavailable.

**Fix the original spec's error:** pace zones must be defined in **speed** terms
(fraction of threshold speed), not as "percent of threshold pace per km", which inverts
the direction and is ambiguous. Store internally as m/s; convert for display only.

| Zone | Fraction of speed at LT2 (run) | Fraction of CP (bike) |
|---|---|---|
| Z1 | < 0.78 | < 0.55 |
| Z2 | 0.78 – 0.87 | 0.55 – 0.75 |
| Z3 | 0.87 – 0.94 | 0.75 – 0.90 |
| Z4 | 0.94 – 1.00 | 0.90 – 1.02 |
| Z5 | > 1.00 | > 1.02 |

Running pace zones must be applied to **grade-adjusted pace**, not raw pace, or every
hilly session misclassifies. Use a published grade-cost model (Minetti et al. 2002)
rather than an ad-hoc adjustment.

### 3.3 The 3-zone roll-up (accounting only)

Intensity distribution is a three-zone concept: below LT1, between LT1 and LT2, above
LT2. It cannot be expressed meaningfully in five zones, and every distribution study in
the literature uses three. So the engine maintains a roll-up used **only** for
distribution accounting and never shown as a prescription target:

```
S1 (low)      = Z1 + Z2      // below LT1
S2 (moderate) = Z3 + Z4      // between LT1 and LT2
S3 (high)     = Z5           // above LT2
```

### 3.4 Session classification — both methods, always

Distribution numbers are extremely sensitive to how a session is classified. The same
week of training looks polarised under session-goal classification and pyramidal under
time-in-zone classification. *(Seiler, discussed in Casado 2026.)* The engine therefore
computes **both** and displays both:

- **Session-goal classification (primary).** The whole session is assigned to the S-zone
  of its highest-intensity *purposeful* block. A 90-minute easy run with 6×20 s strides
  is S1. A 60-minute run with 5×4 min at LT2 is S3. This is how coaches and most
  literature classify.
- **Time-in-zone classification (secondary).** Second-by-second stream time allocated to
  S1/S2/S3.

Distribution *targets* in §4 are expressed against session-goal classification. Time-in-
zone is reported as a drift check: if S2 time-in-zone exceeds 25% of weekly time while
session-goal says the week was polarised, the athlete's easy sessions are creeping up
and the engine flags it. This "moderate drift" is the most common self-coached failure
mode.

---

## 4. Intensity distribution policy

### 4.1 What the evidence supports

Polarised and pyramidal distributions both consistently outperform threshold-dominant
training in trained athletes; the difference *between* polarised and pyramidal is small
and depends on athlete level and phase. There is reasonable evidence that sequencing
matters more than choosing a side: a pyramidal block followed by a polarised block
produced the largest improvements in VO₂max, threshold velocities and 5 km performance
in well-trained runners *(Filipas et al. 2022)*. The network meta-analysis of individual
participant data suggests polarised has a slight edge in elite athletes and pyramidal in
recreational athletes *(Rosenblat et al. 2025)*; a separate systematic review with
meta-analysis found no consistent superiority of polarised over other distributions
across the pooled literature *(Silva Oliveira et al. 2024, Sports Med 54:2071–2095)*, and
a scoping review reached the same equivocal conclusion *(Rivera-Köfler et al. 2024/2025,
J Strength Cond Res)*. Below roughly 8 h/week the choice matters much less than
consistency.

**Triathlon-specific evidence (added r2 — r1 argued the long-course case from
first principles).** Two findings now support the asymmetry in §4.2 directly rather than
by analogy from running:

- In recreational triathletes preparing for a half-Ironman, athletes training with a
  **pyramidal** distribution (≈78/19/3) outperformed those training polarised
  (≈85/4/11), and time accumulated in zone 2 was the variable associated with better race
  performance *(Sellés-Pérez et al. 2019, J Sports Sci Med)*. This is the closest direct
  evidence available for the long-course peak decision below.
- A world-class male triathlete's full 43-week Olympic-distance macrocycle ran at
  ≈82/7/11 overall, with a **pyramidal shape early in the periodisation shifting to
  polarised toward the end** *(Cejuela & Sellés-Pérez 2022, Front Physiol 13:835705)* —
  the same sequencing the engine implements, observed in the target sport.

**Decision:** phase-dependent distribution, pyramidal early, polarised late, modulated
by event duration. Unchanged from r1; now better evidenced.

### 4.2 Targets by phase (session-goal classification, % of weekly sessions)

| Phase | S1 | S2 | S3 | Shape |
|---|---|---|---|---|
| Base | 80 | 15 | 5 | Pyramidal |
| Build (short course: sprint/Olympic/5–10 k) | 78 | 12 | 10 | Transitional |
| Build (long course: 70.3/IM/marathon) | 78 | 17 | 5 | Pyramidal |
| Peak (short course) | 78 | 6 | 16 | Polarised |
| Peak (long course) | 75 | 20 | 5 | Race-specific pyramidal |
| Taper | 82 | 10 | 8 | Reduced volume, intensity retained |
| Recovery week | 92 | 8 | 0 | — |

Note the deliberate asymmetry: long-course peaking is **not** polarised. An Ironman is
raced in S2 territory; the peak phase must rehearse it. Polarising a long-course peak is
a common and expensive mistake.

**Tolerance:** ±7 percentage points on S1, ±5 on S2 and S3, measured over a rolling
3-week window rather than per week (weekly measurement is too noisy and drives
over-correction).

### 4.3 Enforcement

Distribution is a **target, not a constraint**. The planner optimises toward it when
constructing a week but never rejects a session for violating it. If the rolling 3-week
distribution is out of tolerance, the next week's session mix is nudged, at most one
session reclassified per week.

---

## 5. Load model

### 5.1 Three parallel metrics

| Metric | Formula | Available when | Primary for |
|---|---|---|---|
| **External load** (sport-specific TSS) | see below | power meter (bike), GPS+pace (run), distance+CSS (swim) | Progression planning |
| **Internal load** (zone-weighted TRIMP) | Σ(minutes in zone × zone weight) | HR present | Cross-sport comparison |
| **Perceived load** (sRPE) | RPE(0–10, CR10) × duration(min) | always, if athlete logs | Fallback and cross-check *(Foster et al. 2001)* |

**Bike (power):** `TSS = (duration_s × NP × IF) / (FTP × 3600) × 100`, where the
threshold anchor is **critical power**, not a 20-minute test scaled by 0.95.
*Correcting the original spec:* if a 20-minute test is used at all, it must use **average**
power, not normalised power (NP of a steady 20-minute effort is meaningless and inflates
the estimate). Prefer a CP fit (§6.3).

**Run (pace):** `rTSS = (duration_s × IF²) / 3600 × 100`, with
`IF = grade-adjusted speed / speed at LT2`.

**Swim:** `sTSS = (duration_s × IF³) / 3600 × 100`, with `IF = CSS speed / actual speed`.
The cubic exponent reflects that swim power scales roughly with the cube of velocity.

**TRIMP zone weights** (Lucia-style, applied to the 3-zone roll-up):
S1 = 1, S2 = 2, S3 = 3. Deliberately simple; the zone-weighted form is more robust
across athletes than exponential Banister TRIMP, which requires a sex-specific constant
and is sensitive to HRmax error.

**Reconciliation.** When two metrics are available for a session, store both and compute
`loadDisagreement = |z(external) − z(internal)|` on the athlete's own rolling
distribution. Persistent disagreement above 1.5 SD is itself a signal — usually heat,
illness, or a stale threshold — and is surfaced, not silently averaged.

### 5.2 Fitness / fatigue tracking

Retain the exponentially-weighted model for display and trend:

```
CTL_t = CTL_{t−1} + (load_t − CTL_{t−1}) × (1 − e^(−1/42))
ATL_t = ATL_{t−1} + (load_t − ATL_{t−1}) × (1 − e^(−1/7))
TSB_t = CTL_{t−1} − ATL_{t−1}
```

Maintain **per-sport CTL in addition to combined CTL**. A triathlete whose combined CTL
is flat while run CTL collapses and bike CTL climbs is not in a steady state, and the
combined number hides it.

**Treat TSB as a weak signal.** It is displayed and used as one input among several; it
never on its own triggers a plan change.

### 5.3 Progression guardrails — the actual safety system

The engine does **not** use the acute:chronic workload ratio. ACWR has documented
conceptual and statistical problems: the ratio is unstable when chronic load is low,
the 7:28 window choice is arbitrary, and randomised chronic loads have been shown to
perform comparably in injury models *(Impellizzeri et al. 2020a, 2020b, 2021)*. Building
plan safety on it would be building on a metric its own originators' critics have asked
the field to retire.

Instead, hard guardrails, checked at every plan write:

| Guardrail | Value | Notes |
|---|---|---|
| G1 Weekly load ramp | ≤ +8% vs 3-week rolling mean | ≤ +5% if anchor confidence < 0.5; ≤ +4% for athletes with <1 year structured training |
| G2 Longest single session growth | ≤ +10% duration or +15 min, whichever is smaller, per sport per week | The classic long-run injury vector |
| G3 Loading cycle | 3 loading weeks : 1 recovery week default; 2:1 if age > 45, or history of under-completion, or readiness flags in 2 of last 4 weeks | |
| G4 Recovery week volume | 55–70% of preceding week's load | Intensity retained but volume cut; not a rest week |
| G5 Consecutive hard days | ≤ 2, and never 3 across sports | Brick counts as one hard day |
| G6 Weekly S3 volume | ≤ 10% of weekly duration in any week; ≤ 8% in Base | |
| G7 Monotony | Weekly mean daily load ÷ SD of daily load ≤ 2.0 | *(Foster 1998)* — flat, samey weeks are a known overreaching signal |
| G8 Strain | Weekly load × monotony, flagged when >1.5× the athlete's 12-week rolling mean | |
| G9 Post-race | Minimum recovery days = race duration in hours, rounded up, min 2, before any S3 session | |
| G10 Absolute weekly cap | Athlete-declared max hours, never exceeded regardless of plan logic | |

**G1–G10 are checked in `plan/invariants.ts` and no plan is ever persisted that violates
one.** If the planner cannot satisfy them, it reduces load until it can and logs the
reason. This is the single most important safety property of the system.

---

## 6. Threshold detection

This is IronFlow's differentiating capability: getting real LT1 and LT2 values without a
lab, and knowing how much to trust them.

### 6.1 DFA-a1 (primary, HR-based, no test required)

The short-term scaling exponent α1 of detrended fluctuation analysis of RR intervals
declines monotonically with exercise intensity. It crosses **0.75 at the aerobic
threshold (LT1/VT1)** and **0.50 at the anaerobic threshold (LT2/VT2)**
*(Rogers et al. 2021a, 2021b; Gronwald & Hoos 2020; validated in elite triathletes,
Rogers et al. 2022)*.

**Requirements:**
- RR-interval data (not just averaged HR). This means a chest strap that records
  beat-to-beat intervals — a Polar H10-class device. Optical wrist HR is **not**
  sufficient and must be rejected by the ingest filter.
- Artefact correction before computation. Reject windows with >5% corrected beats.
- Rolling 2-minute windows, computed every 30 s, with the athlete at reasonably steady
  intensity within the window.

**Detection procedure:**
1. Filter to windows where external intensity (power or GAP speed) has SD < 5% of mean.
2. Fit α1 against external intensity across the session.
3. Read off intensity at α1 = 0.75 and α1 = 0.50 by interpolation.
4. Accept only if the session covers a range spanning the crossing point with ≥4 minutes
   of continuously declining α1 through it.
5. Emit `dfa_a1_single` (confidence 0.50).

**Aggregation to `dfa_a1_multi` (confidence 0.75):** require ≥3 accepted single estimates
within a 21-day window whose HR values span ≤6 bpm. Report the median.

**Honesty requirement in the UI.** Agreement between HRV-derived thresholds and
gas-exchange/lactate thresholds is good *on average* — mean bias around 1 bpm against
VT1 — but the limits of agreement for an individual single test span roughly ±11–13 bpm
*(Kaufmann et al. 2023, systematic review, 27 studies)*. That is a whole zone. **Never
present a single-session DFA-a1 threshold as definitive.** Require aggregation, show the
spread, and defer to field tests where they exist.

**Store the threshold in power/pace, not in heart rate (changed in r2).** This is the
single most useful implementation detail in the current reliability literature and r1
missed it. Test–retest reliability of DFA-a1 thresholds is materially better when the
threshold is expressed as **power output** than as heart rate: ICC 0.87 (HRVT1) and 0.97
(HRVT2) in power, against typical errors of 8.8 and 4.1 bpm in HR *(Sempere-Ruiz et al.
2024, Front Physiol 15:1329360)*. A larger sample reported ICC 0.76–0.86 with typical
error of roughly **6 bpm at threshold 1 and 8 bpm at threshold 2** *(Sheoran et al. 2024,
J Sports Sci 42:2012–2020)*.

**Engine rules that follow:**

1. The canonical stored value for a DFA-a1 threshold is **power (bike) or grade-adjusted
   speed (run)**. The HR value is derived for display and carries its own, lower,
   confidence.
2. Aggregation tolerance for `dfa_a1_multi` is checked against the power/pace value, not
   the ±6 bpm HR window r1 specified — that window is roughly one typical error wide and
   would reject valid agreement as often as it caught noise.
3. **Sex and cardiorespiratory fitness moderate agreement** with criterion thresholds
   *(Sheoran et al. 2024)*. Do not report a single population-level accuracy figure in
   the UI.
4. DFA-a1 never overrides a field test within its validity window, at any confidence.

**The method is actively disputed — do not present it as settled.** Cassirame et al.
(2025, Eur J Appl Physiol 125:523–533) question the use of DFA-a1 and HRV thresholds for
intensity monitoring generally; Gronwald and colleagues have published a direct
methodological rebuttal, and other recent work identifies signal-to-noise ratio and
movement artefact as major influences on agreement *(Gronwald et al. 2024; van Rassel et
al. 2025)*. The engine's position: DFA-a1 is a **useful passive prior that schedules a
test**, not a replacement for one. Its confidence ceiling (0.75) already encodes this and
must not be raised.

### 6.2 Field tests (secondary, higher confidence)

Scheduled by the engine (§12), confidence 0.85.

| Sport | Test | Yields |
|---|---|---|
| Run | 30-min TT, HR averaged over final 20 min | LTHR, threshold pace |
| Run | 3-min all-out (track) | Critical speed, D′ |
| Bike | CP protocol: 12-min + 3-min efforts ≥30 min apart, or 3-min all-out | CP, W′ |
| Bike | 20-min TT (fallback) | LT2 ≈ 0.95 × **average** power — flagged as low-quality |
| Swim | CSS: 400 m and 200 m TT | CSS = (400−200)/(t400−t200) |
| All | Talk-test / LT1 protocol: progressive 4×8 min steps | LT1 corroboration |

### 6.3 Critical power / critical speed model fitting (passive, no test)

Fit the 2-parameter hyperbolic model to mean-maximal efforts drawn from ordinary
training:

```
t = W′ / (P − CP)          equivalently   P = W′/t + CP
```

- Use mean-max values at durations spanning **2–15 minutes** (bike) and **3–20 minutes**
  (run). Efforts shorter than 2 min inflate CP; longer than ~20 min violate the model.
- Require ≥3 points from ≥2 distinct sessions within a 42-day window, each within 95% of
  the athlete's all-time mean-max at that duration (i.e. genuinely maximal).
- Report goodness of fit; reject if R² < 0.95 or if W′ falls outside physiological
  bounds (bike: 5–35 kJ).
- CP is the heavy/severe boundary and is a good, though not identical, proxy for LT2.
  Label it as `criticalIntensity`, distinct from a measured `lt2`. **r2 nuance:** r1 told
  the UI to say CP "sits slightly above MLSS". That is the conventional reading, but
  it is contested — steady-state VO₂ has been demonstrated above MLSS, with the argument
  that **critical speed better represents the true maximal metabolic steady state** in
  well-trained runners *(Nixon et al. 2021, Eur J Appl Physiol 121:3133–3144;
  Jones et al. 2019)*. Say "CP and MLSS are close but not interchangeable, and which sits
  higher is unsettled" rather than asserting a direction.
- Confidence `cp_model_fit` = 0.70, scaled down toward 0.5 as R² approaches the
  rejection threshold.

**This passive approach is itself evidenced (citation missing in r1).** Deriving critical
speed from ordinary training data rather than a dedicated test is validated: critical
speed can be calculated from raw training files in recreational marathon runners
*(Smyth & Muniz-Pumares 2020, Med Sci Sports Exerc 52:2637–2645)*, and remote,
unsupervised determination of critical speed and critical power in recreational runners
agrees acceptably with laboratory values *(Hunter et al. 2023, Int J Sports Physiol
Perform 18:1449–1456)*. Field CP in cycling also agrees well with laboratory CP
*(Karsten et al. 2013)*. §6.3 is the engine's best-supported no-test anchor and should be
preferred over DFA-a1 wherever power or GPS data allow it.

**W′ balance.** Where CP and W′ exist, compute W′ balance during severe-intensity
sessions and use it to size intervals: an interval set should deplete 60–80% of W′ by
the final repetition, not 100% (which produces failure) and not 30% (which produces an
insufficient stimulus).

### 6.4 Passive inference (fallback, confidence 0.40)

When nothing better exists: regress HR against grade-adjusted speed/power across all
steady sessions in the last 60 days, identify the inflection in the HR–intensity
relationship, and treat it as an LT1 candidate. Weak, but better than a formula, and it
gets replaced as soon as a real estimate arrives.

---

## 7. Session prescription

### 7.1 Session template model

```ts
interface SessionTemplate {
  id: string;
  sport: Sport;
  goalZone: 'S1' | 'S2' | 'S3';
  purpose: SessionPurpose;    // 'aerobic_volume' | 'threshold' | 'vo2max' |
                              // 'race_specific' | 'durability' | 'technique' |
                              // 'recovery' | 'brick' | 'strength' | 'heat_adaptation'
  minDurationMin: number;
  maxDurationMin: number;
  requires: AnchorRequirement[];   // which anchors must exist to render this
  render(model: AthleteModel, target: SessionTarget): WorkoutStructure;
}
```

Templates are parameterised, not hardcoded. `render()` produces concrete targets in the
athlete's own units, in every modality available (HR band, pace band, power band), so
the same workout works whether they have a power meter or not.

### 7.2 Interval design — sport-specific, and the sports differ

This is a case where the evidence genuinely diverges by sport and the engine must not
apply one rule to both.

**Cycling VO₂max — short intervals work well.** The 30/15 format (30 s hard, 15 s easy,
typically 3 sets of 13 repetitions with 3 min between sets) accumulates substantial time
above 90% VO₂max at a higher mean power than 4–5 min intervals, and has produced
superior adaptations in trained cyclists in several trials *(Rønnestad & Hansen 2013;
Rønnestad et al. 2015, 2020)*. Direct acute confirmation in elite cyclists: effort-matched
30/15 work produced **14% higher mean power** (421 vs 371 W) and substantially longer time
≥90% VO₂max (≈844 s vs ≈589 s) than 5-minute intervals, without a higher RPE
*(Almquist et al. 2020, Scand J Med Sci Sports 30:1140–1150)*.

**Running VO₂max — long intervals work better.** Applying the same logic to running does
not transfer. Highly-trained runners accumulated substantially *less* time above 90%
VO₂max with 24×30 s than with 4×3 min (≈201 s vs ≈328 s), despite the short intervals
being run at higher intensity *(Fleckenstein et al. 2025, Front Sports Act Living
6:1507957)*. Time above 90% HRmax was higher in the short-interval condition, which is
exactly why HR is a poor proxy here.

**Note the shape of this evidence.** Almquist and Fleckenstein used the same outcome
measure and reached opposite conclusions in different sports. That is not a contradiction
to be resolved by picking a winner — it is the justification for the sport-specific table
below. An engine that applied one interval rule across all three disciplines would be
wrong in at least one of them.

**Engine rule:**

| Sport | VO₂max session default | Alternate |
|---|---|---|
| Bike | 3 × 13 × (30 s / 15 s), 3 min between sets | 4–5 × 4 min at 105–115% CP |
| Run | 4–6 × 3–4 min at 95–100% vLT2-derived vVO₂max, equal recovery | 5 × 1000 m |
| Swim | 8–12 × 100 m at CSS − 3 s/100 m, 15–20 s rest | 400 m broken sets |

**Threshold sessions:** accumulate 20–45 min at or just below LT2, in blocks of 8–20 min.
For long-course athletes, bias toward *sub*-threshold volume (upper Z3 / low Z4) with
longer blocks and more total time, rather than fewer harder efforts.

### 7.2b Sub-threshold volume and session splitting (new in r2)

r1 had no explicit model for the most-discussed development in endurance training of the
last five years. This section adds one, with the evidence stated honestly — which means
being clear that the controlled evidence is thinner than the popular coverage implies.

**What is actually established.** The lactate-guided sub-threshold approach associated
with Norwegian distance running is characterised in the literature as high-volume
low-intensity training with a large amount of **controlled** work near, but deliberately
below, LT2 — frequently split into two shorter same-day sessions rather than one long one
*(Casado, Foster, Bakken & Tjelta 2023, Int J Environ Res Public Health 20:3782;
Kelemen et al. 2023, systematic review of 13 elite Norwegian runners)*. The descriptive
data are consistent: ≈75–80% of volume at low intensity, with two to four threshold
sessions per week, sometimes doubled in a day. These are **observational accounts of
elite practice**, not controlled trials.

**The one controlled comparison, and what it actually found.** Fourteen national-level
endurance athletes (VO₂max 69.2 ± 4.2) performed one 6 × 10 min session and, on a separate
day, two 3 × 10 min sessions 6.5 h apart — time- and intensity-matched. The **single long
session produced the larger stimulus**: a duration-dependent upward drift in HR, lactate
and RPE, higher sRPE (7.0 vs 6.0) and higher sRPE load (929 vs 743). The **split day cost
less**: less fatigue and soreness the following morning *(Talsnes, Torvik, Skovereng &
Sandbakk 2024, Front Physiol 15:1428536)*.

**Read that carefully — it does not say splitting is better.** It says splitting buys a
lower per-unit cost, which is only an advantage if the athlete uses it to accumulate
*more total* sub-threshold volume across the week. Splitting the same volume into two
sessions is a net reduction in stimulus. This is the failure mode to design against.

**Engine rules:**

| Condition | Behaviour |
|---|---|
| Weekly S2 target ≤ 60 min in a sport | Never split. One session; the drift is the point. |
| Weekly S2 target > 60 min, athlete has ≥2 trainable slots on one day ≥5 h apart, and has declared availability for doubles | Splitting *permitted*, and only alongside a **≥15% increase in total weekly S2 volume** — otherwise the plan is strictly worse |
| Split day scheduled | Both halves capped at the **sub**-threshold target (upper Z3 / low Z4), never at LT2. Running each half too fast is the documented dominant error |
| Anchor confidence < 0.60 | No splitting. The method depends on precise intensity control the engine does not have |
| Training age < 2 years, or weekly volume < 8 h | No splitting. All descriptive data come from athletes at 15–25 h/week with full recovery support |
| Long-course athlete in Peak | Prefer the **single long session** — race-day durability is built by the drift the split day avoids (§11) |

Sub-threshold volume is accounted as S2 and is bounded by the §4.2 distribution targets
and G6 exactly as any other work. This section changes *how S2 is organised*, not how much
of it there is.

**Long sessions:** progressive duration under G2. From mid-Build onward, embed
race-intensity blocks in the final third of long sessions — this is where durability is
built and tested simultaneously (§11).

**Bricks:** bike → run only, run segment 15–45 min, starting at ≤LT1 pace and progressing
to race pace in later phases. Transition target < 10 min. Never scheduled the day after
a S3 session.

### 7.3 Strength training

Included, per D10. The evidence for heavy resistance training improving running economy
is consistent and stronger than that for plyometric-dominant work (pooled effect on
running economy g ≈ −0.32 for heavy resistance vs ≈ −0.13 for plyometrics)
*(Eihara et al. 2022, Sports Med Open)*. There is also evidence that strength training
improves economy specifically *under fatigue*, which is a durability mechanism
*(Zanini et al. 2025)*.

**Two r2 corrections to expectations.**

*First: the effect is speed-dependent, and the engine can act on that.* Separating methods
by the speed at which economy was measured, heavy strength training (>80% 1RM) was most
effective at **higher** speeds (≈8.6–17.9 km/h), plyometric training at speeds **below
≈12 km/h**, and combined methods in the ≈10–14.5 km/h band. Submaximal loading
(40–79% 1RM) and isometric work did **not** improve running economy at all
*(Llanos-Lagos et al. 2024, Sports Med 54:895–932)*. Since the engine knows each athlete's
threshold pace, it should prescribe by their actual race-pace band rather than defaulting
every athlete to heavy compound work. A 4:45/km age-grouper and a 3:20/km athlete are not
in the same evidence bucket.

*Second: set expectations honestly.* A companion meta-analysis found **none** of the
strength training methods improved VO₂max, velocity at VO₂max, maximal metabolic steady
state or sprint capacity in middle- and long-distance runners *(Llanos-Lagos et al. 2024,
Sports Med 54:1801–1833)*. Strength training earns its place through **economy and
fatigue resistance**. The UI must not imply it raises threshold or aerobic capacity, and
the engine must not schedule a test expecting it to.

**Prescription — emphasis selected from the athlete's threshold running speed:**

| Athlete's speed at LT2 | Primary emphasis | Secondary |
|---|---|---|
| < 12 km/h (≈>5:00/km) | Plyometric / reactive strength | Heavy compound, lower volume |
| 12–14.5 km/h (≈4:08–5:00/km) | Combined heavy + plyometric | — |
| > 14.5 km/h (≈<4:08/km) | Heavy compound | Plyometric block |
| Unknown / confidence < 0.5 | Combined, conservative loading | Schedule the test |

| Phase | Frequency | Volume |
|---|---|---|
| Base | 2×/week | Heavy work 3–5 sets × 4–6 reps at ~80–85% 1RM; plyometric block per table above |
| Build | 2×/week | Same emphasis, volume reduced ~25% |
| Peak | 1×/week | Maintenance, heavy but very low volume |
| Taper | 1× in first taper week, none in final 10 days | |

Never prescribe the 40–79% 1RM "endurance-rep" loading that dominates consumer training
apps. On the economy outcome this product cares about, it has no demonstrated effect
*(Llanos-Lagos et al. 2024)*.

**Scheduling rules:** ≥6 h separation from a key aerobic session where possible; never
the day before a key S3 session; never on a recovery day; lower-body strength never
within 48 h of a long run.

### 7.4 Heat adaptation

Prescribed when a target race's expected wet-bulb conditions exceed the athlete's
training-environment norm by a defined margin.

The r1 draft cited this as "Bayesian meta-regression, 211 papers" without naming it. The
source is **McDonald et al. 2025, Comprehensive Physiology 15(3):1–49**, and its numbers
are worth stating properly because they are unusually actionable:

- Mean protocol characteristics across the literature: **8 ± 4 exposures, 90 ± 36 min per
  exposure, 39.1 ± 4.8 °C**.
- Pooled adaptations: end-exercise HR −17 bpm [−19, −14], end-exercise core temperature
  −0.43 °C [−0.48, −0.36], plasma volume +5.6% [3.8, 7.0], whole-body sweat rate
  +163 mL·h⁻¹ [94, 226], and **time-trial performance +3.1% [1.8, 4.5]**.
- Dose–response per *additional* exposure is small but positive (haemoglobin mass +1.9 g;
  sweat rate +9 mL·h⁻¹), and each additional 15 min per exposure lowers end-exercise core
  temperature a further −0.04 °C. Longer regimens (>15 exposures) produce more robust
  sudomotor adaptation than medium-term (8–14) or short-term (≤7) protocols
  *(also Tyler et al. 2016)*.

Passive post-exercise heat exposure (sauna) is a lower-cost alternative that does not
compromise training intensity, with supportive but weaker evidence; exercise-based
acclimation remains preferred on specificity grounds *(Périard et al. 2015)*.

**Decay and re-induction — new in r2.** r1 scheduled a heat block and then forgot about
it. Adaptation decays measurably: end-exercise HR adaptation is lost at ≈2.3% per day
without exposure and core-temperature adaptation at ≈2.6% per day, i.e. **roughly 2.5% per
decay day**. Re-induction is **8–12× faster** than decay for HR and core temperature
*(Daanen et al. 2018, Sports Med 48:409–430)*.

**Engine rules:**

```
heatAdaptationRetained(daysSinceLastExposure) = max(0, 1 − 0.025 × daysSinceLastExposure)
```

| Condition | Response |
|---|---|
| Race requires heat adaptation | Schedule 8–14 exposures ≥60 min, finishing 5–10 days before the race |
| Retained adaptation projected < 0.75 on race day | Insert **top-up exposures** — re-induction is cheap, so 1–2 short exposures restore most of the loss |
| Gap between block end and race > 10 days | Block is mis-placed; move it later rather than lengthening it |
| Athlete has ≥15 exposures available and >6 weeks | Prefer the longer regimen for sweat-rate adaptation |
| Active heat session prescribed | Reduce intensity targets; the athlete must not chase normal power in the heat, and the engine must not score them as under-performing for failing to |

Model retention explicitly and show it to the athlete. A heat block that finished three
weeks before the race has, on these numbers, largely evaporated — and an engine that
silently assumes otherwise will produce over-confident race-day pacing guidance.

### 7.5 Fuelling

Out of scope — handled by a separate product. IronFlow exposes session metadata
(duration, intensity distribution, expected energy expenditure, terrain, expected
conditions) through the contract in `05-INTEGRATIONS.md` §6 and consumes back an
optional per-session carbohydrate target for display only. The engine makes no
nutritional recommendations itself.

---

## 8. Periodisation and plan generation

### 8.1 Macrocycle construction

Backwards from the primary A race:

```
1. Determine total available weeks from today to A race.
2. Reserve taper (§8.3).
3. Reserve peak phase: 2–3 weeks.
4. Allocate remaining weeks: Base 50–60%, Build 40–50%, subject to minimums.
5. Insert recovery weeks per G3.
6. Overlay B and C races (§9).
7. Overlay heat block if required (§7.4).
8. Overlay test weeks (§12).
9. Validate every week against invariants; repair or reduce until valid.
```

**Minimum viable phase lengths.** If total weeks < 12, compress Base and skip a distinct
Peak — do not attempt a full periodisation in insufficient time; instead run a
consolidation block plus taper, and tell the athlete the plan is time-constrained.

### 8.2 Phase definitions

| Phase | Load emphasis | Distribution | Key sessions/week |
|---|---|---|---|
| Base | Volume ↑, intensity low, frequency ↑ | Pyramidal | 1 threshold, 1 long per sport |
| Build | Volume plateaus, race-specific intensity ↑ | Pyramidal → transitional | 2 quality, 1 long, bricks introduced |
| Peak | Highest combined stress, race simulation | Per §4.2 by event | 2–3 quality, race-simulation long |
| Taper | Volume ↓↓, intensity held, frequency held | §8.3 | 2 short sharp, 1 short race-pace |
| Recovery | Volume 55–70%, intensity retained | S1-dominant | 1 short quality to retain feel |

### 8.3 Taper — rewritten to match the evidence

The original spec's taper table (21 days for marathon and Ironman) is longer than the
evidence supports and reduces volume without a defined shape.

Meta-analytic findings: performance improves most with a taper that **reduces training
volume by 41–60% while maintaining training intensity and training frequency**, over a
period of up to 21 days, with the largest pooled effects in the **8–14 day** band.
Progressive (exponential) and step tapers both work. Tapers preceded by a deliberate
overload block produce larger gains than tapers alone. Reducing *frequency* tends to
hurt — maintaining it preserves movement quality and race feel.
*(Bosquet et al. 2007; Wang et al. 2023 systematic review and meta-analysis; Mujika &
Padilla 2003.)*

**Engine taper table:**

| Event | A race taper | Volume reduction (final week) | B race | C race |
|---|---|---|---|---|
| Sprint tri / 5 k | 7 days | 50% | 4 days | Train through |
| Olympic tri / 10 k | 10 days | 50% | 5 days | 2 days easy |
| Half marathon | 10 days | 50% | 6 days | 3 days easy |
| 70.3 | 14 days | 55% | 8 days | 4 days easy |
| Marathon | 14 days | 55% | 8 days | 4 days easy |
| Full Ironman | 18 days | 60% | 12 days | 6 days easy |

**Taper shape (all events):**
- Progressive volume reduction, roughly exponential: each taper week at ~65% of the
  previous week's volume, reaching the table's final-week figure.
- **Intensity is maintained.** Sessions get shorter, not easier. Every taper week retains
  at least one S3 session and one race-pace session, both at reduced volume.
- **Frequency is maintained.** Session count stays within 1 of the pre-taper week.
- Optional pre-taper overload: 1 week at +10–15% load immediately before the taper
  begins, permitted only if anchor confidence ≥ 0.6 and no readiness flags in the
  preceding 14 days.
- Final 48 h: one short activation session, full rest the day before is *not* mandatory
  and often counterproductive.

### 8.4 Microcycle (week) construction

Given a week's target load, phase, distribution target and athlete availability:

```
1. Place immovable constraints: athlete-blocked days, pool availability, long-ride day.
2. Place the long session(s) on the athlete's declared long day(s).
3. Place key quality sessions, respecting G5 (≤2 consecutive hard days) and
   ≥48 h between same-sport quality sessions.
4. Place strength per §7.3 scheduling rules.
5. Fill remaining availability with S1 aerobic volume to reach the load target.
6. Place at least one full rest day (two in recovery weeks).
7. Validate against all invariants; if invalid, drop the lowest-priority session and
   repeat from 5.
```

**Athlete availability is a hard input,** collected at onboarding (§`06-UX.md`): which
days they can train, for how long, which days they can swim, which day they can do a
long ride. A plan that ignores availability has excellent physiology and zero adherence.

---

## 9. Race calendar handling

- **A race:** drives the entire macrocycle. Multiple A races <12 weeks apart: warn, and
  treat the second as a B race for planning purposes.
- **B race:** local 5–12 day taper (see table), race, then a mandatory recovery block per
  G9, then rejoin the macrocycle. Peak CTL target is unchanged.
- **C race:** trained through. Converted into a race-pace session in the plan, with the
  surrounding two days reduced. No taper.

Multi-race resolution: sort by date; the nearest A race owns phase structure; B races
insert local peaks; C races annotate.

---

## 10. Adaptive engine

### 10.1 Readiness score (daily)

Inputs, all optional:

| Input | Weight | Processing |
|---|---|---|
| HRV (rMSSD, overnight or on-waking) | 0.40 | 7-day rolling mean vs 60-day baseline; smallest worthwhile change = 0.5 × baseline SD |
| Resting HR | 0.20 | 7-day mean vs 60-day baseline |
| Sleep duration | 0.15 | 3-day rolling vs athlete's own norm |
| Subjective wellness (1–5: fatigue, soreness, stress, mood) | 0.20 | 3-day rolling |
| Recent completion rate | 0.05 | Last 7 days |

Reweight proportionally over available inputs. If only subjective wellness exists, it
carries full weight — a plan that ignores an athlete saying they feel terrible because
no HRV data arrived is worse than no adaptation at all.

Use **rolling means against a rolling baseline with an SWC band**, never single-day
values. Single-day HRV is dominated by noise.

### 10.2 Response rules (asymmetric, downgrade-only)

| Condition | Action |
|---|---|
| Readiness within SWC band | No change |
| Readiness below SWC lower bound for 1 day AND today is S3 | Downgrade S3 → S2, duration unchanged |
| Readiness below SWC lower bound for 2 consecutive days | Today becomes S1 or rest; the week's load target reduced 10% |
| Readiness below SWC lower bound for 4+ days, or HRV >2 SD below baseline | Convert the remainder of the week to recovery-week parameters; prompt the athlete to consider illness; suppress all S3 for 5 days |
| Resting HR >7 bpm above baseline for 2 days | Same as 2-day rule; add illness prompt |
| Athlete logs illness | Immediate: no training above S1 while symptomatic. Return-to-training ladder (§10.4) |
| Readiness above SWC upper bound | **No action.** Increases only at weekly boundaries |

**Rationale for conservatism.** HRV-guided prescription outperforms fixed prescription in
meta-analysis, but the effect sizes are small-to-moderate and the methodology varies
widely between studies; the reliable finding is fewer *negative* responders rather than
dramatically better mean outcomes *(Manresa-Rocamora et al. 2021; Düking et al. 2020;
Javaloyes et al. 2019, 2020; Vesterinen et al. 2016)*. An algorithm that reduces load on
bad signals and ignores good ones captures the demonstrated benefit while being robust
to the measurement's known noise.

### 10.3 Weekly re-planning triggers

Evaluated at the week boundary:

- Rolling 3-week distribution outside tolerance → adjust next week's session mix
- Completion rate <70% for 2 weeks with no readiness flags → reduce weekly target to
  actual + 5% (the plan, not the athlete, is wrong)
- Completion rate >95% with readiness stable for 3 weeks → permit ramp at the full G1 cap
- HR at a given grade-adjusted pace falls ≥3% over 3+ weeks → schedule a test rather
  than silently upgrading thresholds (this is the correct handling of an apparent
  fitness gain: verify, don't assume)
- Anchor confidence decayed below a §2.4 tier boundary → apply that tier's behaviour
- Body mass change >3% over 4 weeks → recompute W/kg targets, flag if unexplained
- Durability index worsening (§11) → increase long-session aerobic volume, reduce S3

### 10.4 Illness and injury

- **Symptomatic illness:** no training above S1. Above-the-neck symptoms only and no
  fever: S1 permitted at ≤60% normal duration.
- **Return ladder after ≥3 days off:** for each day missed, one day of restricted return,
  capped at 10. Day 1–2 S1 only; reintroduce S2 at 50% normal volume; reintroduce S3 only
  after two consecutive days of readiness inside the SWC band.
- **Injury flag:** the athlete marks a body region and severity. The engine substitutes
  cross-training with matched internal load where possible (run → bike/aqua-jog) and
  never silently drops the load target without saying so.
- The engine does not diagnose. It says "this pattern often warrants a professional
  opinion" and stops there.

---

## 11. Durability

Durability — resistance to the deterioration of physiological capacity during prolonged
exercise — has been proposed as a fourth determinant of endurance performance alongside
VO₂max, threshold and economy, and it is precisely what determines an Ironman result
*(Maunder et al. 2021; Jones 2023; Spragg et al. 2022; Hunter et al. 2025)*. Almost no
consumer platform models it. IronFlow does.

### 11.1 Measurement

**Decoupling (primary, passive).** For any steady session ≥75 min, split the steady
portion in half and compute the internal:external ratio:

```
ratio_half = mean HR / mean external intensity      (power for bike, GAP speed for run)
decoupling = (ratio_second − ratio_first) / ratio_first × 100
```

Valid only when: intensity SD <10% within each half; no long stop; ambient conditions
recorded. Store per session.

**Durability index (derived).** For sessions with sufficient duration, estimate the
decline in intensity at LT2 after a fixed work dose (e.g. 1500–2000 kJ for the bike;
90 min for the run), by comparing the athlete's mean-max curve computed on
late-session data against the fresh curve. Report as % decline. Track the trend, not the
absolute value — protocols in the literature are not standardised and single values are
not comparable between athletes *(Hunter et al. 2025)*.

### 11.2 Use in planning

| Signal | Response |
|---|---|
| Decoupling >5% on long rides at target intensity | Increase long-session aerobic volume; check fuelling; do not add intensity |
| Decoupling improving toward <5% | Progress duration of embedded race-pace blocks |
| Durability index worsening while CTL rises | Overreaching signal — trigger a recovery week |
| Long-course athlete <10 weeks from A race with decoupling >5% | Escalate: this is the primary limiter, prioritise it over VO₂max work |

Race-day pacing guidance for long-course events is derived from the durability index, not
from fresh threshold values. An athlete whose durability index shows 8% decline should
not be told to ride at 75% of fresh FTP.

---

## 12. Field test scheduling

Tests are prescriptions, not suggestions.

| Trigger | Test scheduled |
|---|---|
| Anchor confidence below a §2.4 tier | Within that tier's deadline |
| No test in 8 weeks (confidence ≥0.75) or 6 weeks (0.5–0.74) | Next available slot |
| Phase transition | LT2 test in the primary sport |
| Apparent fitness change (§10.3) | Confirmatory test within 10 days |
| 6 weeks before A race | Full battery, all sports |

**Placement rules:** never in a recovery week's first 3 days; always ≥48 h after a hard
session; never within 10 days of a race; readiness must be inside the SWC band on the
day or the test is postponed (a test performed while fatigued produces a wrong number
that then poisons the plan for weeks — this is worse than no test).

---

## 13. Additional athlete considerations

**Menstrual cycle.** Optional symptom and cycle-phase logging. The engine **does not**
prescribe cycle-phase-based periodisation: current evidence for performance variation
across the cycle is low-quality with trivial pooled effects, and prescribing from it
would be inventing precision that does not exist *(McNulty et al. 2020)*.

**r2 re-check — the position holds, and is now better supported.** A 2025 systematic
review restricted deliberately to studies meeting high methodological standards (verified
cycle phase, hormonal confirmation) found that although 58% of studies reported a
significant phase effect on at least one outcome, **the direction and magnitude varied
between studies**, maximal and explosive strength were largely unaffected, and
heterogeneity of phases and populations prevented systematic synthesis *(Elliott-Sale
group / J Appl Physiol 139:650–667, 2025)*. Separately, current evidence shows **no
influence of cycle phase on acute strength performance or on adaptation to resistance
training** *(Colenso-Semple, D'Souza, Elliott-Sale & Phillips)*. There is still no basis
for phase-based prescription.

**Where the signal actually is: symptoms, not phase.** Qualitative synthesis of 17 studies
found cycle-related *symptoms* consistently affected training and competition, and that
athletes routinely adapt around or conceal them *(Systematic review and meta-aggregation,
J Sci Med Sport 2025)*. This is exactly what the engine already models — symptoms feed
subjective wellness in the readiness score (§10.1) and can trigger the normal
downgrade-only response rules. Keep it that way: log symptoms, act on symptoms, do not
prescribe from the calendar. The logging continues to capture phase data in the meantime
in case the evidence base changes.

**Age.** Athletes over 45 default to 2:1 loading cycles (G3) and a 24 h longer minimum
recovery between S3 sessions.

**Training age.** Athletes with <1 year of structured training get the reduced ramp cap
in G1 and no S3 work in the first 6 weeks.

**Altitude.** Detected from activity elevation. Adjust expected pace/power targets
downward and treat HR-based zones as unreliable above ~1500 m. Do not prescribe altitude
camps in v1.

---

## 14. Degradation matrix

| Missing input | Engine behaviour |
|---|---|
| No RR/HRV data | No DFA-a1 detection; rely on field tests and CP fitting; readiness weights redistribute to RHR/sleep/wellness |
| No HR at all | Zones become pace/power only; TRIMP unavailable; readiness from wellness + completion only |
| No power meter (bike) | CP from GPS speed is unreliable — do not attempt. Use HR and RPE; schedule a bike field test with HR anchoring |
| No running GPS (treadmill) | Accept athlete-entered speed; flag GAP as unavailable |
| No swim data | Prescribe swims by RPE and stroke-count targets; exclude from load totals with a visible note |
| No sleep/HRV device | Readiness = wellness + completion; require daily wellness prompt |
| No athlete availability declared | Assume 6 days, evenly distributed, and prompt persistently — adherence will be poor until this is set |
| Anchor confidence <0.30 | See §2.4: aerobic and technique work only |

---

## 15. Constants

All of these live in `physio/constants.ts` with a citation comment. Reproduced here as
the authoritative list.

```ts
// HRmax estimation — HUNT Fitness Study (Nes et al. 2013). SD ≈ 10.8 bpm.
export const HRMAX_HUNT = { intercept: 211, ageCoef: 0.64 };
// Alternative — Tanaka et al. 2001. Retained for comparison display only.
export const HRMAX_TANAKA = { intercept: 208, ageCoef: 0.70 };

// DFA-a1 thresholds — Rogers et al. 2021a (LT1), 2021b (LT2)
export const DFA_A1_LT1 = 0.75;
export const DFA_A1_LT2 = 0.50;
export const DFA_A1_MIN_SESSIONS_FOR_MULTI = 3;
export const DFA_A1_MAX_ARTEFACT_PCT = 5;
// r2: canonical storage is power/pace — reliability in PO is ICC 0.87/0.97 vs
// typical error 8.8/4.1 bpm in HR (Sempere-Ruiz et al. 2024, Front Physiol 15:1329360).
export const DFA_A1_CANONICAL_UNIT = 'power_or_pace';
// Typical error in HR at threshold 1 / threshold 2 (Sheoran et al. 2024, J Sports Sci
// 42:2012-2020). Used to size the aggregation window, NOT to claim accuracy.
export const DFA_A1_TYPICAL_ERROR_BPM = { t1: 6, t2: 8 };
// Aggregation agreement window, expressed in fraction of the power/pace value.
export const DFA_A1_MULTI_AGREEMENT_FRACTION = 0.04;
export const DFA_A1_CONFIDENCE_CEILING = 0.75;   // never raise; method is disputed

// Zone construction
export const Z2_WIDTH_BELOW_LT1_HRR = 0.08;   // presentation choice, not physiology
export const HRR_FALLBACK_BANDS = [0.50, 0.60, 0.70, 0.80, 0.90, 1.00];

// Load
export const CTL_TIME_CONSTANT_DAYS = 42;
export const ATL_TIME_CONSTANT_DAYS = 7;
export const TRIMP_ZONE_WEIGHTS = { S1: 1, S2: 2, S3: 3 };  // Lucia-style
export const SWIM_TSS_EXPONENT = 3;
export const RUN_TSS_EXPONENT = 2;

// Guardrails (§5.3)
export const RAMP_CAP_DEFAULT = 0.08;
export const RAMP_CAP_LOW_CONFIDENCE = 0.05;
export const RAMP_CAP_NOVICE = 0.04;
export const LONG_SESSION_GROWTH_PCT = 0.10;
export const LONG_SESSION_GROWTH_MAX_MIN = 15;
export const RECOVERY_WEEK_LOAD_RANGE = [0.55, 0.70];
export const MAX_CONSECUTIVE_HARD_DAYS = 2;
export const MAX_WEEKLY_S3_TIME_PCT = 0.10;
export const MAX_WEEKLY_S3_TIME_PCT_BASE = 0.08;
export const MONOTONY_CEILING = 2.0;         // Foster 1998

// Taper — Bosquet et al. 2007; Wang et al. 2023
export const TAPER_VOLUME_REDUCTION_RANGE = [0.41, 0.60];
export const TAPER_WEEKLY_DECAY = 0.65;
export const TAPER_MAINTAIN_INTENSITY = true;
export const TAPER_MAINTAIN_FREQUENCY = true;

// Readiness — SWC = 0.5 × baseline SD
export const SWC_MULTIPLIER = 0.5;
export const HRV_BASELINE_DAYS = 60;
export const HRV_ROLLING_DAYS = 7;

// Durability — Maunder et al. 2021; Hunter et al. 2025
export const DECOUPLING_TARGET_PCT = 5;
export const DECOUPLING_MIN_SESSION_MIN = 75;

// Heat — McDonald et al. 2025, Comprehensive Physiology 15(3):1-49 (211 papers)
export const HEAT_EXPOSURES_RANGE = [8, 14];
export const HEAT_EXPOSURE_MIN_MINUTES = 60;
export const HEAT_BLOCK_END_DAYS_BEFORE_RACE = [5, 10];
// r2: decay/re-induction — Daanen et al. 2018, Sports Med 48:409-430
export const HEAT_DECAY_PCT_PER_DAY = 0.025;
export const HEAT_RETENTION_TOPUP_THRESHOLD = 0.75;
export const HEAT_REINDUCTION_SPEED_MULTIPLIER = 10;   // 8-12x faster than decay
export const HEAT_LONG_REGIMEN_EXPOSURES = 15;         // >15 = more robust sudomotor adaptation

// Intervals — Rønnestad & Hansen 2013 + Almquist et al. 2020 (bike);
// Fleckenstein et al. 2025 (run). The sports genuinely diverge — see §7.2.
export const BIKE_VO2_SHORT = { work: 30, rest: 15, reps: 13, sets: 3, setRest: 180 };
export const RUN_VO2_LONG = { workMin: 3, workMax: 4, reps: [4, 6], recoveryRatio: 1.0 };

// Sub-threshold organisation (§7.2b) — Casado et al. 2023; Talsnes et al. 2024
export const SUBTHRESHOLD_SPLIT_MIN_WEEKLY_S2_MIN = 60;
export const SUBTHRESHOLD_SPLIT_MIN_GAP_HOURS = 5;
export const SUBTHRESHOLD_SPLIT_REQUIRED_VOLUME_INCREASE = 0.15;
export const SUBTHRESHOLD_SPLIT_MIN_CONFIDENCE = 0.60;
export const SUBTHRESHOLD_SPLIT_MIN_TRAINING_AGE_YEARS = 2;
export const SUBTHRESHOLD_SPLIT_MIN_WEEKLY_HOURS = 8;

// Strength emphasis by threshold running speed (km/h) —
// Llanos-Lagos et al. 2024, Sports Med 54:895-932
export const STRENGTH_SPEED_BANDS_KMH = { plyoBelow: 12.0, combinedUpper: 14.5 };
export const STRENGTH_MIN_HEAVY_LOAD_1RM = 0.80;  // 40-79% 1RM showed no economy effect

// Critical power model fitting
export const CP_FIT_DURATION_RANGE_BIKE_S = [120, 900];
export const CP_FIT_DURATION_RANGE_RUN_S = [180, 1200];
export const CP_FIT_MIN_POINTS = 3;
export const CP_FIT_MIN_R2 = 0.95;
export const W_PRIME_BOUNDS_J = [5000, 35000];
export const W_PRIME_INTERVAL_DEPLETION_TARGET = [0.60, 0.80];
```

---

## 16. What the engine deliberately does not do

Stated explicitly so a future implementer does not "helpfully" add them:

- **No ACWR.** See §5.3.
- **No injury-risk prediction.** The evidence base does not support a consumer-grade
  injury predictor, and a false sense of safety is worse than none.
- **No VO₂max number as a headline metric.** Consumer VO₂max estimates are derived from
  HR/pace regressions and are largely a restatement of threshold pace at a given HR.
  Show threshold trends instead — they are the thing that actually changed.
- **No prescriptive cycle-phase periodisation.** §13.
- **No "recovery score" presented as a single authoritative number** without showing its
  components. The athlete must be able to see that a 62 came from poor sleep rather than
  from HRV.
- **No silent threshold upgrades.** Apparent fitness gains schedule a test.
- **No cycle-phase periodisation.** §13, re-confirmed against 2025 evidence.
- **No claim that strength training raises VO₂max or threshold.** §7.3.
- **No same-volume session splitting.** §7.2b — splitting without adding volume is a net
  reduction in stimulus.

---

## 17. Evidence register — r2 revision, July 2026

Every change made in this pass, what it replaced, and why. An implementer who disagrees
with one of these should argue with the citation, not with the table.

| § | Change | Type | Source |
|---|---|---|---|
| 0.1 | Threshold anchoring justified as *larger mean gain + higher responder rate* (4.1 vs 1.8 mL·kg⁻¹·min⁻¹; 64% vs 16% above MID), **not** as reduced adaptation variability — the IPD meta-analysis found no variance difference (BF = 0.55) | **Correction** | Meyler et al. 2025, *Sports Med* 55:301–323; Meyler et al. 2023, *Exp Physiol* 108:581–594; Pacitti et al. 2025 |
| 4.1 | Added direct triathlon evidence for the pyramidal long-course peak: 70.3 athletes training pyramidally outperformed polarised, with zone-2 time the associated variable; world-class triathlete macrocycle ran pyramidal→polarised | Evidence added | Sellés-Pérez et al. 2019, *J Sports Sci Med*; Cejuela & Sellés-Pérez 2022, *Front Physiol* 13:835705; Silva Oliveira et al. 2024, *Sports Med* 54:2071–2095 |
| 6.1 | DFA-a1 thresholds now stored canonically in **power/pace**, not HR (ICC 0.87/0.97 in power vs typical error 8.8/4.1 bpm in HR); aggregation window re-specified; sex and fitness noted as moderators; method flagged as actively disputed | **Correction** | Sempere-Ruiz et al. 2024, *Front Physiol* 15:1329360; Sheoran et al. 2024, *J Sports Sci* 42:2012–2020; Cassirame et al. 2025, *EJAP* 125:523–533 + Gronwald rebuttal |
| 6.3 | Passive CP/CS fitting given the citations it lacked; "CP sits above MLSS" softened to "close, direction unsettled" | Refinement | Smyth & Muniz-Pumares 2020, *MSSE* 52:2637–2645; Hunter et al. 2023, *IJSPP* 18:1449–1456; Nixon et al. 2021, *EJAP* 121:3133–3144 |
| 7.2 | Added acute confirmation for the bike short-interval rule (14% higher power, 844 vs 589 s ≥90% VO₂max), framing the run/bike divergence as evidenced rather than asserted | Evidence added | Almquist et al. 2020, *Scand J Med Sci Sports* 30:1140–1150 |
| 7.2b | **New section.** Sub-threshold volume and same-day session splitting, with gating rules. The controlled comparison found the *single long* session gave the larger stimulus and the split day the lower cost — so splitting is only permitted alongside a volume increase | **Capability gap** | Casado, Foster, Bakken & Tjelta 2023, *IJERPH* 20:3782; Talsnes et al. 2024, *Front Physiol* 15:1428536; Kelemen et al. 2023 |
| 7.3 | Strength emphasis now selected by the athlete's threshold running speed (plyometric <12 km/h, combined 10–14.5, heavy >14.5); 40–79% 1RM loading banned; explicit statement that strength does not raise VO₂max or threshold | Refinement | Llanos-Lagos et al. 2024, *Sports Med* 54:895–932 and 54:1801–1833; Eihara et al. 2022 |
| 7.4 | Meta-regression named and its effect sizes stated; **decay/re-induction model added** (≈2.5%/day loss, re-induction 8–12× faster) with a retention function and top-up rule | Refinement + gap | McDonald et al. 2025, *Comp Physiol* 15(3):1–49; Daanen et al. 2018, *Sports Med* 48:409–430 |
| 13 | Cycle-phase position re-checked against 2025 high-methodological-standard evidence and confirmed; symptom-based handling reinforced as the evidenced route | Re-confirmed | *J Appl Physiol* 139:650–667 (2025); Colenso-Semple et al.; *J Sci Med Sport* 2025 meta-aggregation |

### 17.1 Checked and left unchanged

These r1 claims were verified against the primary source and are correct as written:
HUNT HRmax equation and the Tanaka mislabelling note (§2.2); the ACWR rejection
(§5.3, Impellizzeri); Foster monotony (§5.3); the taper volume-reduction band and
intensity/frequency maintenance (§8.3, Bosquet 2007 / Wang 2023); Fleckenstein's run
interval numbers (§7.2, reproduced exactly); the durability framing (§11, Maunder,
Jones, Hunter); the HRV-guided downgrade-only asymmetry (§10.2).

### 17.2 Known remaining gaps

Stated so they are not mistaken for oversights:

- **Sleep is modelled only as a readiness input**, never as a prescribable intervention.
  The sleep-extension literature in athletes is small and mostly in team sports; the
  engine has no defensible dose–response to implement. Revisit.
- **Swimming is the thinnest-evidenced sport in this document.** CSS is well established,
  but interval prescription in §7.2 rests on far weaker ground than the bike and run
  rules. Treat swim prescriptions as lower-confidence by construction.
- **The sub-threshold evidence base (§7.2b) is descriptive at elite level plus one acute
  crossover trial.** No training intervention study has yet compared split versus single
  organisation over a full block. The gating rules are deliberately conservative for that
  reason and should be revisited when one exists.
- **No triathlon-specific durability or brick-running trials** underpin §7.2's brick
  rules; they remain reasoned from the durability literature rather than measured.
