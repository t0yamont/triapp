/**
 * repositories/wellness.ts — the daily check-in read/write path (§10.1).
 *
 * `daily_metrics` is keyed on (athlete_id, date), so a check-in is an upsert: an athlete
 * revising this morning's numbers updates the day rather than creating a second one. The
 * derived readiness columns are written alongside the raw inputs, because §10.1's score
 * depends on 60 days of history and recomputing it for every past day on every read would
 * be wasteful — the stored value is the engine's answer *at the time*, kept for display.
 */

import type { AdaptationAction, DailyWellness, PlanMutation, Readiness, SZone } from '@ironflow/core/physio';
import type { TriflowClient } from '../client.js';
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
 * ponytail: applies the *day* part of the adaptation only. `weekLoadDeltaPct` and
 * `suppressS3Days` (the week-level half of `convert_week_to_recovery` and the 2-day rule) are
 * not applied to future workouts yet — that belongs with `weeklyReplan`, and the audit row
 * records the full reason in the meantime so nothing is lost.
 */
export async function persistSessionAdaptation(
  client: TriflowClient,
  args: {
    athleteId: string;
    planId: string;
    workoutId: string;
    fromZone: SZone;
    toZone: SZone;
    mutation: PlanMutation;
  },
): Promise<void> {
  const { athleteId, planId, workoutId, fromZone, toZone, mutation } = args;

  const setZone = async (zone: SZone): Promise<void> => {
    const { error } = await client
      .from('workouts')
      .update({ goal_zone: zone, updated_at: new Date().toISOString() })
      .eq('id', workoutId)
      .eq('athlete_id', athleteId);
    if (error) throw error;
  };

  await setZone(toZone);

  const { error: auditError } = await client.from('plan_mutations').insert({
    athlete_id: athleteId,
    plan_id: planId,
    actor: mutation.actor,
    reason_code: mutation.reasonCode,
    reason_text: mutation.reasonText,
    ...(mutation.ruleId ? { rule_id: mutation.ruleId } : {}),
    affected_workout_ids: [workoutId],
    before: { goal_zone: fromZone } as Json,
    after: { goal_zone: toZone } as Json,
  });

  if (auditError) {
    await setZone(fromZone).catch(() => undefined); // the original failure is the one to report
    throw auditError;
  }
}
