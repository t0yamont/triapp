/**
 * repositories/decisions.ts — the engine decision log (02-ARCHITECTURE.md §8).
 *
 * §8: "**Engine decision log:** every plan mutation records inputs, rule fired, and output. When
 * an athlete asks 'why did my Thursday change', this table is the answer. Retain indefinitely; it
 * is small and it is the product's credibility."
 *
 * Three code paths already *write* `plan_mutations` — the readiness response, the weekly replan,
 * and week repair — and hard rule 10 requires every plan mutation to. Nothing ever read them
 * back, so the answer existed and the athlete could not see it, which is the same as not having
 * it. This is the read side.
 */

import type { TriflowClient } from '../client.js';
import type { Json } from '../database.types.js';
import { localDayISO } from '../time.js';

export type PlanActor = 'engine' | 'athlete' | 'coach' | 'system';

export interface PlanDecision {
  id: number;
  occurredAt: string;
  actor: PlanActor;
  /** Machine-readable, e.g. `READINESS_2DAY_LOW`. Stable across copy changes. */
  reasonCode: string;
  /** The athlete-facing sentence, written by the engine at decision time. */
  reasonText: string;
  /** Which §10.2 / §10.3 / guardrail rule fired. */
  ruleId: string | null;
  affectedWorkoutIds: string[];
  /** What the engine saw. This is what makes the log an explanation rather than an assertion. */
  engineInputs: Json | null;
  before: Json | null;
  after: Json | null;
}

interface PlanMutationRow {
  id: number;
  occurred_at: string;
  actor: string;
  reason_code: string;
  reason_text: string;
  rule_id: string | null;
  affected_workout_ids: string[] | null;
  engine_inputs: Json | null;
  before: Json | null;
  after: Json | null;
}

export function fromPlanMutationRow(row: PlanMutationRow): PlanDecision {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actor: row.actor as PlanActor,
    reasonCode: row.reason_code,
    reasonText: row.reason_text,
    ruleId: row.rule_id,
    affectedWorkoutIds: row.affected_workout_ids ?? [],
    engineInputs: row.engine_inputs,
    before: row.before,
    after: row.after,
  };
}

/** How many entries a "why did my plan change" panel shows before asking to see more. */
export const DECISION_PAGE_SIZE = 20;

/**
 * The athlete's decision log, newest first. `since` bounds it for a panel; the table itself is
 * retained indefinitely per §8, so a read with no bound is a deliberate "show me everything".
 */
export async function getPlanDecisions(
  client: TriflowClient,
  athleteId: string,
  opts: { since?: string; limit?: number; planId?: string } = {},
): Promise<PlanDecision[]> {
  let query = client
    .from('plan_mutations')
    .select('id, occurred_at, actor, reason_code, reason_text, rule_id, affected_workout_ids, engine_inputs, before, after')
    .eq('athlete_id', athleteId)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? DECISION_PAGE_SIZE);
  if (opts.since !== undefined) query = query.gte('occurred_at', opts.since);
  if (opts.planId !== undefined) query = query.eq('plan_id', opts.planId);

  const { data, error } = await query;
  if (error) throw new Error(`decision log unavailable: ${error.message}`);
  return (data ?? []).map((row) => fromPlanMutationRow(row as PlanMutationRow));
}

/** Every decision that touched one session — the literal answer to "why did my Thursday change". */
export function decisionsForWorkout(decisions: readonly PlanDecision[], workoutId: string): PlanDecision[] {
  return decisions.filter((d) => d.affectedWorkoutIds.includes(workoutId));
}

export interface DecisionDay {
  /** Calendar date in the athlete's zone. */
  date: string;
  decisions: PlanDecision[];
}

/**
 * Group by the day the athlete experienced, not the day UTC was having.
 *
 * An adaptation made at 23:30 in Auckland is a Tuesday decision to the athlete and a Monday one
 * in UTC. Grouping on the raw timestamp files it under the wrong heading, which is precisely the
 * moment an explanation stops being reassuring (CLAUDE.md hard rule 8).
 */
export function groupDecisionsByLocalDay(decisions: readonly PlanDecision[], timeZone: string): DecisionDay[] {
  const byDay = new Map<string, PlanDecision[]>();
  for (const decision of decisions) {
    const day = localDayISO(decision.occurredAt, timeZone);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(decision);
    else byDay.set(day, [decision]);
  }
  return [...byDay.entries()]
    .map(([date, group]) => ({ date, decisions: group }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
