/**
 * load/meanMax.ts — mean-maximal curves (§6.3, §11.1). The best average intensity an athlete
 * sustained for each duration in a session: the input CP fitting draws its points from, and the
 * basis of the durability index when computed on late-session data.
 *
 * O(n) per duration via a running window sum, so a 5-hour ride across a dozen durations is
 * cheap. Samples are assumed evenly spaced at `sampleRateHz` (1 Hz by default).
 */

import {
  CP_FIT_DURATION_RANGE_BIKE_S,
  CP_FIT_DURATION_RANGE_RUN_S,
  CP_FIT_MAXIMAL_FRACTION,
} from '../constants.js';

/** Best average value sustained over a window of `windowS` seconds; null if the series is shorter. */
export function bestMeanEffort(samples: number[], windowS: number, sampleRateHz = 1): number | null {
  const width = Math.round(windowS * sampleRateHz);
  if (width <= 0 || samples.length < width) return null;

  let sum = 0;
  for (let i = 0; i < width; i++) sum += samples[i]!;
  let best = sum;
  for (let i = width; i < samples.length; i++) {
    sum += samples[i]! - samples[i - width]!;
    if (sum > best) best = sum;
  }
  return best / width;
}

export interface MeanMaxPoint {
  durationS: number;
  value: number;
}

/**
 * The mean-max curve at the given durations (seconds), longest-supported first excluded — a
 * duration longer than the session simply doesn't appear.
 */
export function meanMaxCurve(samples: number[], durationsS: number[], sampleRateHz = 1): MeanMaxPoint[] {
  const out: MeanMaxPoint[] = [];
  for (const durationS of durationsS) {
    const value = bestMeanEffort(samples, durationS, sampleRateHz);
    if (value !== null) out.push({ durationS, value });
  }
  return out;
}

/**
 * The §6.3 CP-fitting window: 2–15 min (bike) / 3–20 min (run). Efforts shorter than the floor
 * inflate CP; longer than the ceiling violate the 2-parameter model.
 */
export function isCpFittableDuration(durationS: number, sport: 'bike' | 'run'): boolean {
  const [min, max] = sport === 'bike' ? CP_FIT_DURATION_RANGE_BIKE_S : CP_FIT_DURATION_RANGE_RUN_S;
  return durationS >= min && durationS <= max;
}

/** Merge curves (e.g. across sessions), keeping the best value seen at each duration. */
export function mergeMeanMax(curves: MeanMaxPoint[][]): MeanMaxPoint[] {
  const best = new Map<number, number>();
  for (const curve of curves) {
    for (const p of curve) best.set(p.durationS, Math.max(best.get(p.durationS) ?? -Infinity, p.value));
  }
  return [...best.entries()].map(([durationS, value]) => ({ durationS, value })).sort((a, b) => a.durationS - b.durationS);
}

/** A point is "genuinely maximal" when within 95% of the athlete's all-time best (§6.3). */
export function isGenuinelyMaximal(value: number, allTimeBest: number): boolean {
  return allTimeBest > 0 && value >= allTimeBest * CP_FIT_MAXIMAL_FRACTION;
}

/**
 * Durability index (§11.1): the % decline in the mean-max curve computed on late-session data
 * against the fresh curve, at a given duration. Positive = capacity fell after the work dose.
 * Track the trend, not the absolute value — protocols are not standardised (Hunter et al. 2025).
 */
export function durabilityIndex(fresh: MeanMaxPoint[], late: MeanMaxPoint[], durationS: number): number | null {
  const f = fresh.find((p) => p.durationS === durationS);
  const l = late.find((p) => p.durationS === durationS);
  if (!f || !l || f.value <= 0) return null;
  return Math.round(((f.value - l.value) / f.value) * 1000) / 10;
}
