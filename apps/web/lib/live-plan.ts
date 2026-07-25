'use client';

/**
 * lib/live-plan.ts — reads the athlete's persisted plan (training_plans → plan_weeks →
 * workouts) for the current week and maps it into the shapes the UI already speaks:
 * a `GuardrailWeek` for the Calendar and the Today week/coming-up views.
 *
 * Returns null whenever there is nothing live to show (no Supabase env, not signed in, no
 * active plan, or an empty week) so every caller falls back to the sample athlete.
 *
 * Dates are the athlete's *local* calendar days (hard rule #8): stored as plain dates, and
 * parsed/compared as local parts so a UTC boundary never shifts a session to the wrong day.
 */

import { fromWorkoutRow, getActivePlan, getPlanWeeks, getWorkoutsInRange, type Tables } from '@ironflow/api-client';
import {
  addDaysISO,
  dayOfWeekISO,
  distributionTarget,
  weekStartISO,
  type Distribution,
  type GuardrailWeek,
  type PlanPhase,
  type WeekSession,
} from '@ironflow/core/physio';
import { useEffect, useState } from 'react';
import { WEEKDAYS } from './days';
import { useSupabase } from './supabase';
import type { UpcomingSession, ViewSport, WeekStripView } from './today-demo';

export { dayOfWeekISO };

const DEFAULT_HOURS_CEILING = 12;

/** The athlete's own "today" — a local calendar day, so their evening isn't tomorrow. */
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

// ── Row → view mappers ───────────────────────────────────────────────────────

type WorkoutRow = Tables<'workouts'>;

const zoneMinutes = (rows: WorkoutRow[], zone: 'S1' | 'S2' | 'S3'): number =>
  rows.filter((w) => w.goal_zone === zone).reduce((a, w) => a + w.planned_duration_min, 0);

function liveDistribution(rows: WorkoutRow[]): Distribution {
  const total = rows.reduce((a, w) => a + w.planned_duration_min, 0);
  if (total === 0) return { S1: 0, S2: 0, S3: 0 };
  const pct = (z: 'S1' | 'S2' | 'S3') => Math.round((zoneMinutes(rows, z) / total) * 100);
  return { S1: pct('S1'), S2: pct('S2'), S3: pct('S3') };
}

export function toWeekStrip(rows: WorkoutRow[], phase: PlanPhase, today: string): WeekStripView {
  const days = WEEKDAYS.map((d) => {
    const forDay = rows.filter((w) => dayOfWeekISO(w.scheduled_date) === d.index);
    return {
      index: d.index,
      short: d.short,
      plannedLoad: forDay.reduce((a, w) => a + w.planned_load, 0),
      // ponytail: completed ⇒ its planned load. Actual load needs the linked activity's
      // computed load — swap when activities are ingested and joined.
      doneLoad: forDay.filter((w) => w.status === 'completed').reduce((a, w) => a + w.planned_load, 0),
      isToday: d.index === dayOfWeekISO(today),
    };
  });
  return {
    days,
    plannedTotal: days.reduce((a, d) => a + d.plannedLoad, 0),
    doneTotal: days.reduce((a, d) => a + d.doneLoad, 0),
    distributionActual: liveDistribution(rows),
    distributionTarget: distributionTarget(phase, 'long'),
  };
}

const SHORT_OF = new Map(WEEKDAYS.map((d) => [d.index, d.short]));

export function toComingUp(rows: WorkoutRow[], today: string): UpcomingSession[] {
  return rows
    .filter((w) => w.scheduled_date > today && fromWorkoutRow(w) !== null)
    .slice(0, 3)
    .map((w) => ({
      dayShort: SHORT_OF.get(dayOfWeekISO(w.scheduled_date)) ?? '',
      load: w.planned_load,
      isKey: w.is_key_session,
      sport: (w.sport === 'brick' ? 'run' : w.sport) as ViewSport,
      zone: w.goal_zone,
      name: w.name,
      detail: `${w.planned_duration_min}m · ${w.goal_zone}`,
    }));
}

// ── The hook ─────────────────────────────────────────────────────────────────

export interface LiveWeek {
  week: GuardrailWeek;
  strip: WeekStripView;
  comingUp: UpcomingSession[];
}

/** This week's persisted plan, or null when there is nothing live (⇒ caller uses the sample). */
export function useLiveWeek(): { live: LiveWeek | null; loading: boolean } {
  const supabase = useSupabase();
  const [live, setLive] = useState<LiveWeek | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const done = (value: LiveWeek | null) => {
      if (!alive) return;
      setLive(value);
      setLoading(false);
    };

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const athleteId = auth.user?.id;
        if (!athleteId) return done(null);

        const plan = await getActivePlan(supabase, athleteId);
        if (!plan) return done(null);

        const today = todayISO();
        const start = weekStartISO(today);
        const rows = await getWorkoutsInRange(supabase, athleteId, start, addDaysISO(start, 6));
        const sessions = rows.map(fromWorkoutRow).filter((s): s is WeekSession => s !== null);
        if (sessions.length === 0) return done(null);

        const planWeek = (await getPlanWeeks(supabase, plan.id)).find((w) => w.week_start_date === start);
        const phase: PlanPhase = planWeek?.phase ?? 'build';
        const availability = plan.availability_snapshot as { weeklyHoursMax?: number } | null;

        done({
          week: {
            phase,
            isRecoveryWeek: planWeek?.is_recovery_week ?? false,
            hoursCeiling: availability?.weeklyHoursMax ?? DEFAULT_HOURS_CEILING,
            sessions,
          },
          strip: toWeekStrip(rows, phase, today),
          comingUp: toComingUp(rows, today),
        });
      } catch {
        done(null); // a read failure falls back to the sample rather than blanking the screen
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  return { live, loading };
}
