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
 * RESOLVED SPEC DEVIATION (DECISIONS.md `D-SWIM-IF`): §5.1 writes swim `IF = CSS speed /
 * actual speed`, which is inverted — it makes IF rise as the athlete swims *easier*, so an
 * easy recovery swim would score more load than a threshold set. Implemented the way every
 * other sport defines intensity factor, `actual / threshold`, so IF < 1 below CSS and > 1
 * above it. F6 pins only the cubic exponent, not the number, so nothing golden moves.
 */
export function swimTss(params: { durationS: number; cssSpeed: number; actualSpeed: number }): TssResult {
  const { durationS, cssSpeed, actualSpeed } = params;
  const intensityFactor = actualSpeed / cssSpeed;
  const tss = (durationS * intensityFactor ** 3) / 3600 * 100;
  return { tss, intensityFactor };
}
