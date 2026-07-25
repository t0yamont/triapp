'use client';

/**
 * lib/live-replan.ts — §10.3 weekly re-planning against the athlete's real training weeks.
 *
 * Evaluating is a pure read, so it happens on load. **Applying is not** — it writes to the
 * plan, so it only happens when the athlete asks, never as a render side effect (the same
 * rule `live-readiness.ts` follows). Spec-wise these decisions belong at the week boundary;
 * running them automatically is a job for the scheduled task in `supabase/migrations`, not
 * for a page that happens to be open.
 */

import {
  getDailyMetricsInRange,
  getActivePlan,
  getPlanWeeks,
  getWorkoutsInRange,
  persistReplanDecisions,
  toReplanWeekSummaries,
} from '@ironflow/api-client';
import {
  addDaysISO,
  buildReplanContext,
  weeklyReplan,
  weekStartISO,
  type Distribution,
  type ReplanDecision,
} from '@ironflow/core/physio';
import { useCallback, useEffect, useState } from 'react';
import { todayISO } from './live-plan';
import { useSupabase } from './supabase';

/** How far back to look for completed weeks — enough for every §10.3 trailing window. */
const LOOKBACK_WEEKS = 6;

export interface UseLiveReplan {
  /** Null when there is nothing live (⇒ caller shows the sample). */
  decisions: ReplanDecision[] | null;
  loading: boolean;
  applying: boolean;
  applied: boolean;
  error: string | null;
  apply: () => Promise<void>;
}

export function useLiveReplan(): UseLiveReplan {
  const supabase = useSupabase();
  const [decisions, setDecisions] = useState<ReplanDecision[] | null>(null);
  const [context, setContext] = useState<{ planId: string; athleteId: string; nextWeekId: string | null } | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    const athleteId = auth.user?.id;
    if (!athleteId) return setDecisions(null);

    const plan = await getActivePlan(supabase, athleteId);
    if (!plan) return setDecisions(null);

    const today = todayISO();
    const from = addDaysISO(weekStartISO(today), -LOOKBACK_WEEKS * 7);
    const [planWeeks, workouts, daily] = await Promise.all([
      getPlanWeeks(supabase, plan.id),
      getWorkoutsInRange(supabase, athleteId, from, today),
      getDailyMetricsInRange(supabase, athleteId, from, today),
    ]);

    const summaries = toReplanWeekSummaries(planWeeks, workouts, daily, today).slice(-LOOKBACK_WEEKS);
    if (summaries.length === 0) return setDecisions(null); // no finished weeks ⇒ nothing to reason about

    const thisWeekStart = weekStartISO(today);
    const current = planWeeks.find((w) => w.week_start_date === thisWeekStart);
    const nextWeek = planWeeks.find((w) => w.week_start_date === addDaysISO(thisWeekStart, 7)) ?? null;
    const target = (current?.distribution_target ?? null) as Distribution | null;

    setContext({ planId: plan.id, athleteId, nextWeekId: nextWeek?.id ?? null });
    setDecisions(weeklyReplan(buildReplanContext(summaries, target ?? undefined)));
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      try {
        await load();
      } catch {
        if (alive) setDecisions(null); // a read failure falls back to the sample
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, load]);

  const apply = useCallback(async (): Promise<void> => {
    if (!supabase || !decisions || decisions.length === 0 || !context) return;
    setApplying(true);
    setError(null);
    try {
      const planWeeks = await getPlanWeeks(supabase, context.planId);
      const nextWeek = context.nextWeekId ? (planWeeks.find((w) => w.id === context.nextWeekId) ?? null) : null;
      await persistReplanDecisions(supabase, {
        athleteId: context.athleteId,
        planId: context.planId,
        decisions,
        nextWeek,
      });
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply those changes.');
    } finally {
      setApplying(false);
    }
  }, [supabase, decisions, context]);

  return { decisions, loading, applying, applied, error, apply };
}
