/**
 * plan/goalTime.ts — race-time prediction and goal feasibility (docs/algorithm-review-2026-07.md
 * §2.3). Riegel's formula (T2 = T1 × (D2/D1)^k) with a volume-tiered exponent rather than the
 * flat k=1.06, which is optimistic for lower-volume recreational runners at the marathon —
 * research below. Returned as an `Estimate`, never a bare number (P2): confidence starts at the
 * `riegel_prediction` tier and is floored further the more the target distance extrapolates past
 * what the formula was validated for.
 *
 * Running only. Riegel is a running formula; a triathlon goal time is a multi-sport pacing
 * problem with no equivalent single-formula treatment in the spec, and none is invented here.
 */

import {
  PROVENANCE_CONFIDENCE,
  RIEGEL_EXPONENT_HIGH_VOLUME,
  RIEGEL_EXPONENT_LOW_VOLUME,
  RIEGEL_EXPONENT_MODERATE_VOLUME,
  RIEGEL_HIGH_VOLUME_HOURS,
  RIEGEL_LOW_CONFIDENCE_RATIO,
  RIEGEL_MODERATE_VOLUME_HOURS,
} from '../constants.js';
import type { Estimate, ISODateTime } from '../types.js';

/** The Vickers & Vertosick volume-tiered fatigue exponent for the athlete's weekly hours. */
export function riegelExponent(weeklyHours: number): number {
  if (weeklyHours >= RIEGEL_HIGH_VOLUME_HOURS) return RIEGEL_EXPONENT_HIGH_VOLUME;
  if (weeklyHours >= RIEGEL_MODERATE_VOLUME_HOURS) return RIEGEL_EXPONENT_MODERATE_VOLUME;
  return RIEGEL_EXPONENT_LOW_VOLUME;
}

/**
 * Predict a race time at `toDistanceM` from a known time at `fromDistanceM`. Confidence is the
 * `riegel_prediction` ceiling, scaled down as the target distance extrapolates further from the
 * known one — a 10k reliably predicts a half; it predicts a 50k far less reliably.
 */
export function predictRaceTime(
  fromDistanceM: number,
  fromTimeS: number,
  toDistanceM: number,
  weeklyHours: number,
  now?: ISODateTime,
): Estimate<number> {
  const k = riegelExponent(weeklyHours);
  const predictedS = fromTimeS * (toDistanceM / fromDistanceM) ** k;

  const ratio = Math.max(toDistanceM / fromDistanceM, fromDistanceM / toDistanceM);
  const extrapolationFrac = Math.min(1, Math.max(0, (ratio - 1) / (RIEGEL_LOW_CONFIDENCE_RATIO - 1)));
  const ceiling = PROVENANCE_CONFIDENCE.riegel_prediction;
  const floor = PROVENANCE_CONFIDENCE.population_formula;
  const confidence = ceiling - extrapolationFrac * (ceiling - floor);

  return { value: predictedS, confidence, provenance: 'riegel_prediction', measuredAt: now ?? new Date(0).toISOString() };
}

export interface GoalFeasibility {
  /** Goal time as a fraction of the prediction (1.0 = exactly on the predicted pace). */
  goalToPredictedRatio: number;
  feasible: boolean;
  /** True when the goal is *slower* than predicted — always feasible, never flagged. */
  conservative: boolean;
  reasonText: string;
}

/**
 * Whether a stated goal time is realistic against the Riegel prediction. A goal slower than
 * predicted is never flagged — an athlete is always free to target a softer time. Faster goals
 * are checked against a margin that widens as prediction confidence falls, so a low-confidence
 * (heavily extrapolated) prediction doesn't produce a false "not feasible".
 */
export function assessGoalFeasibility(predicted: Estimate<number>, goalTimeS: number): GoalFeasibility {
  const ratio = goalTimeS / predicted.value;
  if (ratio >= 1) {
    return {
      goalToPredictedRatio: ratio,
      feasible: true,
      conservative: true,
      reasonText: 'Your goal is at or slower than your predicted pace from recent racing — comfortably on the table.',
    };
  }

  // The faster a goal is relative to prediction, the harder it needs the prediction to be
  // trusted; a low-confidence prediction earns more benefit of the doubt.
  const marginFrac = 0.02 + (1 - predicted.confidence) * 0.08; // 2%–10%
  const feasible = ratio >= 1 - marginFrac;

  return {
    goalToPredictedRatio: ratio,
    feasible,
    conservative: false,
    reasonText: feasible
      ? "Your goal is faster than today's prediction but within reach with focused training."
      : `Your goal is ${Math.round((1 - ratio) * 100)}% faster than your current predicted pace — that's a stretch for this training block. Consider a softer goal or more time.`,
  };
}
