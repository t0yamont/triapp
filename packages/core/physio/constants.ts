/**
 * physio/constants.ts — the single source of truth for every physiological constant.
 *
 * RULES (CLAUDE.md §Hard rules 1–2, 00-AGENT-BRIEF.md "No invented constants"):
 *   - Never hardcode a physiological constant anywhere else in the codebase.
 *   - Every value carries a citation comment pointing at spec/REFERENCES.md.
 *   - Do not invent, round, or "simplify" a value. If a constant seems wrong, flag it in
 *     DECISIONS.md and stop — do not change it silently.
 *
 * The authoritative list is 03-ALGORITHM.md §15; this file reproduces it verbatim.
 */

// ── HRmax estimation ─────────────────────────────────────────────────────────
// HUNT Fitness Study (Nes et al. 2013). SD ≈ 10.8 bpm. Better calibrated in physically
// active adults than the older 220 − age. REFERENCES.md §"Intensity prescription and
// anchoring". 03-ALGORITHM.md §2.2.
export const HRMAX_HUNT = { intercept: 211, ageCoef: 0.64 } as const;
// Alternative — Tanaka et al. 2001 (208 − 0.7 × age). Retained for comparison display
// ONLY; never used as the working value. The original TriFlow draft mislabelled the
// HUNT formula as "Tanaka"; that was incorrect (03-ALGORITHM.md §2.2).
export const HRMAX_TANAKA = { intercept: 208, ageCoef: 0.7 } as const;

// ── DFA-a1 threshold detection ───────────────────────────────────────────────
// Short-term scaling exponent α1 crosses 0.75 at LT1/VT1 and 0.50 at LT2/VT2.
// Rogers et al. 2021a (LT1), 2021b (LT2). REFERENCES.md §"Threshold detection from HRV".
// 03-ALGORITHM.md §6.1.
export const DFA_A1_LT1 = 0.75;
export const DFA_A1_LT2 = 0.5;
export const DFA_A1_MIN_SESSIONS_FOR_MULTI = 3;
export const DFA_A1_MAX_ARTEFACT_PCT = 5;

// ── Zone construction ────────────────────────────────────────────────────────
// 0.08·HRR width of Z2 below LT1 is a PRESENTATION choice, not a physiological claim
// (03-ALGORITHM.md §3.1). Karvonen HRR method: REFERENCES.md §"Intensity prescription".
export const Z2_WIDTH_BELOW_LT1_HRR = 0.08;
// Conventional Karvonen fallback bands, explicitly a placeholder (Case B, §3.1).
export const HRR_FALLBACK_BANDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const;

// ── Load ─────────────────────────────────────────────────────────────────────
// EWMA time constants for the fitness/fatigue model (03-ALGORITHM.md §5.2).
export const CTL_TIME_CONSTANT_DAYS = 42;
export const ATL_TIME_CONSTANT_DAYS = 7;
// Lucia-style zone-weighted TRIMP on the 3-zone roll-up (§5.1). Deliberately simple and
// more robust across athletes than exponential Banister TRIMP.
export const TRIMP_ZONE_WEIGHTS = { S1: 1, S2: 2, S3: 3 } as const;
// Sport-specific external-load exponents (§5.1). Swim cubic reflects power ∝ velocity³.
export const SWIM_TSS_EXPONENT = 3;
export const RUN_TSS_EXPONENT = 2;

// ── Guardrails (§5.3) — the actual safety system ─────────────────────────────
export const RAMP_CAP_DEFAULT = 0.08;
export const RAMP_CAP_LOW_CONFIDENCE = 0.05;
export const RAMP_CAP_NOVICE = 0.04;
export const LONG_SESSION_GROWTH_PCT = 0.1;
export const LONG_SESSION_GROWTH_MAX_MIN = 15;
export const RECOVERY_WEEK_LOAD_RANGE = [0.55, 0.7] as const;
export const MAX_CONSECUTIVE_HARD_DAYS = 2;
export const MAX_WEEKLY_S3_TIME_PCT = 0.1;
export const MAX_WEEKLY_S3_TIME_PCT_BASE = 0.08;
export const MONOTONY_CEILING = 2.0; // Foster 1998. REFERENCES.md §"Load model".
// G8 strain = weekly load × monotony, flagged above this multiple of the 12-week rolling
// mean (Foster 1998). REFERENCES.md §"Load model".
export const STRAIN_FLAG_MULTIPLE = 1.5;
export const STRAIN_ROLLING_WEEKS = 12;
// G9 post-race: recovery days before any S3 = race hours rounded up, never fewer than this.
export const POST_RACE_MIN_RECOVERY_DAYS = 2;

// ── Plan window & entry requirements (onboarding) ────────────────────────────
// ⚠️ COACHING CONVENTION, NOT PEER-REVIEWED PHYSIOLOGY — pending sign-off, see
// docs/algorithm-review-2026-07.md §2.1/§2.2 and §5. These are the only numbers in this file
// without a citation to REFERENCES.md, and they are deliberately marked so.
//
// `recommended` = a full run-up (a standard 70.3 build is ~20 weeks: 8 base / 6 build / 6 peak).
// `minimum` = below this the engine advises a later race rather than compressing further.
// Cross-checked against coaching-authority guidance (MyProCoach, Campfire Endurance, IRONMAN's
// own 70.3 readiness content, Triathlete) — docs/algorithm-review-2026-07.md §research update.
// '10k' recommended and olympic_tri minimum were revised from the first pass to sit inside the
// cited ranges (10k: 8–10 wk typical, not 12; olympic: 12–16 wk typical, so a 10-week floor).
export const PLAN_WEEKS_BY_EVENT = {
  ironman: { recommended: 24, minimum: 16 },
  '70.3': { recommended: 20, minimum: 12 },
  marathon: { recommended: 16, minimum: 12 },
  olympic_tri: { recommended: 16, minimum: 12 },
  half_marathon: { recommended: 12, minimum: 8 },
  '10k': { recommended: 10, minimum: 8 },
  sprint_tri: { recommended: 8, minimum: 6 },
  '5k': { recommended: 8, minimum: 6 },
} as const;

// What an athlete should be able to cover continuously before starting the event's plan proper.
// Same caveat: convention, not physiology. The long-course figures were revised from the first
// pass: they were extrapolated proportionally from Olympic distance, which overshot badly.
// Cited base-phase entry points for a 70.3 (10 min swim / 45 min bike / 20 min run, building to
// 25 min / 2 h / 8 km over the base phase) show the entry bar for long-course is NOT
// proportionally higher than short-course — the extra distance is what the long plan itself
// builds. See docs/algorithm-review-2026-07.md §research update.
export const EVENT_ENTRY_REQUIREMENTS: Record<
  keyof typeof TAPER_TABLE,
  { swimM?: number; rideMin?: number; runMin?: number }
> = {
  ironman: { swimM: 500, rideMin: 60, runMin: 25 },
  '70.3': { swimM: 400, rideMin: 45, runMin: 20 },
  olympic_tri: { swimM: 800, rideMin: 60, runMin: 30 },
  sprint_tri: { swimM: 400, rideMin: 20, runMin: 10 },
  marathon: { runMin: 75 },
  half_marathon: { runMin: 50 },
  '10k': { runMin: 30 },
  '5k': { runMin: 20 },
};

// ── Race calendar (§9) ───────────────────────────────────────────────────────
// Two A races closer than this can't both be peaked for; the second is planned as a B race.
export const A_RACE_MIN_SEPARATION_WEEKS = 12;
export const C_RACE_REDUCED_SURROUNDING_DAYS = 2; // trained through, days either side eased

// ── Taper — Bosquet et al. 2007; Wang et al. 2023 (§8.3) ─────────────────────
export const TAPER_VOLUME_REDUCTION_RANGE = [0.41, 0.6] as const;
export const TAPER_WEEKLY_DECAY = 0.65;
export const TAPER_MAINTAIN_INTENSITY = true;
export const TAPER_MAINTAIN_FREQUENCY = true;

// ── Readiness — SWC = 0.5 × baseline SD (§10.1) ──────────────────────────────
export const SWC_MULTIPLIER = 0.5;
export const HRV_BASELINE_DAYS = 60;
export const HRV_ROLLING_DAYS = 7;
/** Resting HR: "7-day mean vs 60-day baseline" (§10.1 table) — same windows as HRV. */
export const RHR_ROLLING_DAYS = 7;
export const RHR_BASELINE_DAYS = 60;
/** Sleep duration and subjective wellness: "3-day rolling" (§10.1 table). */
export const SLEEP_ROLLING_DAYS = 3;
export const WELLNESS_ROLLING_DAYS = 3;
/**
 * §10.1 compares sleep and wellness to "the athlete's own norm" but never says over what
 * window. Set to the same 60 days the spec does define for HRV/RHR baselines rather than
 * inventing a third number — see `D-WELLNESS-NORM` in DECISIONS.md; flagged for sign-off.
 */
export const SLEEP_BASELINE_DAYS = 60;
export const WELLNESS_BASELINE_DAYS = 60;
/**
 * Fewest days in a window before it is trusted. A mean of one day is a single-day value,
 * which §10.1 explicitly forbids ("never single-day values"), and an SD needs two points.
 * A metric with less history than this is reported as absent, and `readinessScore`
 * reweights over what remains rather than scoring a number it cannot stand behind.
 */
export const READINESS_MIN_ROLLING_SAMPLES = 2;
export const READINESS_MIN_BASELINE_SAMPLES = 7;

// ── Readiness response — asymmetric, downgrade-only (§10.2) ───────────────────
// Thresholds transcribed from spec/03-ALGORITHM.md §10.2. REFERENCES.md §"Readiness /
// HRV-guided training" (Manresa-Rocamora et al. 2021; Vesterinen et al. 2016; Javaloyes
// et al. 2019/2020): reduce on bad signals, never increase — the demonstrated benefit is
// fewer negative responders, so the response is deliberately conservative.
export const READINESS_BELOW_DAYS_S3_DOWNGRADE = 1; // 1 below-day + S3 today → S3→S2
export const READINESS_BELOW_DAYS_REDUCE = 2; // 2 consecutive below-days → easy + trim week
export const READINESS_BELOW_DAYS_RECOVERY = 4; // 4+ below-days → convert week to recovery
export const READINESS_HRV_CRASH_SD = 2; // HRV >2 SD below baseline → recovery (crash)
export const READINESS_RHR_ELEVATED_BPM = 7; // RHR >7 bpm above baseline is "elevated"
export const READINESS_RHR_ELEVATED_DAYS = 2; // ...for 2 days → same as the 2-day rule
export const READINESS_WEEK_REDUCTION_FRAC = 0.1; // 2-day rule trims the week target 10%
export const READINESS_S3_SUPPRESSION_DAYS = 5; // recovery conversion suppresses S3 for 5 days
// Recovery-week load target = midpoint of the G4 55–70% band; the mid-week conversion
// reduces the week to this fraction of its planned load.
export const RECOVERY_WEEK_LOAD_FRACTION = 0.62;

// ── Illness & return-to-training ladder (§10.4) ──────────────────────────────
// Protocol parameters from spec/03-ALGORITHM.md §10.4. REFERENCES.md §"Readiness /
// return to training": conservative reintroduction after illness or a training gap.
export const ILLNESS_ABOVE_NECK_VOLUME_FRAC = 0.6; // above-neck, no fever → S1 at ≤60%
export const RETURN_LADDER_MIN_DAYS_OFF = 3; // a ladder is triggered after ≥3 days off
export const RETURN_LADDER_MAX_DAYS = 10; // one restricted day per day missed, capped at 10
export const RETURN_LADDER_S1_ONLY_DAYS = 2; // days 1–2 of the ladder are S1 only
export const RETURN_S2_VOLUME_FRAC = 0.5; // reintroduce S2 at 50% normal volume
export const RETURN_S3_CLEARANCE_INBAND_DAYS = 2; // S3 only after 2 consecutive in-band days

// ── Field test scheduling (§12) ──────────────────────────────────────────────
// Placement/protocol parameters from spec/03-ALGORITHM.md §12. Scheduling rules, not
// physiological constants, but transcribed here so the numbers live in one cited place.
export const FIELD_TEST_MIN_HOURS_AFTER_HARD = 48; // always ≥48 h after a hard session
export const FIELD_TEST_RACE_EXCLUSION_DAYS = 10; // never within 10 days of a race
export const FIELD_TEST_RECOVERY_LOCKOUT_DAYS = 3; // never in a recovery week's first 3 days
export const FIELD_TEST_CADENCE_CONF_HIGH = 0.75; // ≥0.75 confidence → 8-week cadence
export const FIELD_TEST_CADENCE_CONF_MID = 0.5; // 0.50–0.74 → 6-week cadence
export const FIELD_TEST_CADENCE_WEEKS_HIGH_CONF = 8;
export const FIELD_TEST_CADENCE_WEEKS_MID_CONF = 6;
export const FIELD_TEST_PRE_RACE_WEEKS = 6; // full battery 6 weeks before an A race
export const FIELD_TEST_FITNESS_CONFIRM_DAYS = 10; // confirmatory test within 10 days (§10.3)
export const FIELD_TEST_PHASE_TRANSITION_DEADLINE_DAYS = 7; // LT2 test at a phase change

// ── Durability — Maunder et al. 2021; Hunter et al. 2025 (§11) ───────────────
export const DECOUPLING_TARGET_PCT = 5;
export const DECOUPLING_MIN_SESSION_MIN = 75;
export const DECOUPLING_MAX_INTENSITY_CV = 0.1; // intensity SD <10% within each half (§11.1)
/**
 * §11.1 invalidates a decoupling reading when there was "no long stop" but never says how
 * long a stop must be to count. 120s is a convention, not physiology — long enough to ignore
 * traffic lights and bottle stops, short enough to catch a real break that lets HR recover.
 * Flagged for sign-off (`D-DECOUPLING-STOP`), like `D-HEAT-MARGIN`'s undefined margin.
 */
export const DECOUPLING_LONG_STOP_S = 120;
export const DURABILITY_RACE_ESCALATION_WEEKS = 10; // long-course <10 wk from A race → escalate (§11.2)

// ── Heat — McDonald et al. 2025, Comp Physiol 15(3):1–49 (211 papers) (§7.4) ──
export const HEAT_EXPOSURES_RANGE = [8, 14] as const;
export const HEAT_EXPOSURE_MIN_MINUTES = 60;
export const HEAT_BLOCK_END_DAYS_BEFORE_RACE = [5, 10] as const;
/**
 * Heat adaptation decays without exposure: end-exercise HR adaptation at ≈2.3%/day and
 * core-temperature adaptation at ≈2.6%/day — the spec rounds both to 2.5%/day (r2, §7.4).
 * Re-induction is 8–12× faster than decay, which is why a top-up is cheap and a longer
 * re-run of the block is not (Daanen et al. 2018, Sports Med 48:409–430).
 */
export const HEAT_DECAY_PCT_PER_DAY = 0.025;
export const HEAT_RETENTION_TOPUP_THRESHOLD = 0.75;
export const HEAT_REINDUCTION_SPEED_MULTIPLIER = 10; // 8–12× faster than decay
/** >15 exposures produces more robust sudomotor adaptation than 8–14 (McDonald et al. 2025). */
export const HEAT_LONG_REGIMEN_EXPOSURES = 15;
// Passive post-session exposure (sauna / hot bath): 20–30 min, §7.4. Preferred because it
// does not compromise prescribed training intensity.
export const HEAT_PASSIVE_MINUTES = 25;
/**
 * How far a race's expected wet-bulb must exceed the athlete's training norm before a heat
 * block is prescribed. §7.4 says "a defined margin" and never defines it, so this is a
 * **product policy default**, not a cited physiological threshold (`D-HEAT-MARGIN`).
 *
 * Set low deliberately: the risks are asymmetric. The preferred intervention is 20–30 min of
 * passive sauna that costs no training quality, while an unacclimated athlete in a hot race
 * risks a bad day at best and heat illness at worst. Callers may override per athlete.
 */
export const HEAT_TRIGGER_MARGIN_C = 3;

// ── Strength — Eihara et al. 2022; Llanos-Lagos et al. 2024; Zanini 2025 (§7.3) ─
export const STRENGTH_SESSIONS_PER_WEEK = { base: 2, build: 2, peak: 1, taper: 1 } as const;
export const STRENGTH_HEAVY_SETS = [3, 5] as const;
export const STRENGTH_HEAVY_REPS = [4, 6] as const;
export const STRENGTH_HEAVY_PCT_1RM = [0.8, 0.85] as const;
export const STRENGTH_BUILD_VOLUME_REDUCTION = 0.25; // Build/Peak trim ~25% off Base volume
export const STRENGTH_MIN_HOURS_FROM_KEY_AEROBIC = 6;
export const STRENGTH_TAPER_LOCKOUT_DAYS = 10; // no strength inside the final 10 days
/**
 * Strength emphasis is **speed-dependent** (r2, §7.3). Separating methods by the speed at
 * which running economy was measured: heavy strength (>80% 1RM) was most effective at higher
 * speeds (≈8.6–17.9 km/h), plyometric below ≈12 km/h, combined in the ≈10–14.5 km/h band
 * (Llanos-Lagos et al. 2024, Sports Med 54:895–932). The engine knows each athlete's threshold
 * pace, so it prescribes from their actual race-pace band rather than defaulting everyone to
 * heavy compound work.
 */
export const STRENGTH_SPEED_BANDS_KMH = { plyoBelow: 12.0, combinedUpper: 14.5 } as const;
/**
 * Submaximal 40–79% 1RM loading — the "endurance rep" scheme that dominates consumer training
 * apps — showed **no** effect on running economy at all, as did isometric work
 * (Llanos-Lagos et al. 2024). Never prescribe below this.
 */
export const STRENGTH_MIN_HEAVY_LOAD_1RM = 0.8;

// ── Intervals — Rønnestad & Hansen 2013 + Almquist et al. 2020 (bike); ────────
// Fleckenstein et al. 2025 (run). The sports genuinely diverge — same outcome measure,
// opposite conclusions — which is the justification for a per-sport table, not a bug (§7.2).
export const BIKE_VO2_SHORT = { work: 30, rest: 15, reps: 13, sets: 3, setRest: 180 } as const;
export const RUN_VO2_LONG = { workMin: 3, workMax: 4, reps: [4, 6], recoveryRatio: 1.0 } as const;

// ── Sub-threshold organisation — Casado et al. 2023; Talsnes et al. 2024 (§7.2b) ─
/**
 * The gating rules for same-day session splitting. The one controlled comparison found the
 * **single long session produced the larger stimulus** (duration-dependent drift in HR, lactate
 * and RPE; sRPE 7.0 vs 6.0) and the split day the **lower cost** (less next-morning fatigue)
 * — Talsnes et al. 2024, Front Physiol 15:1428536.
 *
 * So splitting is only worth it if the athlete spends the saved cost on *more* volume.
 * Splitting the same volume is a net reduction in stimulus, and is the failure mode these
 * constants exist to prevent.
 */
export const SUBTHRESHOLD_SPLIT_MIN_WEEKLY_S2_MIN = 60;
export const SUBTHRESHOLD_SPLIT_MIN_GAP_HOURS = 5;
export const SUBTHRESHOLD_SPLIT_REQUIRED_VOLUME_INCREASE = 0.15;
export const SUBTHRESHOLD_SPLIT_MIN_CONFIDENCE = 0.6;
export const SUBTHRESHOLD_SPLIT_MIN_TRAINING_AGE_YEARS = 2;
export const SUBTHRESHOLD_SPLIT_MIN_WEEKLY_HOURS = 8;

// ── Critical power model fitting (§6.3) ──────────────────────────────────────
export const CP_FIT_DURATION_RANGE_BIKE_S = [120, 900] as const;
export const CP_FIT_DURATION_RANGE_RUN_S = [180, 1200] as const;
export const CP_FIT_MIN_POINTS = 3;
export const CP_FIT_MIN_R2 = 0.95;
// A mean-max point counts as genuinely maximal within 95% of the athlete's all-time best.
export const CP_FIT_MAXIMAL_FRACTION = 0.95;
export const W_PRIME_BOUNDS_J = [5000, 35000] as const;
export const W_PRIME_INTERVAL_DEPLETION_TARGET = [0.6, 0.8] as const;

// ── Provenance → base confidence (03-ALGORITHM.md §2.1) ──────────────────────
// A threshold estimated from a formula and one measured in a field test are never
// treated as equivalent. Higher-priority provenance may only ever raise confidence
// (invariant I14).
export const PROVENANCE_CONFIDENCE = {
  lab_test: 1.0,
  field_test: 0.85,
  // observed_max: highest valid observed HR in the last 12 months (§2.2, HRmax path).
  // The §2.1 provenance table omits this 0.80 source that §2.2 defines; added at the
  // spec-stated confidence. Deviation logged in DECISIONS.md.
  observed_max: 0.8,
  dfa_a1_multi: 0.75, // ≥3 sessions agreeing
  cp_model_fit: 0.7, // good-quality mean-max fit
  athlete_reported: 0.6,
  // CSS tracks lactate-threshold speed reasonably but not exactly: r=0.87, SEE=0.033 m/s vs
  // measured MLSS (Nikitakis & Toubekis; docs/algorithm-review-2026-07.md §2.4) — a genuine
  // field test, so above athlete_reported, but with real disagreement against the lab
  // standard it approximates, so below cp_model_fit.
  css_test: 0.65,
  dfa_a1_single: 0.5,
  // A single-race Riegel extrapolation (§goal time). Ceiling for a near-distance prediction
  // (e.g. 10k → half); actual confidence scales down with extrapolation distance — see
  // RIEGEL_CONFIDENCE_FLOOR_RATIO in plan/goalTime.ts.
  riegel_prediction: 0.6,
  passive_inference: 0.4,
  population_formula: 0.2,
} as const;

// ── Race-time prediction — Riegel formula, volume-tiered exponent (§goal time) ──
// T2 = T1 × (D2/D1)^k. Riegel's original k=1.06 fits mid-distance well for a general
// population but is demonstrably optimistic for lower-volume recreational runners at the
// marathon. Tiered exponent from Vickers & Vertosick 2016 (BMC Sports Science, Medicine and
// Rehabilitation; >2M race results) — see docs/algorithm-review-2026-07.md §2.3 for the
// research this resolved. Tier is chosen from the athlete's stated weekly training hours
// (BaselineAbility), the only volume signal onboarding actually collects.
export const RIEGEL_EXPONENT_HIGH_VOLUME = 1.06; // ≥8 h/week
export const RIEGEL_EXPONENT_MODERATE_VOLUME = 1.09; // 4–8 h/week
export const RIEGEL_EXPONENT_LOW_VOLUME = 1.12; // <4 h/week
export const RIEGEL_HIGH_VOLUME_HOURS = 8;
export const RIEGEL_MODERATE_VOLUME_HOURS = 4;
// Beyond this distance ratio the formula "violates the model" per Riegel's own guidance
// (most accurate 5k↔half; a 10k predicts a half far more reliably than a 50k) — confidence
// is floored rather than the estimate rejected, since a number with low confidence is still
// more useful than no number at all for a feasibility check.
export const RIEGEL_LOW_CONFIDENCE_RATIO = 5;

// ── Critical Swim Speed (§6.3) ────────────────────────────────────────────────
export const CSS_SHORT_M = 200;
export const CSS_LONG_M = 400;
// The 200 m split must not be paced faster than CSS by more than this fraction, or it was a
// sprint rather than a threshold effort and the resulting CSS would be inflated.
export const CSS_MAX_PACE_DRIFT = 0.15;

// ── DFA-a1 detection windowing (§6.1) ────────────────────────────────────────
// Standard DFA-a1 uses short-term box sizes 4–16 beats. Rolling 2-minute windows every
// 30 s. REFERENCES.md §"Threshold detection from HRV".
export const DFA_A1_BOX_MIN = 4;
export const DFA_A1_BOX_MAX = 16;
export const DFA_A1_WINDOW_SECONDS = 120;
export const DFA_A1_STEP_SECONDS = 30;
export const DFA_A1_MULTI_WINDOW_DAYS = 21;
/**
 * **r2: the canonical stored value for a DFA-a1 threshold is power (bike) or grade-adjusted
 * speed (run), not heart rate.** Test–retest reliability is materially better in power —
 * ICC 0.87 (HRVT1) and 0.97 (HRVT2) — against typical errors of 8.8 and 4.1 bpm in HR
 * (Sempere-Ruiz et al. 2024, Front Physiol 15:1329360). The HR value is *derived for display*
 * and carries its own, lower, confidence.
 */
export const DFA_A1_CANONICAL_UNIT = 'power_or_pace' as const;
/**
 * Typical error in HR at threshold 1 / threshold 2 (Sheoran et al. 2024, J Sports Sci
 * 42:2012–2020). Used to *size the aggregation window* and to state the spread honestly in the
 * UI — never to claim accuracy. Sex and cardiorespiratory fitness moderate agreement, so no
 * single population-level accuracy figure may be shown.
 */
export const DFA_A1_TYPICAL_ERROR_BPM = { t1: 6, t2: 8 } as const;
/**
 * Aggregation agreement window as a fraction of the power/pace value. r1 checked a ±6 bpm HR
 * window, which is roughly *one typical error wide* and would have rejected valid agreement
 * about as often as it caught noise (r2, §6.1).
 */
export const DFA_A1_MULTI_AGREEMENT_FRACTION = 0.04;
/**
 * Never raise. The method is actively disputed — Cassirame et al. 2025 question DFA-a1 for
 * intensity monitoring, Gronwald et al. have published a direct rebuttal, and signal-to-noise
 * and movement artefact materially influence agreement. DFA-a1 is a useful passive prior that
 * *schedules a test*, not a replacement for one (§6.1).
 */
export const DFA_A1_CONFIDENCE_CEILING = 0.75;
/** @deprecated r2 checks agreement on power/pace — see `DFA_A1_MULTI_AGREEMENT_FRACTION`. */
export const DFA_A1_MULTI_HR_SPREAD_BPM = 6;

// ── Resting HR derivation (§2.3) ─────────────────────────────────────────────
export const HRREST_ROLLING_DAYS = 30;
export const HRREST_PERCENTILE = 5; // 5th percentile of nightly minimum, rejects artefacts

// ── Intensity distribution targets by phase (§4.2) ───────────────────────────
// % of weekly sessions, session-goal classification. Phase-dependent: pyramidal early,
// polarised late, and deliberately NOT polarised for long-course peaking (an IM is raced
// in S2). Filipas et al. 2022; Rosenblat et al. 2025; Rivera-Köfler et al. 2025.
// REFERENCES.md §"Intensity distribution".
export const DISTRIBUTION_TARGETS = {
  base: { S1: 80, S2: 15, S3: 5 },
  build_short: { S1: 78, S2: 12, S3: 10 },
  build_long: { S1: 78, S2: 17, S3: 5 },
  peak_short: { S1: 78, S2: 6, S3: 16 },
  peak_long: { S1: 75, S2: 20, S3: 5 },
  taper: { S1: 82, S2: 10, S3: 8 },
  recovery: { S1: 92, S2: 8, S3: 0 },
} as const;
// Tolerance in percentage points, measured over a rolling 3-week window (§4.2).
export const DISTRIBUTION_TOLERANCE = { S1: 7, S2: 5, S3: 5 } as const;
export const DISTRIBUTION_ROLLING_WEEKS = 3;
// Moderate-drift check (§3.4): S2 time-in-zone above this fraction of weekly time warns.
export const MODERATE_DRIFT_S2_TIME_PCT = 0.25;
export const MODERATE_DRIFT_REASON = 'MODERATE_DRIFT'; // machine-readable (F11, P1)

// ── Weekly re-planning triggers (§10.3) ──────────────────────────────────────
// Week-boundary evaluations from spec/03-ALGORITHM.md §10.3. Adjust the plan, not the athlete.
export const COMPLETION_LOW_FRAC = 0.7; // <70% completion …
export const COMPLETION_LOW_WEEKS = 2; // … for 2 weeks (no readiness flags) → cut target
export const COMPLETION_LOW_TARGET_BUMP = 0.05; // new target = actual + 5% (the plan was wrong)
export const COMPLETION_HIGH_FRAC = 0.95; // >95% completion …
export const COMPLETION_HIGH_WEEKS = 3; // … with readiness stable 3 weeks → allow full ramp
export const HR_PACE_DRIFT_FRAC = 0.03; // HR at a fixed pace falling ≥3% …
export const HR_PACE_DRIFT_WEEKS = 3; // … over 3+ weeks → schedule a test, don't assume
export const BODY_MASS_CHANGE_FRAC = 0.03; // body-mass change >3% …
export const BODY_MASS_CHANGE_WEEKS = 4; // … over 4 weeks → recompute W/kg, flag if unexplained

// ── Taper table by A-race event (§8.3) ───────────────────────────────────────
// days = taper length; reduction = final-week volume reduction. Intensity and frequency
// are maintained. Bosquet et al. 2007; Wang et al. 2023. REFERENCES.md §"Taper".
export const TAPER_TABLE = {
  sprint_tri: { days: 7, reduction: 0.5 },
  '5k': { days: 7, reduction: 0.5 },
  olympic_tri: { days: 10, reduction: 0.5 },
  '10k': { days: 10, reduction: 0.5 },
  half_marathon: { days: 10, reduction: 0.5 },
  '70.3': { days: 14, reduction: 0.55 },
  marathon: { days: 14, reduction: 0.55 },
  ironman: { days: 18, reduction: 0.6 },
} as const;

// ── Progression guardrails not already above (§5.3) ──────────────────────────
export const MAX_CONSECUTIVE_HARD_DAYS_CROSS_SPORT = 3; // never 3 across sports (G5)
export const RAMP_CAP_APPLIED_REASON = 'RAMP_CAP_APPLIED'; // machine-readable (F8, P1)

// ── Degradation: prescribing without sensors (§14) ───────────────────────────

/**
 * RPE band per 3-zone bucket, on the CR10 scale (Foster et al. 2001 — REFERENCES.md).
 *
 * ⚠️ **CONVENTION, NOT PHYSIOLOGY — flagged for sign-off (`D-RPE-BANDS`).** The scale itself is
 * cited; §14 says to "use HR and RPE" when there is no power meter and to prescribe swims "by
 * RPE", but ==the spec never states which RPE corresponds to which zone==. These edges follow
 * Foster's verbal anchors (3 moderate, 5 hard, 7 very hard, 10 maximal) mapped onto the
 * LT1/LT2 boundaries the S-zones already encode. They are conservative at the top: S3 starts at
 * 8, not 7, so an athlete steering by feel under-shoots rather than over-shoots the hardest work.
 *
 * Same posture as `DECOUPLING_LONG_STOP_S`: the engine needs a number to prescribe anything at
 * all, so it uses a documented one and says loudly that it is a convention.
 */
export const RPE_BY_SZONE = {
  S1: { lo: 2, hi: 4 }, // below LT1 — "easy" to "somewhat hard"
  S2: { lo: 5, hi: 7 }, // LT1–LT2 — "hard" to "very hard"
  S3: { lo: 8, hi: 10 }, // above LT2 — beyond "very hard"
} as const;
