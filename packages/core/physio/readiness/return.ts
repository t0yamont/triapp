/**
 * readiness/return.ts — illness, injury, and the return-to-training ladder (§10.4). The
 * engine is deliberately conservative on the way back: coming back too fast after illness or
 * a layoff is how athletes turn a lost week into a lost month. It never silently drops the
 * load target — every restriction carries an audited, athlete-readable reason (I13, P1) — and
 * it does not diagnose: it flags "worth a professional opinion" and stops (§10.4).
 */

import {
  ILLNESS_ABOVE_NECK_VOLUME_FRAC,
  RETURN_LADDER_MAX_DAYS,
  RETURN_LADDER_MIN_DAYS_OFF,
  RETURN_LADDER_S1_ONLY_DAYS,
  RETURN_S2_VOLUME_FRAC,
  RETURN_S3_CLEARANCE_INBAND_DAYS,
} from '../constants.js';
import type { PlanMutation, SZone } from '../types.js';

/** Highest zone permitted today, or 'rest' when no training is advised. */
export type PermittedCeiling = SZone | 'rest';

export interface Restriction {
  /** Is a restriction in force? */
  active: boolean;
  ceiling: PermittedCeiling;
  /** Fraction of normal duration permitted (0 = rest, 1 = full). */
  volumeFraction: number;
  /** Suggest the athlete seek a professional opinion (never a diagnosis). */
  seekAdvice: boolean;
  mutation?: PlanMutation;
  message: string;
}

const NONE: Restriction = { active: false, ceiling: 'S3', volumeFraction: 1, seekAdvice: false, message: 'No restriction.' };

const audit = (reasonCode: string, reasonText: string): PlanMutation => ({
  actor: 'engine',
  reasonCode,
  reasonText,
  ruleId: '10.4',
});

export interface IllnessState {
  symptomatic: boolean;
  /** Above-the-neck symptoms only (runny nose, sore throat) vs systemic/chest. */
  aboveNeckOnly: boolean;
  fever: boolean;
}

/**
 * Restriction while symptomatically ill (§10.4). Above-the-neck and no fever → gentle S1 only;
 * fever or systemic symptoms → rest, with a nudge to consider a professional opinion.
 */
export function illnessRestriction(state: IllnessState): Restriction {
  if (!state.symptomatic) return NONE;

  if (state.aboveNeckOnly && !state.fever) {
    return {
      active: true,
      ceiling: 'S1',
      volumeFraction: ILLNESS_ABOVE_NECK_VOLUME_FRAC,
      seekAdvice: false,
      mutation: audit(
        'ILLNESS_ABOVE_NECK',
        'Kept today easy and short (S1, ~60%) — with head-cold symptoms and no fever, gentle aerobic work is fine, but nothing hard.',
      ),
      message: 'Above-the-neck symptoms, no fever — S1 only, about 60% of normal duration.',
    };
  }

  return {
    active: true,
    ceiling: 'rest',
    volumeFraction: 0,
    seekAdvice: true,
    mutation: audit(
      'ILLNESS_SYSTEMIC',
      "Paused training — a fever or chest/body symptoms mean rest, not exercise. If it doesn't settle, it's worth a professional opinion.",
    ),
    message: 'Fever or systemic symptoms — rest. Consider seeing a professional if it persists.',
  };
}

export interface ReturnInput {
  /** Consecutive days missed that prompted the return. */
  daysMissed: number;
  /** 1-based day of the restricted return (day 1 = first day back). */
  dayInReturn: number;
  /** Recent daily readiness in-band flags, most recent last (for the S3 clearance gate). */
  recentReadinessInBand: boolean[];
}

/** Do the last `n` entries all read true? (Trailing, most-recent-last.) */
function trailingAll(flags: boolean[], n: number): boolean {
  if (flags.length < n) return false;
  return flags.slice(flags.length - n).every(Boolean);
}

/**
 * The return-to-training ladder after a layoff (§10.4). A gap of ≥3 days earns one restricted
 * day per day missed, capped at 10: days 1–2 are S1 only, then S2 returns at 50% volume, and
 * S3 returns only after two consecutive in-band readiness days.
 */
export function returnToTraining(input: ReturnInput): Restriction {
  const ladderDays = Math.min(input.daysMissed, RETURN_LADDER_MAX_DAYS);

  // No ladder for a short gap, or once the athlete has climbed past its last rung.
  if (input.daysMissed < RETURN_LADDER_MIN_DAYS_OFF || input.dayInReturn > ladderDays) return NONE;

  if (input.dayInReturn <= RETURN_LADDER_S1_ONLY_DAYS) {
    return {
      active: true,
      ceiling: 'S1',
      volumeFraction: 1,
      seekAdvice: false,
      mutation: audit(
        'RETURN_LADDER_S1',
        `Easing you back in — day ${input.dayInReturn} after ${input.daysMissed} days off is S1 only.`,
      ),
      message: `Return day ${input.dayInReturn}/${ladderDays}: S1 only.`,
    };
  }

  // Past the S1-only rung: S3 is unlocked once readiness has been in-band two days running.
  if (trailingAll(input.recentReadinessInBand, RETURN_S3_CLEARANCE_INBAND_DAYS)) {
    return {
      active: true,
      ceiling: 'S3',
      volumeFraction: 1,
      seekAdvice: false,
      mutation: audit(
        'RETURN_LADDER_S3_CLEARED',
        'Cleared for full intensity again — your readiness has been back to normal for two days running.',
      ),
      message: `Return day ${input.dayInReturn}/${ladderDays}: cleared for S3.`,
    };
  }

  return {
    active: true,
    ceiling: 'S2',
    volumeFraction: RETURN_S2_VOLUME_FRAC,
    seekAdvice: false,
    mutation: audit(
      'RETURN_LADDER_S2',
      'Reintroducing tempo at half volume — S3 stays off until your readiness holds steady for two days.',
    ),
    message: `Return day ${input.dayInReturn}/${ladderDays}: S2 at 50% volume, no S3 yet.`,
  };
}
