/**
 * anchors/hrRest.ts — resting HR derivation (03-ALGORITHM.md §2.3).
 *
 * 1. Wearable overnight minimum: rolling 30-day 5th percentile of nightly minimum HR
 *    (percentile, not minimum, to reject artefacts). Confidence 0.85.
 * 2. Athlete-reported morning HR (5-day median). Confidence 0.60.
 * 3. Population default by age and sex. Confidence 0.15.
 *
 * NOTE (deviation, see DECISIONS.md): the spec specifies a population default "by age and
 * sex" but provides no formula or table for it. We do not invent a physiological constant.
 * The population branch therefore requires the caller to supply the default value (as data
 * from onboarding / a reference table outside physio); absent that, this returns null and
 * the caller must degrade.
 */

import { HRREST_PERCENTILE } from '../constants.js';
import type { Estimate, ISODateTime } from '../types.js';

export interface HrRestInputs {
  /** Nightly minimum HR over the rolling 30-day window (however many nights exist). */
  nightlyMinima?: number[];
  /** Athlete-reported morning HR readings (last 5 days). */
  morningReadings?: number[];
  /** Population default supplied as data (see note above). Used only as last resort. */
  populationDefault?: number;
  now: ISODateTime;
}

/**
 * Linear-interpolation percentile (numpy "type 7" / Excel PERCENTILE.INC). `p` in 0..100.
 * A documented, standard method — the spec pins the 5th percentile but not the estimator.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of empty array');
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function deriveHrRest(inputs: HrRestInputs): Estimate<number> | null {
  if (inputs.nightlyMinima && inputs.nightlyMinima.length > 0) {
    return {
      value: percentile(inputs.nightlyMinima, HRREST_PERCENTILE),
      confidence: 0.85,
      provenance: 'field_test', // measured overnight from a wearable
      measuredAt: inputs.now,
      sampleSize: inputs.nightlyMinima.length,
    };
  }

  if (inputs.morningReadings && inputs.morningReadings.length > 0) {
    return {
      value: median(inputs.morningReadings),
      confidence: 0.6,
      provenance: 'athlete_reported',
      measuredAt: inputs.now,
      sampleSize: inputs.morningReadings.length,
    };
  }

  if (inputs.populationDefault !== undefined) {
    return {
      value: inputs.populationDefault,
      confidence: 0.15,
      provenance: 'population_formula',
      measuredAt: inputs.now,
    };
  }

  return null;
}
