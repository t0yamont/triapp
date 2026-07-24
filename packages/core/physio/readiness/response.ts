/**
 * readiness/response.ts — asymmetric daily response rules (§10.2). A bad signal can reduce
 * today's load immediately; a good signal can NEVER increase it (increases happen only at
 * weekly boundaries, on multi-day evidence — §0.5, invariant I12). Every change emits
 * exactly one plan_mutations row with a machine-readable reason and an athlete-readable
 * sentence (I13, P1).
 */

import {
  READINESS_BELOW_DAYS_RECOVERY,
  READINESS_BELOW_DAYS_REDUCE,
  READINESS_BELOW_DAYS_S3_DOWNGRADE,
  READINESS_HRV_CRASH_SD,
  READINESS_RHR_ELEVATED_BPM,
  READINESS_RHR_ELEVATED_DAYS,
  READINESS_S3_SUPPRESSION_DAYS,
  READINESS_WEEK_REDUCTION_FRAC,
  RECOVERY_WEEK_LOAD_FRACTION,
} from '../constants.js';
import type { PlanMutation, SZone } from '../types.js';

export interface DailyReadiness {
  band: 'below' | 'within' | 'above' | 'unknown';
  /** HRV standardised deviation (for the >2 SD crash rule). */
  hrvZ?: number;
  /** Resting HR above the 60-day baseline, bpm (for the >7 bpm rule). */
  restingHrDeltaBpm?: number;
}

export type AdaptationAction =
  | 'none'
  | 'downgrade_s3_to_s2'
  | 'reduce_to_s1_or_rest'
  | 'convert_week_to_recovery';

/** Machine-readable reason codes for the audit row (rule #10, P1). One per response rule. */
export const READINESS_REASON = {
  MULTIDAY_LOW: 'READINESS_MULTIDAY_LOW',
  RHR_ELEVATED_2DAY: 'RHR_ELEVATED_2DAY',
  TWO_DAY_LOW: 'READINESS_2DAY_LOW',
  ONE_DAY_S3_DOWNGRADE: 'READINESS_1DAY_S3_DOWNGRADE',
} as const;

export interface AdaptationResult {
  action: AdaptationAction;
  /** Change to the week's load target, in percent. Always ≤ 0 (I12). */
  weekLoadDeltaPct: number;
  /** Days for which all S3 is suppressed. */
  suppressS3Days: number;
  illnessPrompt: boolean;
  /** Present iff a change was made (I13). */
  mutation?: PlanMutation;
}

const NONE: AdaptationResult = { action: 'none', weekLoadDeltaPct: 0, suppressS3Days: 0, illnessPrompt: false };

/** −38 for a 62% recovery target: the mid-week conversion trims the week to that fraction. */
const RECOVERY_DELTA_PCT = Math.round((RECOVERY_WEEK_LOAD_FRACTION - 1) * 100);
const REDUCE_DELTA_PCT = -Math.round(READINESS_WEEK_REDUCTION_FRAC * 100);

/** Count trailing entries (most recent last) that satisfy the predicate. */
function trailingCount<T>(arr: T[], pred: (x: T) => boolean): number {
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) n += 1;
    else break;
  }
  return n;
}

const mutation = (reasonCode: string, reasonText: string): PlanMutation => ({ actor: 'engine', reasonCode, reasonText });

/**
 * Resolve today's adaptation from the recent readiness history (most recent last) and the
 * session scheduled today. Rules are checked most-severe first.
 */
export function adaptToday(history: DailyReadiness[], todaySZone: SZone): AdaptationResult {
  const today = history[history.length - 1];
  const belowDays = trailingCount(history, (d) => d.band === 'below');
  const rhrElevatedDays = trailingCount(history, (d) => (d.restingHrDeltaBpm ?? 0) > READINESS_RHR_ELEVATED_BPM);

  if (belowDays >= READINESS_BELOW_DAYS_RECOVERY || (today?.hrvZ !== undefined && today.hrvZ < -READINESS_HRV_CRASH_SD)) {
    return {
      action: 'convert_week_to_recovery',
      weekLoadDeltaPct: RECOVERY_DELTA_PCT, // to ~62% — recovery-week parameters (§10.2)
      suppressS3Days: READINESS_S3_SUPPRESSION_DAYS,
      illnessPrompt: true,
      mutation: mutation(
        READINESS_REASON.MULTIDAY_LOW,
        "Converted the rest of this week to recovery — your readiness has been low for several days, so it's worth considering whether you're coming down with something.",
      ),
    };
  }

  if (rhrElevatedDays >= READINESS_RHR_ELEVATED_DAYS) {
    return {
      action: 'reduce_to_s1_or_rest',
      weekLoadDeltaPct: REDUCE_DELTA_PCT,
      suppressS3Days: 0,
      illnessPrompt: true,
      mutation: mutation(
        READINESS_REASON.RHR_ELEVATED_2DAY,
        'Made today easy and trimmed this week 10% — your resting heart rate has been elevated for two days.',
      ),
    };
  }

  if (belowDays >= READINESS_BELOW_DAYS_REDUCE) {
    return {
      action: 'reduce_to_s1_or_rest',
      weekLoadDeltaPct: REDUCE_DELTA_PCT,
      suppressS3Days: 0,
      illnessPrompt: false,
      mutation: mutation(
        READINESS_REASON.TWO_DAY_LOW,
        'Made today easy and trimmed this week 10% — your HRV has been below your normal range for two days.',
      ),
    };
  }

  if (belowDays >= READINESS_BELOW_DAYS_S3_DOWNGRADE && todaySZone === 'S3') {
    return {
      action: 'downgrade_s3_to_s2',
      weekLoadDeltaPct: 0,
      suppressS3Days: 0,
      illnessPrompt: false,
      mutation: mutation(
        READINESS_REASON.ONE_DAY_S3_DOWNGRADE,
        "Eased today's hard session from S3 to S2 — your readiness dipped below normal yesterday.",
      ),
    };
  }

  return NONE;
}
