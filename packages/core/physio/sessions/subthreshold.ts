/**
 * sessions/subthreshold.ts — sub-threshold volume and same-day session splitting (§7.2b).
 *
 * New in spec revision r2. The "Norwegian method" is the most-discussed development in
 * endurance training of the last five years and r1 had no model for it at all.
 *
 * **What is established.** High-volume low-intensity training with a large amount of
 * *controlled* work near but deliberately below LT2, frequently split into two shorter same-day
 * sessions (Casado, Foster, Bakken & Tjelta 2023, IJERPH 20:3782; Kelemen et al. 2023). Those
 * are **observational accounts of elite practice**, not controlled trials.
 *
 * **The one controlled comparison.** Fourteen national-level athletes did one 6 × 10 min session
 * and, separately, two 3 × 10 min sessions 6.5 h apart — time- and intensity-matched. The
 * **single long session produced the larger stimulus** (duration-dependent drift in HR, lactate
 * and RPE; sRPE 7.0 vs 6.0; sRPE load 929 vs 743). The **split day cost less** — less fatigue
 * and soreness next morning (Talsnes et al. 2024, Front Physiol 15:1428536).
 *
 * **So splitting is not "better".** It buys a lower per-unit cost, which is only an advantage if
 * the athlete spends it on *more total* sub-threshold volume. Splitting the same volume is a net
 * reduction in stimulus — that is the failure mode this module exists to design against, and why
 * `requiredVolumeIncreasePct` is part of the permission rather than a suggestion.
 */

import {
  SUBTHRESHOLD_SPLIT_MIN_CONFIDENCE,
  SUBTHRESHOLD_SPLIT_MIN_GAP_HOURS,
  SUBTHRESHOLD_SPLIT_MIN_TRAINING_AGE_YEARS,
  SUBTHRESHOLD_SPLIT_MIN_WEEKLY_HOURS,
  SUBTHRESHOLD_SPLIT_MIN_WEEKLY_S2_MIN,
  SUBTHRESHOLD_SPLIT_REQUIRED_VOLUME_INCREASE,
} from '../constants.js';
import type { PlanPhase, PlanSport } from '../plan/types.js';

/** Why splitting was refused. Machine-readable so the UI can explain rather than just decline. */
export type SplitRefusal =
  | 'WEEKLY_S2_TOO_LOW'
  | 'NO_DOUBLE_SLOT'
  | 'DOUBLES_NOT_AVAILABLE'
  | 'CONFIDENCE_TOO_LOW'
  | 'TRAINING_AGE_TOO_LOW'
  | 'WEEKLY_VOLUME_TOO_LOW'
  | 'LONG_COURSE_PEAK';

export interface SplitContext {
  /** This sport's weekly S2 (sub-threshold) target, minutes. */
  weeklyS2Min: number;
  /** The athlete has declared availability for two sessions in a day. */
  doublesDeclared: boolean;
  /** Largest gap, in hours, between two trainable slots on any single day. */
  maxSameDayGapHours: number;
  /** Combined anchor confidence (§2.4). */
  confidence: number;
  trainingAgeYears: number;
  weeklyHours: number;
  phase: PlanPhase;
  /** Long-course athletes in Peak keep the single long session — see below. */
  isLongCourse: boolean;
}

export interface SplitDecision {
  permitted: boolean;
  refusals: SplitRefusal[];
  /**
   * The volume increase that must accompany the split for it to be worth doing, as a fraction.
   * Zero when splitting is refused.
   */
  requiredVolumeIncreasePct: number;
  /** Minutes per half once the required increase is applied. Zero when refused. */
  halfDurationMin: number;
  reasonText: string;
}

const REFUSAL_TEXT: Record<SplitRefusal, string> = {
  WEEKLY_S2_TOO_LOW: `under ${SUBTHRESHOLD_SPLIT_MIN_WEEKLY_S2_MIN} min of sub-threshold work a week — one session, and the drift is the point`,
  NO_DOUBLE_SLOT: `no two trainable slots at least ${SUBTHRESHOLD_SPLIT_MIN_GAP_HOURS} h apart on one day`,
  DOUBLES_NOT_AVAILABLE: 'you haven’t said you can train twice in a day',
  CONFIDENCE_TOO_LOW: 'your thresholds aren’t known precisely enough — the method depends on intensity control we don’t have yet',
  TRAINING_AGE_TOO_LOW: `under ${SUBTHRESHOLD_SPLIT_MIN_TRAINING_AGE_YEARS} years of training history`,
  WEEKLY_VOLUME_TOO_LOW: `under ${SUBTHRESHOLD_SPLIT_MIN_WEEKLY_HOURS} h a week — every descriptive study is of athletes at 15–25 h with full recovery support`,
  LONG_COURSE_PEAK: 'you’re a long-course athlete in Peak, where race-day durability is built by exactly the drift a split day avoids',
};

/**
 * Decide whether this sport's sub-threshold work may be split across a day (§7.2b).
 *
 * Every gate is a refusal *reason*, not a silent false: an athlete who is one condition away
 * from being allowed to double should be able to see which one.
 */
export function planSubThresholdSplit(ctx: SplitContext): SplitDecision {
  const refusals: SplitRefusal[] = [];

  if (ctx.weeklyS2Min <= SUBTHRESHOLD_SPLIT_MIN_WEEKLY_S2_MIN) refusals.push('WEEKLY_S2_TOO_LOW');
  if (!ctx.doublesDeclared) refusals.push('DOUBLES_NOT_AVAILABLE');
  if (ctx.maxSameDayGapHours < SUBTHRESHOLD_SPLIT_MIN_GAP_HOURS) refusals.push('NO_DOUBLE_SLOT');
  if (ctx.confidence < SUBTHRESHOLD_SPLIT_MIN_CONFIDENCE) refusals.push('CONFIDENCE_TOO_LOW');
  if (ctx.trainingAgeYears < SUBTHRESHOLD_SPLIT_MIN_TRAINING_AGE_YEARS) refusals.push('TRAINING_AGE_TOO_LOW');
  if (ctx.weeklyHours < SUBTHRESHOLD_SPLIT_MIN_WEEKLY_HOURS) refusals.push('WEEKLY_VOLUME_TOO_LOW');
  // The long-course Peak exception is a *preference*, not a safety limit: the drift a split day
  // avoids is precisely the race-day durability stimulus this athlete is peaking for (§11).
  if (ctx.isLongCourse && ctx.phase === 'peak') refusals.push('LONG_COURSE_PEAK');

  if (refusals.length > 0) {
    return {
      permitted: false,
      refusals,
      requiredVolumeIncreasePct: 0,
      halfDurationMin: 0,
      reasonText: `Sub-threshold work stays as one session: ${REFUSAL_TEXT[refusals[0]!]}.`,
    };
  }

  const increased = ctx.weeklyS2Min * (1 + SUBTHRESHOLD_SPLIT_REQUIRED_VOLUME_INCREASE);
  return {
    permitted: true,
    refusals: [],
    requiredVolumeIncreasePct: SUBTHRESHOLD_SPLIT_REQUIRED_VOLUME_INCREASE,
    // Split the *increased* volume, never the original: halving the same total is strictly worse
    // than one long session, which is the finding this whole rule is built on.
    halfDurationMin: Math.round(increased / 2),
    reasonText: `Splitting your sub-threshold work across the day, with total volume up ${Math.round(SUBTHRESHOLD_SPLIT_REQUIRED_VOLUME_INCREASE * 100)}% — the split only pays off if you spend the saved fatigue on more work.`,
  };
}

/**
 * The intensity ceiling for a split half. Both halves are capped at the **sub**-threshold
 * target and never at LT2: running each half too fast is the documented dominant error of
 * athletes copying this method (§7.2b).
 */
export const SPLIT_HALF_MAX_SZONE = 'S2' as const;

/** A split session pair, ready for the placer. */
export interface SplitSession {
  sport: PlanSport;
  dayOfWeek: number;
  durationMin: number;
  half: 1 | 2;
}

/** Materialise the decision into the two halves. Empty when splitting was refused. */
export function splitSessions(decision: SplitDecision, sport: PlanSport, dayOfWeek: number): SplitSession[] {
  if (!decision.permitted) return [];
  return [
    { sport, dayOfWeek, durationMin: decision.halfDurationMin, half: 1 },
    { sport, dayOfWeek, durationMin: decision.halfDurationMin, half: 2 },
  ];
}
