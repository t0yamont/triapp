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
// ONLY; never used as the working value. The original IronFlow draft mislabelled the
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

// ── Taper — Bosquet et al. 2007; Wang et al. 2023 (§8.3) ─────────────────────
export const TAPER_VOLUME_REDUCTION_RANGE = [0.41, 0.6] as const;
export const TAPER_WEEKLY_DECAY = 0.65;
export const TAPER_MAINTAIN_INTENSITY = true;
export const TAPER_MAINTAIN_FREQUENCY = true;

// ── Readiness — SWC = 0.5 × baseline SD (§10.1) ──────────────────────────────
export const SWC_MULTIPLIER = 0.5;
export const HRV_BASELINE_DAYS = 60;
export const HRV_ROLLING_DAYS = 7;

// ── Durability — Maunder et al. 2021; Hunter et al. 2025 (§11) ───────────────
export const DECOUPLING_TARGET_PCT = 5;
export const DECOUPLING_MIN_SESSION_MIN = 75;

// ── Heat — Bayesian meta-regression, 211 papers (§7.4) ───────────────────────
export const HEAT_EXPOSURES_RANGE = [8, 14] as const;
export const HEAT_EXPOSURE_MIN_MINUTES = 60;
export const HEAT_BLOCK_END_DAYS_BEFORE_RACE = [5, 10] as const;

// ── Intervals — Rønnestad & Hansen 2013 (bike); Fleckenstein et al. 2025 (run) ─
// The sports genuinely diverge here; the engine must not share one template (§7.2).
export const BIKE_VO2_SHORT = { work: 30, rest: 15, reps: 13, sets: 3, setRest: 180 } as const;
export const RUN_VO2_LONG = { workMin: 3, workMax: 4, reps: [4, 6], recoveryRatio: 1.0 } as const;

// ── Critical power model fitting (§6.3) ──────────────────────────────────────
export const CP_FIT_DURATION_RANGE_BIKE_S = [120, 900] as const;
export const CP_FIT_DURATION_RANGE_RUN_S = [180, 1200] as const;
export const CP_FIT_MIN_POINTS = 3;
export const CP_FIT_MIN_R2 = 0.95;
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
  dfa_a1_single: 0.5,
  passive_inference: 0.4,
  population_formula: 0.2,
} as const;

// ── DFA-a1 detection windowing (§6.1) ────────────────────────────────────────
// Standard DFA-a1 uses short-term box sizes 4–16 beats. Rolling 2-minute windows every
// 30 s. REFERENCES.md §"Threshold detection from HRV".
export const DFA_A1_BOX_MIN = 4;
export const DFA_A1_BOX_MAX = 16;
export const DFA_A1_WINDOW_SECONDS = 120;
export const DFA_A1_STEP_SECONDS = 30;
export const DFA_A1_MULTI_WINDOW_DAYS = 21;
export const DFA_A1_MULTI_HR_SPREAD_BPM = 6;

// ── Resting HR derivation (§2.3) ─────────────────────────────────────────────
export const HRREST_ROLLING_DAYS = 30;
export const HRREST_PERCENTILE = 5; // 5th percentile of nightly minimum, rejects artefacts
