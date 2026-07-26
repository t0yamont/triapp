'use client';

/**
 * lib/live-readiness.ts — the athlete's real readiness, from their own check-in history.
 *
 * §10.1 scores readiness from rolling means against a 60-day baseline, so this reads the
 * whole baseline window, hands it to the engine's `buildReadinessInputs`, and scores it.
 * Returns null when there is nothing live (no env, signed out, or not enough history to
 * score honestly) so callers fall back to the sample athlete — the same rule `live-plan.ts`
 * and `live-races.ts` follow.
 */

import {
  adaptedZone,
  getDailyMetricsInRange,
  persistSessionAdaptation,
  refreshAthleteModel,
  toDailyWellness,
  upsertDailyCheckIn,
  type DailyCheckIn,
} from '@ironflow/api-client';
import {
  HRV_BASELINE_DAYS,
  READINESS_BELOW_DAYS_RECOVERY,
  adaptToday,
  addDaysISO,
  buildReadinessInputs,
  buildReadinessSeries,
  readinessCoverage,
  readinessScore,
  type AdaptationResult,
  type DailyWellness,
  type Readiness,
  type ReadinessCoverage,
  type SZone,
} from '@ironflow/core/physio';
import { useCallback, useEffect, useState } from 'react';
import { todayISO } from './live-plan';
import { useSupabase } from './supabase';

export interface LiveReadiness {
  readiness: Readiness;
  coverage: ReadinessCoverage;
  /** Today's own row, when the athlete has already checked in. */
  today: DailyWellness | null;
}

/** Today's scheduled session, when there is a persisted one to adapt. */
export interface TodaySession {
  workoutId: string;
  planId: string;
  sZone: SZone;
}

export interface UseLiveReadiness {
  live: LiveReadiness | null;
  /** Null until we know — distinguishes "loading" from "signed out". */
  coverage: ReadinessCoverage | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** The engine's response to today's readiness, once a check-in has produced one. */
  adaptation: AdaptationResult | null;
  /**
   * Save this morning's check-in, rescore, and apply §10.2's response to today's session.
   * No-op when signed out. Pass today's session to let the adaptation actually land.
   */
  submit: (checkIn: DailyCheckIn, todaySession?: TodaySession) => Promise<void>;
}

/** Enough trailing days to satisfy §10.2's longest rule (4+ consecutive below-band days). */
const SERIES_DAYS = READINESS_BELOW_DAYS_RECOVERY + 1;

export function useLiveReadiness(): UseLiveReadiness {
  const supabase = useSupabase();
  const [live, setLive] = useState<LiveReadiness | null>(null);
  const [coverage, setCoverage] = useState<ReadinessCoverage | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adaptation, setAdaptation] = useState<AdaptationResult | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    const athleteId = auth.user?.id;
    if (!athleteId) {
      setLive(null);
      setCoverage(null);
      return;
    }

    const today = todayISO();
    const rows = await getDailyMetricsInRange(supabase, athleteId, addDaysISO(today, -HRV_BASELINE_DAYS), today);
    const history = rows.map(toDailyWellness);
    const cover = readinessCoverage(history, today);
    setCoverage(cover);

    // No metric cleared its windows yet ⇒ there is no honest score to show.
    if (cover.available.length === 0) {
      setLive(null);
      return;
    }
    setLive({
      readiness: readinessScore(buildReadinessInputs(history, today)),
      coverage: cover,
      today: history.find((d) => d.date === today) ?? null,
    });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      try {
        await load();
      } catch {
        if (alive) {
          setLive(null);
          setCoverage(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, load]);

  const submit = useCallback(
    async (checkIn: DailyCheckIn, todaySession?: TodaySession): Promise<void> => {
      if (!supabase) return;
      setSaving(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const athleteId = auth.user?.id;
        if (!athleteId) throw new Error('Sign in to save your check-in.');

        const today = todayISO();
        // Score against history *including* today, so the saved row carries the engine's
        // verdict for the day it describes.
        const rows = await getDailyMetricsInRange(supabase, athleteId, addDaysISO(today, -HRV_BASELINE_DAYS), today);
        const history = [
          ...rows.map(toDailyWellness).filter((d) => d.date !== today),
          { date: today, ...checkIn } as DailyWellness,
        ];
        const inputs = buildReadinessInputs(history, today);
        const scored = readinessCoverage(history, today).available.length > 0 ? readinessScore(inputs) : undefined;

        await upsertDailyCheckIn(supabase, athleteId, today, checkIn, scored);

        // A check-in is the only source of resting HR, so it's the moment the athlete model
        // can change (§2.3). Refreshing here rather than on render keeps the write tied to a
        // deliberate action, as with the adaptation below. Never fatal: the check-in is saved
        // either way, and the model is derived, not entered.
        try {
          await refreshAthleteModel(supabase, athleteId, new Date().toISOString());
        } catch {
          /* the model simply stays as it was */
        }

        // §10.2: the plan responds to readiness. Done here, on a deliberate athlete action,
        // rather than on render — a page load must never quietly rewrite the plan, and this
        // is exactly the moment readiness changed.
        if (scored && todaySession) {
          const response = adaptToday(buildReadinessSeries(history, today, SERIES_DAYS), todaySession.sZone);
          setAdaptation(response);
          const toZone = adaptedZone(response.action, todaySession.sZone);
          if (toZone && response.mutation) {
            await persistSessionAdaptation(supabase, {
              athleteId,
              planId: todaySession.planId,
              workoutId: todaySession.workoutId,
              fromZone: todaySession.sZone,
              toZone,
              mutation: response.mutation,
            });
          }
        }

        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your check-in.');
      } finally {
        setSaving(false);
      }
    },
    [supabase, load],
  );

  return { live, coverage, loading, saving, error, adaptation, submit };
}
