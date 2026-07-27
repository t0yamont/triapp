/**
 * repositories/wellness.ts — the daily check-in read/write path (§10.1).
 *
 * `daily_metrics` is keyed on (athlete_id, date), so a check-in is an upsert: an athlete
 * revising this morning's numbers updates the day rather than creating a second one. The
 * derived readiness columns are written alongside the raw inputs, because §10.1's score
 * depends on 60 days of history and recomputing it for every past day on every read would
 * be wasteful — the stored value is the engine's answer *at the time*, kept for display.
 */

import { addDaysISO } from '@ironflow/core/physio';
import type { AdaptationAction, DailyWellness, PlanMutation, Readiness, SZone } from '@ironflow/core/physio';
import type { TriflowClient } from '../client.js';
import { insertPlanMutations } from './notifications.js';
import type { Json } from '../database.types.js';
import type { Tables } from '../types.js';

/** What an athlete can enter each morning. All optional — a skipped field is not a zero. */
export interface DailyCheckIn {
  hrvRmssd?: number;
  restingHr?: number;
  sleepDurationMin?: number;
  /** 1–5, higher is better (5 = fresh / loose / calm / good mood). */
  wellnessFatigue?: number;
  wellnessSoreness?: number;
  wellnessStress?: number;
  wellnessMood?: number;
  illnessFlag?: boolean;
  injuryFlag?: boolean;
}

/** Map a stored row to the engine's input shape. */
export function toDailyWellness(row: Tables<'daily_metrics'>): DailyWellness {
  return {
    date: row.date,
    ...(row.hrv_rmssd !== null ? { hrvRmssd: row.hrv_rmssd } : {}),
    ...(row.resting_hr !== null ? { restingHr: row.resting_hr } : {}),
    ...(row.sleep_duration_min !== null ? { sleepDurationMin: row.sleep_duration_min } : {}),
    ...(row.wellness_fatigue !== null ? { wellnessFatigue: row.wellness_fatigue } : {}),
    ...(row.wellness_soreness !== null ? { wellnessSoreness: row.wellness_soreness } : {}),
    ...(row.wellness_stress !== null ? { wellnessStress: row.wellness_stress } : {}),
    ...(row.wellness_mood !== null ? { wellnessMood: row.wellness_mood } : {}),
  };
}

/** Daily rows in [fromDate, toDate] (inclusive ISO dates), oldest first. */
export async function getDailyMetricsInRange(
  client: TriflowClient,
  athleteId: string,
  fromDate: string,
  toDate: string,
): Promise<Tables<'daily_metrics'>[]> {
  const { data } = await client
    .from('daily_metrics')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true });
  return data ?? [];
}

/**
 * Save (or revise) one day's check-in, together with the readiness the engine derived from
 * it. `readiness` is optional because there may not yet be enough history to score — in
 * which case the raw inputs are still stored, and become history for a later day.
 */
export async function upsertDailyCheckIn(
  client: TriflowClient,
  athleteId: string,
  date: string,
  checkIn: DailyCheckIn,
  readiness?: Readiness,
): Promise<Tables<'daily_metrics'>> {
  const { data, error } = await client
    .from('daily_metrics')
    .upsert(
      {
        athlete_id: athleteId,
        date,
        hrv_rmssd: checkIn.hrvRmssd ?? null,
        resting_hr: checkIn.restingHr ?? null,
        sleep_duration_min: checkIn.sleepDurationMin ?? null,
        wellness_fatigue: checkIn.wellnessFatigue ?? null,
        wellness_soreness: checkIn.wellnessSoreness ?? null,
        wellness_stress: checkIn.wellnessStress ?? null,
        wellness_mood: checkIn.wellnessMood ?? null,
        illness_flag: checkIn.illnessFlag ?? false,
        injury_flag: checkIn.injuryFlag ?? false,
        readiness_score: readiness?.score ?? null,
        readiness_band: readiness?.band ?? null,
        readiness_inputs: (readiness?.components ?? null) as Json,
      },
      { onConflict: 'athlete_id,date' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ── Applying today's readiness adaptation (§10.2) ────────────────────────────

/** S1 < S2 < S3 — used only to enforce that adaptation never raises intensity. */
const ZONE_RANK: Record<SZone, number> = { S1: 1, S2: 2, S3: 3 };

/**
 * The zone today's session should end up in, or null for "leave it alone".
 *
 * §10.2 is **downgrade-only** (I12/I14): readiness recovering does not undo an easier day, so
 * an action that would raise the zone is treated as no change. Pure, so it is unit-tested.
 */
export function adaptedZone(action: AdaptationAction, current: SZone): SZone | null {
  const target: SZone | null =
    action === 'downgrade_s3_to_s2' ? 'S2' : action === 'none' ? null : 'S1';
  if (target === null) return null;
  return ZONE_RANK[target] < ZONE_RANK[current] ? target : null;
}

/**
 * Write today's readiness-driven downgrade: the session's new zone plus the audit row
 * (hard rule #10). `mutation` comes from `adaptToday`, so the stored reason is the engine's
 * own, with `actor: 'engine'` — this is not something the athlete asked for.
 *
 * As in `persistWorkoutMoves`, a failed audit insert rolls the zone change back rather than
 * leaving an unaudited plan change.
 *
 * Applies the week-level half too — `weekLoadDeltaPct` and `suppressS3Days`. Easing only today
 * was the wrong half to stop at: the rules that produce a week delta (`convert_week_to_recovery`,
 * the 2-day low-readiness rule) exist precisely because one eased session does not answer a
 * pattern, and an athlete flagged on Tuesday would train an unchanged Wednesday and Thursday.
 *
 * Both directions are downgrade-only (I12/I14): loads are scaled by a factor that is never above
 * 1, and S3 is suppressed to S2, never raised. Only *future* workouts are touched — rewriting a
 * session the athlete has already done would falsify the record.
 */
export interface WeekAdaptationTarget {
  id: string;
  scheduledDate: string;
  goalZone: SZone;
  plannedDurationMin: number;
  plannedLoad: number;
}

export interface WeekAdaptationChange {
  id: string;
  goalZone: SZone;
  plannedDurationMin: number;
  plannedLoad: number;
}

/**
 * What the week-level half of an adaptation does to the sessions still ahead.
 *
 * Pure, so the arithmetic and the downgrade-only guarantee are testable without a database.
 * Returns only rows that actually change — an unchanged session must not collect a write, a
 * new `updated_at`, or a device republish.
 */
export function planWeekAdaptation(
  future: readonly WeekAdaptationTarget[],
  adaptation: { weekLoadDeltaPct: number; suppressS3Days: number },
  today: string,
): WeekAdaptationChange[] {
  // I12: a readiness response may only ever reduce. A positive delta would be a bug upstream,
  // and clamping here means it cannot become an *increase* in an athlete's week.
  const scale = 1 + Math.min(0, adaptation.weekLoadDeltaPct) / 100;
  const suppressUntil = addDaysISO(today, Math.max(0, adaptation.suppressS3Days));

  const changes: WeekAdaptationChange[] = [];
  for (const w of future) {
    const suppressed = w.goalZone === 'S3' && w.scheduledDate <= suppressUntil;
    const goalZone: SZone = suppressed ? 'S2' : w.goalZone;
    const plannedDurationMin = Math.round(w.plannedDurationMin * scale);
    const plannedLoad = Math.round(w.plannedLoad * scale);

    if (goalZone === w.goalZone && plannedDurationMin === w.plannedDurationMin && plannedLoad === w.plannedLoad) continue;
    changes.push({ id: w.id, goalZone, plannedDurationMin, plannedLoad });
  }
  return changes;
}

export async function persistSessionAdaptation(
  client: TriflowClient,
  args: {
    athleteId: string;
    planId: string;
    workoutId: string;
    fromZone: SZone;
    toZone: SZone;
    mutation: PlanMutation;
    /** The week-level half. Omitted ⇒ today's session only. */
    adaptation?: { weekLoadDeltaPct: number; suppressS3Days: number };
    /** The athlete's local date; the week half only touches sessions after it. */
    today?: string;
  },
): Promise<void> {
  const { athleteId, planId, workoutId, fromZone, toZone, mutation, adaptation, today } = args;

  const setZone = async (zone: SZone): Promise<void> => {
    const { error } = await client
      .from('workouts')
      .update({ goal_zone: zone, updated_at: new Date().toISOString() })
      .eq('id', workoutId)
      .eq('athlete_id', athleteId);
    if (error) throw error;
  };

  await setZone(toZone);

  // The week-level half: everything still ahead of the athlete this week.
  const weekChanges: WeekAdaptationChange[] = [];
  const restore: WeekAdaptationChange[] = [];
  if (adaptation && today && (adaptation.weekLoadDeltaPct < 0 || adaptation.suppressS3Days > 0)) {
    const { data: future } = await client
      .from('workouts')
      .select('id, scheduled_date, goal_zone, planned_duration_min, planned_load')
      .eq('athlete_id', athleteId)
      .eq('plan_id', planId)
      .eq('status', 'scheduled')
      .gt('scheduled_date', today)
      .lte('scheduled_date', addDaysISO(today, 7));

    const targets = (future ?? []).map((w) => ({
      id: w.id,
      scheduledDate: w.scheduled_date,
      goalZone: w.goal_zone,
      plannedDurationMin: w.planned_duration_min,
      plannedLoad: w.planned_load,
    }));
    weekChanges.push(...planWeekAdaptation(targets, adaptation, today));
    restore.push(
      ...targets
        .filter((t) => weekChanges.some((c) => c.id === t.id))
        .map((t) => ({ id: t.id, goalZone: t.goalZone, plannedDurationMin: t.plannedDurationMin, plannedLoad: t.plannedLoad })),
    );

    for (const change of weekChanges) {
      const { error } = await client
        .from('workouts')
        .update({
          goal_zone: change.goalZone,
          planned_duration_min: change.plannedDurationMin,
          planned_load: change.plannedLoad,
          updated_at: new Date().toISOString(),
        })
        .eq('id', change.id)
        .eq('athlete_id', athleteId);
      if (error) {
        await revert(client, athleteId, restore);
        await setZone(fromZone).catch(() => undefined);
        throw error;
      }
    }
  }

  const { error: auditError } = await insertPlanMutations(client, [{
    athlete_id: athleteId,
    plan_id: planId,
    actor: mutation.actor,
    reason_code: mutation.reasonCode,
    reason_text: mutation.reasonText,
    ...(mutation.ruleId ? { rule_id: mutation.ruleId } : {}),
    affected_workout_ids: [workoutId, ...weekChanges.map((c) => c.id)],
    before: { goal_zone: fromZone, week: restore } as unknown as Json,
    after: { goal_zone: toZone, week: weekChanges } as unknown as Json,
  }]);

  if (auditError) {
    // An unaudited plan change violates hard rule #10 — undo all of it, not just today.
    await revert(client, athleteId, restore);
    await setZone(fromZone).catch(() => undefined); // the original failure is the one to report
    throw auditError;
  }
}

/** Put the week back as it was. Best-effort: the error being handled is the one worth raising. */
async function revert(client: TriflowClient, athleteId: string, previous: readonly WeekAdaptationChange[]): Promise<void> {
  for (const w of previous) {
    await client
      .from('workouts')
      .update({ goal_zone: w.goalZone, planned_duration_min: w.plannedDurationMin, planned_load: w.plannedLoad })
      .eq('id', w.id)
      .eq('athlete_id', athleteId)
      .then(undefined, () => undefined);
  }
}
