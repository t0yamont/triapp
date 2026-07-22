/**
 * anchors/criticalPower.ts — CP/W′ and critical-speed fitting (03-ALGORITHM.md §6.3).
 *
 * Fit the 2-parameter hyperbolic model to mean-maximal efforts from ordinary training:
 *
 *   t = W′ / (P − CP)      ⇔      P = W′·(1/t) + CP
 *
 * i.e. a linear regression of P on (1/t): slope = W′, intercept = CP. Passive, no test.
 * CP is a good (not identical) proxy for LT2 and sits slightly above MLSS — labelled as
 * `criticalIntensity`, distinct from a measured `lt2`.
 */

import {
  CP_FIT_DURATION_RANGE_BIKE_S,
  CP_FIT_DURATION_RANGE_RUN_S,
  CP_FIT_MIN_POINTS,
  CP_FIT_MIN_R2,
  PROVENANCE_CONFIDENCE,
  W_PRIME_BOUNDS_J,
} from '../constants.js';
import type { Estimate, ISODateTime } from '../types.js';

/** A mean-maximal effort: best `power` (W, bike) or speed (m/s, run) held for `durationS`. */
export interface CpFitPoint {
  durationS: number;
  power: number;
  sessionId?: string;
  date?: ISODateTime;
}

export interface CpFitValue {
  /** CP (W) for bike, critical speed (m/s) for run. */
  criticalIntensity: number;
  /** W′ (J) for bike, D′ (m) for run. */
  wPrime: number;
  r2: number;
}

/** Rejection reasons, surfaced so the caller can explain why no anchor was produced. */
export type CpFitRejection =
  | 'too_few_points'
  | 'too_few_sessions'
  | 'r2_below_threshold'
  | 'w_prime_out_of_bounds'
  | 'degenerate';

export interface CpFitResult {
  estimate: Estimate<CpFitValue> | null;
  rejection?: CpFitRejection;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 42;

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - meanX) * (ys[i]! - meanY);
    sxx += (xs[i]! - meanX) ** 2;
  }
  /* v8 ignore next -- defensive: CP points have distinct durations, so sxx > 0 */
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i]!;
    ssRes += (ys[i]! - predicted) ** 2;
    ssTot += (ys[i]! - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/** Confidence 0.70 for a strong fit, scaled toward 0.50 as R² approaches the 0.95 floor (§6.3). */
function scaledConfidence(r2: number): number {
  const lo = CP_FIT_MIN_R2; // 0.95
  const base = PROVENANCE_CONFIDENCE.cp_model_fit; // 0.70
  const floor = PROVENANCE_CONFIDENCE.dfa_a1_single; // 0.50 — "toward 0.5"
  const frac = Math.min(1, Math.max(0, (r2 - lo) / (1 - lo)));
  return floor + frac * (base - floor);
}

export function fitCriticalPower(
  points: CpFitPoint[],
  sport: 'bike' | 'run',
  now?: ISODateTime,
): CpFitResult {
  const [minDur, maxDur] =
    sport === 'bike' ? CP_FIT_DURATION_RANGE_BIKE_S : CP_FIT_DURATION_RANGE_RUN_S;

  // 1. Duration filter — efforts shorter than the floor inflate CP; longer violate the model.
  let candidates = points.filter((p) => p.durationS >= minDur && p.durationS <= maxDur);

  // 2. 42-day rolling window (when dates are available), ending at the most recent effort.
  const dated = candidates.filter((p) => p.date !== undefined);
  if (dated.length > 0) {
    const latest = Math.max(...dated.map((p) => new Date(p.date!).getTime()));
    const end = now ? new Date(now).getTime() : latest;
    candidates = candidates.filter(
      (p) => p.date === undefined || end - new Date(p.date).getTime() <= WINDOW_DAYS * DAY_MS,
    );
  }

  if (candidates.length < CP_FIT_MIN_POINTS) {
    return { estimate: null, rejection: 'too_few_points' };
  }

  // 3. ≥2 distinct sessions (checked only when session ids are supplied).
  const sessionIds = new Set(candidates.map((p) => p.sessionId).filter((s) => s !== undefined));
  if (sessionIds.size > 0 && sessionIds.size < 2) {
    return { estimate: null, rejection: 'too_few_sessions' };
  }

  const xs = candidates.map((p) => 1 / p.durationS);
  const ys = candidates.map((p) => p.power);
  const { slope: wPrime, intercept: cp, r2 } = linearRegression(xs, ys);

  if (!Number.isFinite(cp) || !Number.isFinite(wPrime) || cp <= 0 || wPrime <= 0) {
    return { estimate: null, rejection: 'degenerate' };
  }
  if (r2 < CP_FIT_MIN_R2) {
    return { estimate: null, rejection: 'r2_below_threshold' };
  }
  // W′ bounds are physiological and bike-specific (5–35 kJ). Run D′ bounds are not given
  // in the spec, so we do not gate run fits on them (documented in DECISIONS.md).
  if (sport === 'bike' && (wPrime < W_PRIME_BOUNDS_J[0] || wPrime > W_PRIME_BOUNDS_J[1])) {
    return { estimate: null, rejection: 'w_prime_out_of_bounds' };
  }

  const measuredAt =
    now ??
    (dated.length > 0
      ? new Date(Math.max(...dated.map((p) => new Date(p.date!).getTime()))).toISOString()
      : new Date(0).toISOString());

  return {
    estimate: {
      value: { criticalIntensity: cp, wPrime, r2 },
      confidence: scaledConfidence(r2),
      provenance: 'cp_model_fit',
      measuredAt,
      sampleSize: candidates.length,
    },
  };
}
