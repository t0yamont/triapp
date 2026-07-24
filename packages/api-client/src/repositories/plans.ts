/**
 * repositories/plans.ts — the plan write/read path.
 *
 * Persists a `GeneratedPlan` (from @ironflow/core/physio `generatePlan`) to
 * training_plans → plan_weeks → workouts, and reads it back. Pure mappers are unit-tested;
 * the async orchestration is typed against the generated `Database`, so a column/enum
 * mismatch is a compile error. Under RLS the athlete's own client inserts rows scoped to
 * their id; the service-role client bypasses RLS, so callers scope by athlete_id explicitly.
 */

import {
  addDaysISO,
  distributionTarget,
  type CourseType,
  type GeneratedPlan,
  type PlanSport,
  type PlanWeekResult,
  type ScheduledWorkout,
  type SessionPurpose,
} from '@ironflow/core/physio';
import type { IronflowClient } from '../client.js';
import type { Json } from '../database.types.js';
import type { Tables, TablesInsert } from '../types.js';

// ── Pure mappers (unit-tested) ───────────────────────────────────────────────

const SPORT_NAME: Record<PlanSport, string> = { run: 'Run', bike: 'Ride', swim: 'Swim', brick: 'Brick', strength: 'Strength' };

/**
 * ponytail: minimal materialisation of a scheduled session into a concrete workout. The
 * engine's sessions are zone-and-duration shaped; purpose/name/structure are derived here.
 * A richer render (from sessions/library) is the follow-up — the shape below is persistence-valid.
 */
export function workoutPurpose(sw: ScheduledWorkout): SessionPurpose {
  return sw.isHard ? 'vo2max' : 'aerobic_volume';
}

export function workoutName(sw: ScheduledWorkout): string {
  return sw.isHard ? `${SPORT_NAME[sw.sport]} intervals` : `${SPORT_NAME[sw.sport]} — aerobic`;
}

export function workoutTemplateId(sw: ScheduledWorkout): string {
  return `${sw.sport}.${sw.sZone.toLowerCase()}${sw.isHard ? '.key' : ''}`;
}

function workoutStructure(sw: ScheduledWorkout): Json {
  return { kind: sw.isHard ? 'intervals' : 'steady', durationMin: sw.durationMin, goalZone: sw.sZone };
}

export function toWorkoutRow(
  athleteId: string,
  planId: string,
  planWeekId: string,
  sw: ScheduledWorkout,
): TablesInsert<'workouts'> {
  return {
    athlete_id: athleteId,
    plan_id: planId,
    plan_week_id: planWeekId,
    scheduled_date: sw.scheduledDate,
    sport: sw.sport,
    template_id: workoutTemplateId(sw),
    name: workoutName(sw),
    purpose: workoutPurpose(sw),
    goal_zone: sw.sZone,
    is_key_session: sw.isHard,
    planned_duration_min: sw.durationMin,
    planned_load: sw.load,
    structure: workoutStructure(sw),
  };
}

export function toPlanWeekRow(planId: string, planStartDate: string, w: PlanWeekResult, course: CourseType): TablesInsert<'plan_weeks'> {
  const hoursTarget = Math.round((w.week.sessions.reduce((a, s) => a + s.durationMin, 0) / 60) * 10) / 10;
  return {
    plan_id: planId,
    week_number: w.weekNumber,
    week_start_date: addDaysISO(planStartDate, (w.weekNumber - 1) * 7),
    phase: w.phase,
    is_recovery_week: w.isRecoveryWeek,
    load_target: w.loadTarget,
    hours_target: hoursTarget,
    distribution_target: distributionTarget(w.phase, course) as unknown as Json,
  };
}

export interface GeneratedPlanMeta {
  name: string;
  primaryRaceId?: string | null;
  /** AthleteModel at generation time, snapshotted so a plan can always be explained. */
  modelSnapshot: Json;
  availabilitySnapshot: Json;
  distributionPolicy: Json;
  engineVersion: string;
  course: CourseType;
}

export function toTrainingPlanRow(athleteId: string, plan: GeneratedPlan, meta: GeneratedPlanMeta): TablesInsert<'training_plans'> {
  return {
    athlete_id: athleteId,
    primary_race_id: meta.primaryRaceId ?? null,
    name: meta.name,
    start_date: plan.startDate,
    end_date: plan.endDate,
    model_snapshot: meta.modelSnapshot,
    availability_snapshot: meta.availabilitySnapshot,
    distribution_policy: meta.distributionPolicy,
    engine_version: meta.engineVersion,
  };
}

// ── Write orchestration ──────────────────────────────────────────────────────

/**
 * Persist a generated plan: one training_plans row, its plan_weeks, then all workouts wired
 * to their week. Returns the new plan id. Throws on the first failed insert (the caller should
 * run this server-side; a real transaction would use an Edge Function / RPC — see follow-up).
 */
export async function insertGeneratedPlan(
  client: IronflowClient,
  athleteId: string,
  plan: GeneratedPlan,
  meta: GeneratedPlanMeta,
): Promise<{ planId: string }> {
  const { data: planRow, error: planErr } = await client
    .from('training_plans')
    .insert(toTrainingPlanRow(athleteId, plan, meta))
    .select('id')
    .single();
  if (planErr || !planRow) throw new Error(`training_plans insert failed: ${planErr?.message ?? 'no row'}`);
  const planId = planRow.id;

  const { data: weekRows, error: weekErr } = await client
    .from('plan_weeks')
    .insert(plan.weeks.map((w) => toPlanWeekRow(planId, plan.startDate, w, meta.course)))
    .select('id, week_number');
  if (weekErr || !weekRows) throw new Error(`plan_weeks insert failed: ${weekErr?.message ?? 'no rows'}`);
  const weekIdByNumber = new Map<number, string>(weekRows.map((w) => [w.week_number, w.id]));

  const workoutRows = plan.workouts.map((sw) => {
    const weekId = weekIdByNumber.get(sw.weekNumber);
    if (!weekId) throw new Error(`no plan_week for week ${sw.weekNumber}`);
    return toWorkoutRow(athleteId, planId, weekId, sw);
  });
  const { error: woErr } = await client.from('workouts').insert(workoutRows);
  if (woErr) throw new Error(`workouts insert failed: ${woErr.message}`);

  return { planId };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** The athlete's current active plan, or null. */
export async function getActivePlan(client: IronflowClient, athleteId: string): Promise<Tables<'training_plans'> | null> {
  const { data } = await client
    .from('training_plans')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Workouts scheduled in [fromDate, toDate] (inclusive ISO dates), chronological. */
export async function getWorkoutsInRange(
  client: IronflowClient,
  athleteId: string,
  fromDate: string,
  toDate: string,
): Promise<Tables<'workouts'>[]> {
  const { data } = await client
    .from('workouts')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('scheduled_date', fromDate)
    .lte('scheduled_date', toDate)
    .order('scheduled_date', { ascending: true });
  return data ?? [];
}

/** All weeks of a plan, ordered. */
export async function getPlanWeeks(client: IronflowClient, planId: string): Promise<Tables<'plan_weeks'>[]> {
  const { data } = await client.from('plan_weeks').select('*').eq('plan_id', planId).order('week_number', { ascending: true });
  return data ?? [];
}
