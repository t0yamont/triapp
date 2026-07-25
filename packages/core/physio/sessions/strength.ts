/**
 * sessions/strength.ts — strength prescription and its scheduling rules (§7.3).
 *
 * Heavy resistance training improves running economy with a consistent, larger effect than
 * plyometric-dominant work, and improves economy specifically *under fatigue* — a durability
 * mechanism (Eihara et al. 2022; Llanos-Lagos et al. 2024/2025; Zanini et al. 2025). The
 * scheduling rules exist so it never costs the aerobic work it is meant to support.
 */

import {
  STRENGTH_BUILD_VOLUME_REDUCTION,
  STRENGTH_HEAVY_PCT_1RM,
  STRENGTH_HEAVY_REPS,
  STRENGTH_HEAVY_SETS,
  STRENGTH_MIN_HOURS_FROM_KEY_AEROBIC,
  STRENGTH_SESSIONS_PER_WEEK,
  STRENGTH_TAPER_LOCKOUT_DAYS,
} from '../constants.js';
import type { PlanPhase } from '../plan/types.js';

export interface StrengthPrescription {
  sessionsPerWeek: number;
  sets: readonly [number, number];
  reps: readonly [number, number];
  pct1RM: readonly [number, number];
  /** Base adds a plyometric block; later phases drop it to protect freshness. */
  includesPlyometrics: boolean;
  /** Fraction the phase trims from Base volume (0 = full). */
  volumeReduction: number;
  note: string;
}

/** The §7.3 prescription for a phase. Race week and the final taper days carry none. */
export function strengthPrescription(phase: PlanPhase): StrengthPrescription | null {
  const heavy = { sets: STRENGTH_HEAVY_SETS, reps: STRENGTH_HEAVY_REPS, pct1RM: STRENGTH_HEAVY_PCT_1RM };

  switch (phase) {
    case 'base':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.base,
        includesPlyometrics: true,
        volumeReduction: 0,
        note: 'Heavy compound lifting plus one plyometric block — the biggest economy gains come from this phase.',
      };
    case 'build':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.build,
        includesPlyometrics: false,
        volumeReduction: STRENGTH_BUILD_VOLUME_REDUCTION,
        note: 'Same heavy lifting, volume trimmed ~25% to protect the aerobic work.',
      };
    case 'peak':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.peak,
        includesPlyometrics: false,
        volumeReduction: STRENGTH_BUILD_VOLUME_REDUCTION,
        note: 'Maintenance only — heavy, but very low volume. You keep the adaptation without the fatigue.',
      };
    case 'taper':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.taper,
        includesPlyometrics: false,
        volumeReduction: STRENGTH_BUILD_VOLUME_REDUCTION,
        note: 'One session in the first taper week, then nothing inside the final 10 days.',
      };
    case 'recovery':
    case 'race_week':
    case 'transition':
      return null;
  }
}

export interface StrengthDayContext {
  isRecoveryDay: boolean;
  /** Hours between this lift and the nearest key aerobic session that day. */
  hoursFromKeyAerobic?: number;
  /** The next day holds a key S3 session. */
  nextDayIsKeyS3: boolean;
  /** Hours to the nearest long run, either side. Lower-body work needs 48 h clearance. */
  hoursFromLongRun?: number;
  isLowerBody: boolean;
  /** Days until the race; inside the taper lockout no strength is scheduled. */
  daysToRace?: number;
}

/** Why a day can't host the lift, per the §7.3 scheduling rules. Empty ⇒ it can. */
export function strengthDayBlockers(ctx: StrengthDayContext): string[] {
  const blockers: string[] = [];
  if (ctx.isRecoveryDay) blockers.push('RECOVERY_DAY');
  if (ctx.nextDayIsKeyS3) blockers.push('DAY_BEFORE_KEY_S3');
  if (ctx.hoursFromKeyAerobic !== undefined && ctx.hoursFromKeyAerobic < STRENGTH_MIN_HOURS_FROM_KEY_AEROBIC) {
    blockers.push('TOO_CLOSE_TO_KEY_AEROBIC');
  }
  if (ctx.isLowerBody && ctx.hoursFromLongRun !== undefined && ctx.hoursFromLongRun < 48) {
    blockers.push('WITHIN_48H_OF_LONG_RUN');
  }
  if (ctx.daysToRace !== undefined && ctx.daysToRace <= STRENGTH_TAPER_LOCKOUT_DAYS) {
    blockers.push('INSIDE_TAPER_LOCKOUT');
  }
  return blockers;
}
