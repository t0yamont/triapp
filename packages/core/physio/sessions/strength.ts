/**
 * sessions/strength.ts — strength prescription and its scheduling rules (§7.3).
 *
 * Heavy resistance training improves running economy with a consistent, larger effect than
 * plyometric-dominant work, and improves economy specifically *under fatigue* — a durability
 * mechanism (Eihara et al. 2022; Zanini et al. 2025). The scheduling rules exist so it never
 * costs the aerobic work it is meant to support.
 *
 * **Two r2 corrections (§7.3).**
 *
 * 1. *The effect is speed-dependent, and the engine can act on it.* Separating methods by the
 *    speed at which economy was measured, heavy strength was most effective at higher speeds,
 *    plyometric below ≈12 km/h, combined in the ≈10–14.5 km/h band — and submaximal 40–79% 1RM
 *    loading did **not** improve economy at all (Llanos-Lagos et al. 2024, Sports Med
 *    54:895–932). Since the engine knows the athlete's threshold pace, it prescribes from their
 *    band. A 4:45/km age-grouper and a 3:20/km athlete are not in the same evidence bucket.
 * 2. *Expectations, honestly.* A companion meta-analysis found **none** of the strength methods
 *    improved VO₂max, velocity at VO₂max, maximal metabolic steady state or sprint capacity
 *    (Llanos-Lagos et al. 2024, Sports Med 54:1801–1833). Strength earns its place through
 *    economy and fatigue resistance only — the UI must not imply otherwise, and the engine must
 *    never schedule a test expecting strength work to have raised a threshold.
 */

import {
  STRENGTH_BUILD_VOLUME_REDUCTION,
  STRENGTH_HEAVY_PCT_1RM,
  STRENGTH_HEAVY_REPS,
  STRENGTH_HEAVY_SETS,
  STRENGTH_MIN_HOURS_FROM_KEY_AEROBIC,
  STRENGTH_SESSIONS_PER_WEEK,
  STRENGTH_SPEED_BANDS_KMH,
  STRENGTH_TAPER_LOCKOUT_DAYS,
} from '../constants.js';
import type { PlanPhase } from '../plan/types.js';

/** Which method the athlete's race-pace band supports (§7.3). */
export type StrengthEmphasis = 'plyometric' | 'combined' | 'heavy';

export interface StrengthEmphasisResult {
  emphasis: StrengthEmphasis;
  /** The lower-volume method run alongside it, where one is indicated. */
  secondary?: StrengthEmphasis;
  /** True when threshold speed is unknown or too poorly known to prescribe from. */
  conservative: boolean;
  reasonText: string;
}

/**
 * Pick the emphasis from the athlete's speed at LT2, in km/h.
 *
 * Unknown speed — or anchor confidence below 0.5 — falls back to combined work at conservative
 * loading and schedules the test, rather than defaulting everyone to heavy compound lifting the
 * way r1 did.
 */
export function strengthEmphasis(thresholdSpeedKmh?: number, anchorConfidence = 1): StrengthEmphasisResult {
  if (thresholdSpeedKmh === undefined || anchorConfidence < 0.5) {
    return {
      emphasis: 'combined',
      conservative: true,
      reasonText:
        'We don’t know your threshold pace well enough yet, so strength work stays combined and conservative until a test settles it.',
    };
  }
  if (thresholdSpeedKmh < STRENGTH_SPEED_BANDS_KMH.plyoBelow) {
    return {
      emphasis: 'plyometric',
      secondary: 'heavy',
      conservative: false,
      reasonText:
        'At your race pace, reactive and plyometric work is what improves running economy most — heavy lifting stays in, at lower volume.',
    };
  }
  if (thresholdSpeedKmh <= STRENGTH_SPEED_BANDS_KMH.combinedUpper) {
    return {
      emphasis: 'combined',
      conservative: false,
      reasonText: 'Your race pace sits in the band where combined heavy and plyometric work has the strongest evidence.',
    };
  }
  return {
    emphasis: 'heavy',
    secondary: 'plyometric',
    conservative: false,
    reasonText: 'At your race pace, heavy compound lifting is the method with the clearest economy benefit.',
  };
}

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
  /** Which method leads, from the athlete's threshold speed (r2, §7.3). */
  emphasis?: StrengthEmphasisResult;
}

/**
 * The §7.3 prescription for a phase. Race week and the final taper days carry none.
 *
 * `thresholdSpeedKmh` and `anchorConfidence` select the emphasis; omit them and the
 * prescription is the conservative combined default with a test scheduled.
 */
export function strengthPrescription(
  phase: PlanPhase,
  thresholdSpeedKmh?: number,
  anchorConfidence = 1,
): StrengthPrescription | null {
  const heavy = { sets: STRENGTH_HEAVY_SETS, reps: STRENGTH_HEAVY_REPS, pct1RM: STRENGTH_HEAVY_PCT_1RM };
  const emphasis = strengthEmphasis(thresholdSpeedKmh, anchorConfidence);

  switch (phase) {
    case 'base':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.base,
        includesPlyometrics: true,
        volumeReduction: 0,
        note: 'Heavy compound lifting plus one plyometric block — the biggest economy gains come from this phase.',
        emphasis,
      };
    case 'build':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.build,
        // A plyometric-emphasis athlete keeps the reactive block past Base: for them it is the
        // primary economy driver, not the optional extra it is for a fast runner (r2, §7.3).
        includesPlyometrics: emphasis.emphasis === 'plyometric',
        volumeReduction: STRENGTH_BUILD_VOLUME_REDUCTION,
        note: 'Same lifting, volume trimmed ~25% to protect the aerobic work.',
        emphasis,
      };
    case 'peak':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.peak,
        includesPlyometrics: false,
        volumeReduction: STRENGTH_BUILD_VOLUME_REDUCTION,
        note: 'Maintenance only — heavy, but very low volume. You keep the adaptation without the fatigue.',
        emphasis,
      };
    case 'taper':
      return {
        ...heavy,
        sessionsPerWeek: STRENGTH_SESSIONS_PER_WEEK.taper,
        includesPlyometrics: false,
        volumeReduction: STRENGTH_BUILD_VOLUME_REDUCTION,
        note: 'One session in the first taper week, then nothing inside the final 10 days.',
        emphasis,
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
