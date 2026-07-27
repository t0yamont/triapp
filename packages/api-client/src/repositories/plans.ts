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
  dayOfWeekISO,
  distributionTarget,
  validateWeek,
  type CourseType,
  type GeneratedPlan,
  type PlanMutation,
  type PlanSport,
  type PlanWeekResult,
  type ScheduledWorkout,
  type SessionPurpose,
  type WeekEdit,
  type Violation,
  type WeekSession,
} from '@ironflow/core/physio';
import type { TriflowClient } from '../client.js';
import { emitAlert, guardrailAlert } from '../observability/syncHealth.js';
import type { Json } from '../database.types.js';
import type { Tables, TablesInsert } from '../types.js';

// ── Pure mappers (unit-tested) ───────────────────────────────────────────────

/**
 * A scheduled session → a workout row.
 *
 * Nothing is derived here any more. `name`, `purpose`, `templateId` and `structure` are
 * rendered by the engine (`sessions/library.ts`, §7) and travel on the `ScheduledWorkout`, so
 * this is a pure field mapping. The previous version derived all four from `isHard` + sport —
 * a §7 formula living in the persistence layer, which is exactly what `CLAUDE.md` forbids, and
 * why every workout was named "Ride — aerobic" and every structure was `{ kind: 'steady' }`.
 */
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
    template_id: sw.templateId,
    name: sw.name,
    purpose: sw.purpose,
    goal_zone: sw.sZone,
    is_key_session: sw.isHard,
    planned_duration_min: sw.durationMin,
    planned_load: sw.load,
    structure: sw.structure as unknown as Json,
  };
}

/** Sports the planner schedules; a stored workout outside this set has no engine session. */
const PLAN_SPORTS = new Set<string>(['run', 'bike', 'swim', 'brick', 'strength']);

/**
 * The inverse of `toWorkoutRow`: a stored workout back as an engine `WeekSession`, so the
 * planning functions (moveSession, validateWeek) operate on a persisted week unchanged.
 * Returns null for a sport the planner never schedules.
 */
export function fromWorkoutRow(row: Tables<'workouts'>): WeekSession | null {
  if (!PLAN_SPORTS.has(row.sport)) return null;
  return {
    dayOfWeek: dayOfWeekISO(row.scheduled_date),
    sport: row.sport as PlanSport,
    sZone: row.goal_zone,
    purpose: row.purpose,
    durationMin: row.planned_duration_min,
    load: row.planned_load,
    isHard: row.is_key_session,
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
  /** The athlete's `profiles.week_start_day`; only the guardrail audit reads it. Defaults to Monday. */
  weekStartDay?: number;
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
 * Re-check the guardrails on the way to the database (02-ARCHITECTURE.md §8).
 *
 * The engine is supposed to make this unreachable — `assembleWeek` and `applyRampCap` are the
 * enforcers, and `validateWeek` has existed since the first commit. Nothing in the write path
 * ever called it, so an engine bug would have arrived on an athlete's calendar unremarked.
 *
 * It **alerts rather than blocks**, which is §8's own wording ("alert on ... any guardrail
 * violation reaching the persistence layer"). Refusing the write would convert an engine bug into
 * an athlete with no plan at all — the guardrails exist to make a week safer, not to make the
 * product unusable — and the enforcement point remains the engine, per §10/§11.
 */
export function auditPlanGuardrails(plan: GeneratedPlan, weekStartDay = 1): Violation[] {
  return plan.weeks.flatMap((w) => validateWeek(w.week, weekStartDay));
}

/**
 * Persist a generated plan: one training_plans row, its plan_weeks, then all workouts wired
 * to their week. Returns the new plan id. Throws on the first failed insert (the caller should
 * run this server-side; a real transaction would use an Edge Function / RPC — see follow-up).
 */
export async function insertGeneratedPlan(
  client: TriflowClient,
  athleteId: string,
  plan: GeneratedPlan,
  meta: GeneratedPlanMeta,
): Promise<{ planId: string }> {
  const alert = guardrailAlert(auditPlanGuardrails(plan, meta.weekStartDay));
  if (alert) emitAlert(alert);

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
export async function getActivePlan(client: TriflowClient, athleteId: string): Promise<Tables<'training_plans'> | null> {
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
  client: TriflowClient,
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
export async function getPlanWeeks(client: TriflowClient, planId: string): Promise<Tables<'plan_weeks'>[]> {
  const { data } = await client.from('plan_weeks').select('*').eq('plan_id', planId).order('week_number', { ascending: true });
  return data ?? [];
}

// ── Week repair write path (§10, hard rule #10) ──────────────────────────────

/** The subset of a workout row needed to resolve a move. */
export type MovableWorkout = Pick<Tables<'workouts'>, 'id' | 'sport' | 'scheduled_date' | 'original_scheduled_date'>;

export interface WorkoutMove {
  id: string;
  /** The day this workout ends up on. */
  scheduledDate: string;
  /** The date it was *first* scheduled for — preserved across repeated moves. */
  originalDate: string;
}

/** Days from the training week's start to a weekday (Mon-first), matching the engine's own. */
const dayOffsetFromWeekStart = (dayOfWeek: number, weekStartDay = 1): number => (dayOfWeek - weekStartDay + 7) % 7;

/**
 * Resolve a week's `WeekEdit[]` onto concrete workout rows: which row lands on which date.
 *
 * Edits are applied **sequentially against a mutating day map**, not resolved independently
 * against the original layout. That matters: `moveSession` can emit a swap (run Mon→Tue,
 * bike Tue→Mon) or move the same session twice, and resolving every edit against the
 * starting positions would mis-assign both. Returns only rows whose day actually changed.
 */
export function resolveWeekEdits(
  rows: readonly MovableWorkout[],
  edits: readonly WeekEdit[],
  weekStartDate: string,
  weekStartDay = 1,
): WorkoutMove[] {
  const currentDay = new Map(rows.map((r) => [r.id, dayOfWeekISO(r.scheduled_date)]));
  const sportOf = new Map(rows.map((r) => [r.id, r.sport as PlanSport]));

  for (const edit of edits) {
    // The row sitting on `fromDay` with this sport *right now*, after earlier edits applied.
    let match: string | undefined;
    for (const [id, day] of currentDay) {
      if (day === edit.fromDay && sportOf.get(id) === edit.sport) {
        match = id;
        break;
      }
    }
    if (match !== undefined) currentDay.set(match, edit.toDay);
  }

  const moves: WorkoutMove[] = [];
  for (const row of rows) {
    const finalDay = currentDay.get(row.id);
    if (finalDay === undefined || finalDay === dayOfWeekISO(row.scheduled_date)) continue;
    moves.push({
      id: row.id,
      scheduledDate: addDaysISO(weekStartDate, dayOffsetFromWeekStart(finalDay, weekStartDay)),
      // Only the *first* move records an original date; later ones keep it.
      originalDate: row.original_scheduled_date ?? row.scheduled_date,
    });
  }
  return moves;
}

/**
 * Commit a week repair: move the affected workouts and write the single `plan_mutations`
 * audit row that hard rule #10 / invariant I13 require. `mutation` comes from the engine
 * (`RescheduleResult.mutation`).
 *
 * Note that the engine emits a mutation for the *unresolved* case too (reason code
 * `ATHLETE_MOVE_UNRESOLVED`), so its presence alone is not a commit signal — the contract is
 * `remainingViolations` being empty ("empty ⇒ safe to commit"). Callers gate on that.
 *
 * Not a database transaction — Supabase's REST client can't span one — so if the audit
 * insert fails, the already-applied workout moves are **rolled back** before throwing. That
 * keeps rule #10 true in practice: a plan change is never left persisted without its audit
 * row, in either direction.
 *
 * ponytail: the rollback is a compensating write, so a process death between the two steps
 * still leaves an unaudited move. Fine for an athlete-initiated drag that errors visibly and
 * can be retried; move both into a Postgres function called over RPC before anything writes
 * plan changes unattended (weekly re-plan, readiness downgrades), where nobody is watching.
 */
export async function persistWorkoutMoves(
  client: TriflowClient,
  args: {
    athleteId: string;
    planId: string;
    moves: readonly WorkoutMove[];
    mutation: PlanMutation;
    /** What the engine saw — stored for the audit trail, never read back by the app. */
    engineInputs?: Json;
  },
): Promise<void> {
  const { athleteId, planId, moves, mutation, engineInputs } = args;
  if (moves.length === 0) return;

  const ids = moves.map((m) => m.id);

  // Snapshot the current rows first, so the audit row records real before/after values and a
  // failed audit write can be undone.
  const { data: priorRows, error: readError } = await client
    .from('workouts')
    .select('id, scheduled_date, original_scheduled_date')
    .eq('athlete_id', athleteId)
    .in('id', ids);
  if (readError) throw readError;

  const prior = new Map((priorRows ?? []).map((r) => [r.id, r]));

  const applied: string[] = [];
  const applyDate = async (id: string, scheduledDate: string, originalDate: string | null): Promise<void> => {
    const { error } = await client
      .from('workouts')
      .update({
        scheduled_date: scheduledDate,
        original_scheduled_date: originalDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('athlete_id', athleteId); // explicit under service-role, redundant under RLS
    if (error) throw error;
  };

  const rollback = async (): Promise<void> => {
    for (const id of applied) {
      const was = prior.get(id);
      if (!was) continue;
      try {
        await applyDate(id, was.scheduled_date, was.original_scheduled_date);
      } catch {
        // Best effort: the original failure is the one worth reporting.
      }
    }
  };

  try {
    for (const move of moves) {
      await applyDate(move.id, move.scheduledDate, move.originalDate);
      applied.push(move.id);
    }
  } catch (error) {
    await rollback();
    throw error;
  }

  const before = Object.fromEntries(moves.map((m) => [m.id, prior.get(m.id)?.scheduled_date ?? null]));
  const after = Object.fromEntries(moves.map((m) => [m.id, m.scheduledDate]));

  const { error: auditError } = await client.from('plan_mutations').insert({
    athlete_id: athleteId,
    plan_id: planId,
    actor: mutation.actor,
    reason_code: mutation.reasonCode,
    reason_text: mutation.reasonText,
    ...(mutation.ruleId ? { rule_id: mutation.ruleId } : {}),
    affected_workout_ids: ids,
    before: before as Json,
    after: after as Json,
    ...(engineInputs !== undefined ? { engine_inputs: engineInputs } : {}),
  });

  if (auditError) {
    // An unaudited plan change violates hard rule #10 — undo it rather than keep it.
    await rollback();
    throw auditError;
  }
}
