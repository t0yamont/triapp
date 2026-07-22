/**
 * load/fitness.ts — fitness / fatigue tracking (03-ALGORITHM.md §5.2).
 *
 *   CTL_t = CTL_{t−1} + (load_t − CTL_{t−1}) × (1 − e^(−1/42))
 *   ATL_t = ATL_{t−1} + (load_t − ATL_{t−1}) × (1 − e^(−1/7))
 *   TSB_t = CTL_{t−1} − ATL_{t−1}    (yesterday's balance — a lagged signal)
 *
 * TSB is a WEAK signal: displayed and used as one input among several, never on its own
 * triggering a plan change. Maintain per-sport CTL in addition to combined CTL — a
 * triathlete whose combined CTL is flat while run CTL collapses is not in steady state.
 */

import { ATL_TIME_CONSTANT_DAYS, CTL_TIME_CONSTANT_DAYS } from '../constants.js';

export interface FitnessPoint {
  /** Chronic training load (fitness) at end of day t. */
  ctl: number;
  /** Acute training load (fatigue) at end of day t. */
  atl: number;
  /** Training stress balance for day t = CTL_{t−1} − ATL_{t−1}. */
  tsb: number;
}

export interface FitnessSeed {
  ctl?: number;
  atl?: number;
}

/** 1 − e^(−1/τ) for a time constant of τ days. */
export function ewmaAlpha(timeConstantDays: number): number {
  return 1 - Math.exp(-1 / timeConstantDays);
}

/**
 * Compute the CTL/ATL/TSB series from a dense, consecutive daily-load array (rest days
 * are load 0). Optionally seed from a prior state so incremental recompute is exact.
 */
export function fitnessSeries(dailyLoads: number[], seed: FitnessSeed = {}): FitnessPoint[] {
  const kCtl = ewmaAlpha(CTL_TIME_CONSTANT_DAYS);
  const kAtl = ewmaAlpha(ATL_TIME_CONSTANT_DAYS);

  let ctlPrev = seed.ctl ?? 0;
  let atlPrev = seed.atl ?? 0;

  return dailyLoads.map((load) => {
    const tsb = ctlPrev - atlPrev; // yesterday's balance, before today's session
    const ctl = ctlPrev + (load - ctlPrev) * kCtl;
    const atl = atlPrev + (load - atlPrev) * kAtl;
    ctlPrev = ctl;
    atlPrev = atl;
    return { ctl, atl, tsb };
  });
}
