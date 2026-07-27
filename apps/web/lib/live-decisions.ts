'use client';

/**
 * lib/live-decisions.ts — read the engine decision log (02-ARCHITECTURE.md §8).
 *
 * "When an athlete asks 'why did my Thursday change', this table is the answer." Three write
 * paths have been filling `plan_mutations` for months; nothing read them back, so the answer
 * existed and no athlete could see it.
 *
 * The athlete's timezone comes from their profile, because a decision made late on Tuesday
 * evening must appear under Tuesday — not under whatever day UTC happened to be on.
 */

import { getPlanDecisions, groupDecisionsByLocalDay, type DecisionDay } from '@ironflow/api-client';
import { useEffect, useState } from 'react';
import { useSupabase } from './supabase';

/** How far back the panel looks. Older entries are still retained — §8 says indefinitely. */
export const DECISION_LOOKBACK_DAYS = 28;

export interface UseLiveDecisions {
  /** Null when there is nothing to show (no plan changes yet, not signed in, or no Supabase). */
  days: DecisionDay[] | null;
  loading: boolean;
  error: string | null;
}

export function useLiveDecisions(): UseLiveDecisions {
  const supabase = useSupabase();
  const [days, setDays] = useState<DecisionDay[] | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('timezone')
          .eq('id', auth.user.id)
          .maybeSingle();

        const since = new Date(Date.now() - DECISION_LOOKBACK_DAYS * 86_400_000).toISOString();
        const decisions = await getPlanDecisions(supabase, auth.user.id, { since });
        if (!alive) return;
        setDays(decisions.length === 0 ? null : groupDecisionsByLocalDay(decisions, profile?.timezone ?? 'UTC'));
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Could not load your plan history.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  return { days, loading, error };
}
