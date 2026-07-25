/**
 * plan/replan.ts — weekly re-planning triggers (§10.3), evaluated at the week boundary. These
 * are the slow, evidence-based adjustments (as opposed to the daily readiness response in
 * §10.2). The governing principle: *adjust the plan, not the athlete.* Under-completion means
 * the plan asked too much; an apparent fitness gain is verified with a test, never assumed.
 * Every decision is one audited, athlete-readable mutation (I13, P1).
 */

import {
  BODY_MASS_CHANGE_FRAC,
  BODY_MASS_CHANGE_WEEKS,
  COMPLETION_HIGH_FRAC,
  COMPLETION_HIGH_WEEKS,
  COMPLETION_LOW_FRAC,
  COMPLETION_LOW_TARGET_BUMP,
  COMPLETION_LOW_WEEKS,
  DISTRIBUTION_ROLLING_WEEKS,
  DISTRIBUTION_TOLERANCE,
  HR_PACE_DRIFT_FRAC,
  HR_PACE_DRIFT_WEEKS,
} from '../constants.js';
import type { PlanMutation, SZone } from '../types.js';
import type { Distribution } from './types.js';

export type ReplanAction =
  | 'reduce_weekly_target'
  | 'permit_full_ramp'
  | 'schedule_fitness_test'
  | 'recompute_wkg'
  | 'shift_to_aerobic'
  | 'adjust_distribution';

export interface ReplanDecision {
  action: ReplanAction;
  reasonCode: string;
  reasonText: string;
  /** New weekly load target (reduce_weekly_target only). */
  newWeeklyTarget?: number;
  /** Body-mass change was not explained by a logged cause (recompute_wkg only). */
  flagUnexplained?: boolean;
  mutation: PlanMutation;
}

export interface WeeklyReplanContext {
  /** Completion rate per recent week (0..1), most recent last. */
  completionByWeek: number[];
  /** Actual load achieved last week — the basis for a target reduction. */
  actualLoadLastWeek: number;
  /** How many recent weeks carried a readiness flag. */
  readinessFlaggedWeeks: number;
  /** Consecutive weeks readiness has been stable. */
  readinessStableWeeks: number;
  /** HR at a fixed grade-adjusted pace: fractional change over the window (negative = HR fell = fitter). */
  hrAtPaceChangeFrac?: number;
  hrAtPaceWeeks?: number;
  /** Rolling 3-week actual distribution and its phase target, for the drift check. */
  rolling3wkDistribution?: Distribution;
  distributionTarget?: Distribution;
  /** Body-mass fractional change over the window and whether it has a logged cause. */
  bodyMassChangeFrac?: number;
  bodyMassChangeWeeks?: number;
  bodyMassExplained?: boolean;
  /** §11 durability index trending worse while fitness rises. */
  durabilityWorsening?: boolean;
}

/** One completed training week, as the athlete actually trained it. Oldest first. */
export interface ReplanWeekSummary {
  /** ISO date of the week's Monday. */
  weekStart: string;
  /** What the plan asked for. */
  plannedLoad: number;
  /** What was actually completed. */
  completedLoad: number;
  /** Minutes actually spent in each accounting zone — summed, not averaged, so several
   * weeks can be combined without a weighting choice. */
  zoneMinutes: Record<SZone, number>;
  /** True if any day that week fell below the SWC band (§10.1). */
  readinessFlagged: boolean;
}

/**
 * Assemble the §10.3 context from weeks the athlete has actually trained.
 *
 * Every field this cannot know is left **undefined** rather than defaulted, because
 * `weeklyReplan` reads undefined as "no evidence" and simply doesn't fire that trigger.
 * Defaulting (say, `hrAtPaceChangeFrac: 0`) would instead assert "measured, and unchanged" —
 * evidence the athlete never provided. The triggers needing ingested activity data
 * (`hrAtPaceChangeFrac`, `durabilityWorsening`) and body mass therefore stay silent until
 * something real supplies them.
 */
export function buildReplanContext(
  weeks: readonly ReplanWeekSummary[],
  distributionTarget?: Distribution,
): WeeklyReplanContext {
  const completionByWeek = weeks.map((w) => (w.plannedLoad > 0 ? w.completedLoad / w.plannedLoad : 0));
  const last = weeks[weeks.length - 1];

  // Trailing run of weeks with no readiness flag — "stable" means recently and continuously so.
  let readinessStableWeeks = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i]!.readinessFlagged) break;
    readinessStableWeeks += 1;
  }

  const recent = weeks.slice(-DISTRIBUTION_ROLLING_WEEKS);
  const totals = ZONES.reduce(
    (acc, z) => ({ ...acc, [z]: recent.reduce((a, w) => a + w.zoneMinutes[z], 0) }),
    {} as Record<SZone, number>,
  );
  const totalMinutes = ZONES.reduce((a, z) => a + totals[z], 0);
  const rolling3wkDistribution =
    recent.length === DISTRIBUTION_ROLLING_WEEKS && totalMinutes > 0
      ? (Object.fromEntries(ZONES.map((z) => [z, Math.round((totals[z] / totalMinutes) * 100)])) as Distribution)
      : undefined;

  return {
    completionByWeek,
    actualLoadLastWeek: last?.completedLoad ?? 0,
    readinessFlaggedWeeks: weeks.filter((w) => w.readinessFlagged).length,
    readinessStableWeeks,
    ...(rolling3wkDistribution && distributionTarget ? { rolling3wkDistribution, distributionTarget } : {}),
  };
}

const audit = (reasonCode: string, reasonText: string): PlanMutation => ({
  actor: 'engine',
  reasonCode,
  reasonText,
  ruleId: '10.3',
});

/** Do the last `n` entries all satisfy `pred`? (Trailing, most-recent-last.) */
function trailingAll(arr: number[], n: number, pred: (x: number) => boolean): boolean {
  if (arr.length < n) return false;
  return arr.slice(arr.length - n).every(pred);
}

const ZONES: readonly SZone[] = ['S1', 'S2', 'S3'];

/**
 * Every §10.3 trigger that fires this week, in evaluation order. Triggers are independent —
 * a week can raise several. An empty list means the plan is on track.
 */
export function weeklyReplan(ctx: WeeklyReplanContext): ReplanDecision[] {
  const decisions: ReplanDecision[] = [];

  // Chronic under-completion with no readiness flags: the plan is too hard, not the athlete.
  if (ctx.readinessFlaggedWeeks === 0 && trailingAll(ctx.completionByWeek, COMPLETION_LOW_WEEKS, (x) => x < COMPLETION_LOW_FRAC)) {
    const newWeeklyTarget = Math.round(ctx.actualLoadLastWeek * (1 + COMPLETION_LOW_TARGET_BUMP));
    decisions.push({
      action: 'reduce_weekly_target',
      reasonCode: 'REPLAN_UNDERCOMPLETION',
      reasonText: `You've been missing sessions two weeks running with good readiness, so the plan was asking too much — trimmed next week's target to about what you're actually doing, plus a little.`,
      newWeeklyTarget,
      mutation: audit('REPLAN_UNDERCOMPLETION', 'Reduced the weekly target to your recent actual load + 5% after two weeks of under-completion.'),
    });
  }

  // Consistent over-completion with stable readiness: earn the full progression cap.
  if (
    ctx.readinessStableWeeks >= COMPLETION_HIGH_WEEKS &&
    trailingAll(ctx.completionByWeek, COMPLETION_HIGH_WEEKS, (x) => x > COMPLETION_HIGH_FRAC)
  ) {
    decisions.push({
      action: 'permit_full_ramp',
      reasonCode: 'REPLAN_FULL_RAMP',
      reasonText: "You've nailed three weeks straight with steady readiness — you've earned a full-size step up next week.",
      mutation: audit('REPLAN_FULL_RAMP', 'Permitted the full G1 ramp cap after 3 weeks >95% completion with stable readiness.'),
    });
  }

  // Apparent fitness gain: schedule a test rather than silently upgrading thresholds.
  if (
    ctx.hrAtPaceChangeFrac !== undefined &&
    (ctx.hrAtPaceWeeks ?? 0) >= HR_PACE_DRIFT_WEEKS &&
    ctx.hrAtPaceChangeFrac <= -HR_PACE_DRIFT_FRAC
  ) {
    decisions.push({
      action: 'schedule_fitness_test',
      reasonCode: 'REPLAN_APPARENT_FITNESS_GAIN',
      reasonText: 'Your heart rate at the same pace has dropped for a few weeks — scheduled a test to confirm the gain before moving your zones.',
      mutation: audit('REPLAN_APPARENT_FITNESS_GAIN', 'Scheduled a confirmatory field test after a ≥3% HR-at-pace improvement over 3+ weeks.'),
    });
  }

  // Rolling 3-week distribution outside tolerance: nudge next week's session mix.
  if (ctx.rolling3wkDistribution && ctx.distributionTarget) {
    const dist = ctx.rolling3wkDistribution;
    const target = ctx.distributionTarget;
    if (ZONES.some((z) => Math.abs(dist[z] - target[z]) > DISTRIBUTION_TOLERANCE[z])) {
      decisions.push({
        action: 'adjust_distribution',
        reasonCode: 'REPLAN_DISTRIBUTION_DRIFT',
        reasonText: 'Your intensity mix has drifted from the plan over the last three weeks — adjusted next week to bring it back.',
        mutation: audit('REPLAN_DISTRIBUTION_DRIFT', 'Adjusted the session mix after the rolling 3-week distribution drifted beyond tolerance.'),
      });
    }
  }

  // Meaningful body-mass change: recompute W/kg targets, flag if there's no logged cause.
  if (
    ctx.bodyMassChangeFrac !== undefined &&
    (ctx.bodyMassChangeWeeks ?? 0) >= BODY_MASS_CHANGE_WEEKS &&
    Math.abs(ctx.bodyMassChangeFrac) > BODY_MASS_CHANGE_FRAC
  ) {
    decisions.push({
      action: 'recompute_wkg',
      reasonCode: 'REPLAN_BODY_MASS_CHANGE',
      reasonText: 'Your body mass has moved more than 3% — recomputed your power-to-weight targets.',
      flagUnexplained: !ctx.bodyMassExplained,
      mutation: audit('REPLAN_BODY_MASS_CHANGE', 'Recomputed W/kg targets after a >3% body-mass change over 4 weeks.'),
    });
  }

  // Durability worsening while fitness rises (§11): more aerobic volume, less intensity.
  if (ctx.durabilityWorsening) {
    decisions.push({
      action: 'shift_to_aerobic',
      reasonCode: 'REPLAN_DURABILITY',
      reasonText: 'Your late-session fatigue resistance is slipping — shifting next week toward long aerobic volume and easing off the hard stuff.',
      mutation: audit('REPLAN_DURABILITY', 'Increased long-session aerobic volume and reduced S3 after a worsening durability trend.'),
    });
  }

  return decisions;
}
