/**
 * repositories/replan.ts — the §10.3 weekly re-planning read/write path.
 *
 * `weeklyReplan` is a pure decision function; this supplies it with weeks the athlete has
 * actually trained, and writes the audited consequences. Deliberately separate from the
 * daily readiness response (§10.2) — these are the slow, evidence-based adjustments.
 */

import { addDaysISO, daysBetweenISO, type ReplanDecision, type ReplanWeekSummary, type SZone } from '@ironflow/core/physio';
import type { TriflowClient } from '../client.js';
import { insertPlanMutations } from './notifications.js';
import type { Json } from '../database.types.js';
import type { Tables } from '../types.js';

const DAYS_PER_WEEK = 7;

/**
 * Fold persisted rows into the per-week shape §10.3 reasons over.
 *
 * Only **finished** weeks are included: a week still in progress always looks like
 * under-completion, and would trip `REPLAN_UNDERCOMPLETION` every time it was evaluated
 * mid-week. `today` decides what has finished, and is passed in rather than read from the
 * clock so this stays testable.
 */
export function toReplanWeekSummaries(
  planWeeks: readonly Tables<'plan_weeks'>[],
  workouts: readonly Tables<'workouts'>[],
  daily: readonly Tables<'daily_metrics'>[],
  today: string,
): ReplanWeekSummary[] {
  return [...planWeeks]
    .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))
    .filter((w) => daysBetweenISO(addDaysISO(w.week_start_date, DAYS_PER_WEEK - 1), today) > 0)
    .map((planWeek) => {
      const end = addDaysISO(planWeek.week_start_date, DAYS_PER_WEEK - 1);
      const inWeek = workouts.filter((w) => w.scheduled_date >= planWeek.week_start_date && w.scheduled_date <= end);
      const done = inWeek.filter((w) => w.status === 'completed');

      const zoneMinutes: Record<SZone, number> = { S1: 0, S2: 0, S3: 0 };
      for (const w of done) zoneMinutes[w.goal_zone] += w.planned_duration_min;

      return {
        weekStart: planWeek.week_start_date,
        plannedLoad: inWeek.reduce((a, w) => a + Number(w.planned_load), 0),
        completedLoad: done.reduce((a, w) => a + Number(w.planned_load), 0),
        zoneMinutes,
        // §10.1's own verdict for those days, as stored — not recomputed here.
        readinessFlagged: daily.some(
          (d) => d.date >= planWeek.week_start_date && d.date <= end && d.readiness_band === 'below',
        ),
      };
    });
}

/**
 * Commit this week's re-planning decisions: one `plan_mutations` row each (hard rule #10,
 * I13), plus the one consequence that is a concrete number — `reduce_weekly_target` rewrites
 * the upcoming week's `load_target`.
 *
 * The other actions (`permit_full_ramp`, `schedule_fitness_test`, `adjust_distribution`,
 * `recompute_wkg`, `shift_to_aerobic`) are recorded but not yet applied: each one changes how
 * the *next* week is generated, and plan regeneration isn't wired. Auditing them now means the
 * reasoning is preserved and visible in the data rather than lost — see D-REPLAN-WIRING.
 */
export async function persistReplanDecisions(
  client: TriflowClient,
  args: {
    athleteId: string;
    planId: string;
    decisions: readonly ReplanDecision[];
    /** The upcoming week, whose target a reduction applies to. */
    nextWeek?: Tables<'plan_weeks'> | null;
  },
): Promise<void> {
  const { athleteId, planId, decisions, nextWeek } = args;
  if (decisions.length === 0) return;

  const reduce = decisions.find((d) => d.action === 'reduce_weekly_target');
  const priorTarget = nextWeek ? Number(nextWeek.load_target) : null;
  const applyTarget = reduce?.newWeeklyTarget !== undefined && nextWeek ? reduce.newWeeklyTarget : null;

  if (applyTarget !== null && nextWeek) {
    const { error } = await client
      .from('plan_weeks')
      .update({ load_target: applyTarget })
      .eq('id', nextWeek.id);
    if (error) throw error;
  }

  const { error: auditError } = await insertPlanMutations(
    client,
    decisions.map((d) => ({
      athlete_id: athleteId,
      plan_id: planId,
      actor: d.mutation.actor,
      reason_code: d.mutation.reasonCode,
      reason_text: d.mutation.reasonText,
      ...(d.mutation.ruleId ? { rule_id: d.mutation.ruleId } : {}),
      ...(d.action === 'reduce_weekly_target' && nextWeek
        ? {
            affected_week_ids: [nextWeek.id],
            before: { load_target: priorTarget } as Json,
            after: { load_target: applyTarget } as Json,
          }
        : {}),
    })),
  );

  if (auditError) {
    // Never leave the target changed without its audit row (hard rule #10).
    if (applyTarget !== null && nextWeek && priorTarget !== null) {
      await client.from('plan_weeks').update({ load_target: priorTarget }).eq('id', nextWeek.id);
    }
    throw auditError;
  }
}
