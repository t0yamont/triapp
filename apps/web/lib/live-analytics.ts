'use client';

/**
 * lib/live-analytics.ts — the athlete's real training state for [[Analytics Dashboard]].
 *
 * Two things here are real and two are honestly approximate, and the difference is surfaced
 * rather than hidden:
 *
 *  - **Decoupling** is genuinely measured — computed from the activity's own streams at
 *    ingest (§11), no athlete model needed.
 *  - **Distribution** is genuinely the athlete's, from the zones of the sessions they
 *    actually completed.
 *  - **CTL/ATL/TSB** are computed from the *planned* load of completed sessions, because
 *    measured load (TSS/TRIMP) needs thresholds — CP/LT2/CSS and HR zones — that nothing
 *    persists yet. The shape and trend are right; the units are "what the plan asked for",
 *    not "what the body received". `loadBasis` says so, and the UI must keep saying so.
 *
 * ponytail: swap `loadBasis` to 'measured' the moment activities carry `internal_load` —
 * `fitnessSeries` itself doesn't change, only where the daily numbers come from.
 */

import { getActivitiesInRange, getActivePlan, getPlanWeeks, getWorkoutsInRange } from '@ironflow/api-client';
import {
  DECOUPLING_TARGET_PCT,
  addDaysISO,
  distributionTarget,
  durabilityResponse,
  fitnessSeries,
  isModerateDrift,
  isWithinTolerance,
  weekStartISO,
  type Distribution,
  type DurabilityResponse,
  type FitnessPoint,
  type PlanPhase,
  type SZone,
} from '@ironflow/core/physio';
import { useEffect, useState } from 'react';
import { todayISO } from './live-plan';
import { useSupabase } from './supabase';

/** The window the fitness chart covers, matching the demo view's 12 weeks. */
const CHART_WEEKS = 12;
const DAYS_PER_WEEK = 7;

export interface LiveAnalytics {
  series: FitnessPoint[];
  current: FitnessPoint;
  peakCtl: number;
  /** What the daily loads mean — see the module note. */
  loadBasis: 'planned_completed' | 'measured';
  distribution: {
    actual: Distribution;
    target: Distribution;
    withinTolerance: boolean;
    moderateDrift: boolean;
    narrative: string;
  } | null;
  durability: { latestPct: number; valid: boolean; exceedsTarget: boolean; trend: number[]; response: DurabilityResponse } | null;
}

export function useLiveAnalytics(): { live: LiveAnalytics | null; loading: boolean } {
  const supabase = useSupabase();
  const [live, setLive] = useState<LiveAnalytics | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const done = (value: LiveAnalytics | null) => {
      if (!alive) return;
      setLive(value);
      setLoading(false);
    };

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const athleteId = auth.user?.id;
        if (!athleteId) return done(null);

        const today = todayISO();
        const from = addDaysISO(today, -CHART_WEEKS * DAYS_PER_WEEK);
        const [workouts, activities, plan] = await Promise.all([
          getWorkoutsInRange(supabase, athleteId, from, today),
          getActivitiesInRange(supabase, athleteId, from, today),
          getActivePlan(supabase, athleteId),
        ]);
        if (workouts.length === 0) return done(null);

        // ── Daily load: what was actually completed, day by day ──────────────
        const byDay = new Map<string, number>();
        for (const w of workouts) {
          if (w.status !== 'completed') continue;
          byDay.set(w.scheduled_date, (byDay.get(w.scheduled_date) ?? 0) + Number(w.planned_load));
        }
        const dailyLoads: number[] = [];
        for (let i = CHART_WEEKS * DAYS_PER_WEEK; i >= 0; i--) {
          dailyLoads.push(byDay.get(addDaysISO(today, -i)) ?? 0);
        }
        const series = fitnessSeries(dailyLoads);
        const current = series[series.length - 1];
        if (!current) return done(null);

        // ── Distribution: zones of the sessions actually done ────────────────
        const zoneMinutes: Record<SZone, number> = { S1: 0, S2: 0, S3: 0 };
        for (const w of workouts) {
          if (w.status === 'completed') zoneMinutes[w.goal_zone] += w.planned_duration_min;
        }
        const totalMin = zoneMinutes.S1 + zoneMinutes.S2 + zoneMinutes.S3;
        const planWeeks = plan ? await getPlanWeeks(supabase, plan.id) : [];
        const phase: PlanPhase =
          planWeeks.find((w) => w.week_start_date === weekStartISO(today))?.phase ?? 'build';
        let distribution: LiveAnalytics['distribution'] = null;
        if (totalMin > 0) {
          const actual: Distribution = {
            S1: Math.round((zoneMinutes.S1 / totalMin) * 100),
            S2: Math.round((zoneMinutes.S2 / totalMin) * 100),
            S3: Math.round((zoneMinutes.S3 / totalMin) * 100),
          };
          const target = distributionTarget(phase, 'long');
          // Same two engine checks the sample view uses — the verdict can't diverge.
          const withinTolerance = isWithinTolerance(actual, target);
          const moderateDrift = isModerateDrift(actual.S2 / 100);
          distribution = {
            actual,
            target,
            withinTolerance,
            moderateDrift,
            narrative: moderateDrift
              ? 'Your S2 time is creeping up — worth easing back toward genuinely easy on aerobic days.'
              : withinTolerance
                ? 'Neither too polarised nor grey-zone. Your easy work is genuinely easy.'
                : 'Your mix has drifted from target — the plan will nudge it back over the next few weeks.',
          };
        }

        // ── Durability: measured at ingest, oldest → newest ──────────────────
        const readings = activities
          .filter((a) => a.decoupling_pct !== null)
          .map((a) => ({ pct: Number(a.decoupling_pct), valid: a.decoupling_valid ?? false }))
          .reverse();
        const latest = readings[readings.length - 1];
        const durability = latest
          ? {
              latestPct: latest.pct,
              valid: latest.valid,
              exceedsTarget: latest.pct > DECOUPLING_TARGET_PCT,
              trend: readings.map((r) => r.pct),
              response: durabilityResponse({
                ratioFirst: 0,
                ratioSecond: 0,
                decouplingPct: latest.pct,
                valid: latest.valid,
                invalidReasons: [],
                exceedsTarget: latest.pct > DECOUPLING_TARGET_PCT,
              }),
            }
          : null;

        done({
          series,
          current,
          peakCtl: Math.max(...series.map((p) => p.ctl)),
          loadBasis: 'planned_completed',
          distribution,
          durability,
        });
      } catch {
        done(null); // a read failure falls back to the sample rather than blanking the page
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  return { live, loading };
}
