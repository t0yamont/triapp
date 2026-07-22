/**
 * load/tss.ts — external, sport-specific training load (03-ALGORITHM.md §5.1).
 *
 * The three sports use genuinely different formulas. The threshold anchor is critical
 * power / critical speed, not a scaled 20-minute test.
 */

export interface TssResult {
  tss: number;
  /** Intensity factor used, exposed for transparency and cross-checks. */
  intensityFactor: number;
}

/**
 * Bike TSS: (duration_s × NP × IF) / (FTP × 3600) × 100, IF = NP / FTP, FTP = critical
 * power. F6: 3600 s, NP 210 W, CP 250 W → TSS 70.6.
 */
export function bikeTss(params: { durationS: number; np: number; cp: number }): TssResult {
  const { durationS, np, cp } = params;
  const intensityFactor = np / cp;
  const tss = (durationS * np * intensityFactor) / (cp * 3600) * 100;
  return { tss, intensityFactor };
}

/**
 * Run TSS: (duration_s × IF²) / 3600 × 100, IF = grade-adjusted speed / speed at LT2.
 * Speed terms, not pace (§3.2 — pace inverts direction). F6: 3600 s, GAP 3.60 m/s,
 * LT2 4.00 m/s → rTSS 81.0.
 */
export function runTss(params: { durationS: number; gapSpeed: number; lt2Speed: number }): TssResult {
  const { durationS, gapSpeed, lt2Speed } = params;
  const intensityFactor = gapSpeed / lt2Speed;
  const tss = (durationS * intensityFactor ** 2) / 3600 * 100;
  return { tss, intensityFactor };
}

/**
 * Swim TSS: (duration_s × IF³) / 3600 × 100, cubic exponent (power ∝ velocity³).
 *
 * ⚠️ SPEC CONCERN (DECISIONS.md D-SWIM-IF): §5.1 defines swim `IF = CSS speed / actual
 * speed`, which is INVERTED relative to run/bike (`actual / threshold`) and inflates load
 * when the athlete swims *easier* than CSS. Implemented as written pending clarification;
 * do not "fix" silently. F6 does not pin the expected number, only the cubic exponent.
 */
export function swimTss(params: { durationS: number; cssSpeed: number; actualSpeed: number }): TssResult {
  const { durationS, cssSpeed, actualSpeed } = params;
  const intensityFactor = cssSpeed / actualSpeed; // per §5.1 literal — see concern above
  const tss = (durationS * intensityFactor ** 3) / 3600 * 100;
  return { tss, intensityFactor };
}
