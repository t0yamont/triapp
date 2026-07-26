'use client';

/**
 * lib/live-activities.ts — the athlete's own ingested activities, for the Activities list.
 *
 * This closes the feedback loop on upload: until now the list rendered `activities-demo.ts`, so
 * an athlete could upload a file, have it parsed, deduped, matched to a session and its load
 * measured — and see four sessions that never happened. `getActivitiesInRange` existed with no
 * callers.
 *
 * Returns null when there is nothing live (no Supabase env, not signed in, no activities) so the
 * page falls back to the sample, exactly as [[live-plan]] and [[live-analytics]] do.
 *
 * Two rules this file exists to respect:
 *  - **Hard rule #6** — a list view never fetches streams. `getActivitiesInRange` selects from
 *    `activities` only; the zone breakdown that needs streams belongs to the detail view.
 *  - **Hard rule #8** — a session's day is its *local* calendar day, from the
 *    `local_tz_offset_min` captured at ingest (`activityLocalDate`), never the UTC prefix of
 *    `start_time`. A 21:00 local ride is not tomorrow's session.
 */

import { activityLocalDate, getActivitiesInRange, getWorkoutsInRange, type Tables } from '@ironflow/api-client';
import { addDaysISO } from '@ironflow/core/physio';
import { useEffect, useState } from 'react';
import type { ActivitySport, ActivitySummary } from './activities-demo';
import { todayISO } from './live-plan';
import { useSupabase } from './supabase';

/** How far back the list reads. Recent enough to be a feedback loop, short enough to stay one query. */
export const LIST_WINDOW_DAYS = 28;

const SECONDS_PER_MINUTE = 60;
const METRES_PER_KM = 1000;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `brick` renders as a run, matching `toComingUp` in [[live-plan]] — a brick is a ride into a
 * run and the run is the part that carries the load. Everything else keeps its own identity
 * rather than being coerced into one of the three headline sports.
 */
function viewSport(sport: Tables<'activities'>['sport']): ActivitySport {
  return sport === 'brick' ? 'run' : sport;
}

/** Labels for a plain `YYYY-MM-DD` local date, parsed as local parts so no UTC shift applies. */
export function dateLabels(localDate: string): { dateLabel: string; dayLabel: string } {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return {
    dateLabel: `${d} ${MONTH_SHORT[m - 1] ?? ''}`,
    dayLabel: WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()] ?? '',
  };
}

const num = (v: number | string | null): number | null => (v === null ? null : Math.round(Number(v)));

const SPORT_LABEL: Record<ActivitySport, string> = {
  run: 'Run',
  bike: 'Bike',
  swim: 'Swim',
  strength: 'Strength',
  other: 'Session',
};

/**
 * One stored activity → one list row. Pure, so the awkward parts (local date, null loads,
 * numeric columns arriving as strings from Postgres) are decided in one testable place.
 *
 * `titleOf` supplies the linked session's name when the activity was attributed to one; an
 * unattributed activity has no name of its own in the schema, so it gets a plain
 * sport-and-duration label rather than an invented one.
 */
export function toActivitySummary(
  row: Tables<'activities'>,
  titleOf: (workoutId: string) => string | undefined,
): ActivitySummary {
  const localDate = activityLocalDate(row.start_time, row.local_tz_offset_min);
  const durationMin = Math.round(row.duration_s / SECONDS_PER_MINUTE);
  const sport = viewSport(row.sport);
  const linkedTitle = row.planned_workout_id ? titleOf(row.planned_workout_id) : undefined;
  const distanceM = row.distance_m === null ? null : Number(row.distance_m);

  return {
    id: row.id,
    ...dateLabels(localDate),
    sport,
    title: linkedTitle ?? `${SPORT_LABEL[sport]} · ${durationMin}m`,
    durationMin,
    distanceKm: distanceM === null ? null : Math.round((distanceM / METRES_PER_KM) * 10) / 10,
    tss: num(row.external_load),
    trimp: num(row.internal_load),
    srpe: num(row.perceived_load),
    status: row.planned_workout_id ? 'completed' : 'unplanned',
  };
}

/** The athlete's recent activities, newest first — or null when there is nothing live. */
export function useLiveActivities(): { live: ActivitySummary[] | null; loading: boolean } {
  const supabase = useSupabase();
  const [live, setLive] = useState<ActivitySummary[] | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const done = (value: ActivitySummary[] | null) => {
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
        const from = addDaysISO(today, -LIST_WINDOW_DAYS);
        // The workouts come along for their names only — one extra query beats storing a
        // duplicate title on the activity, and it keeps the two in sync if a session is renamed.
        const [rows, workouts] = await Promise.all([
          getActivitiesInRange(supabase, athleteId, from, today),
          getWorkoutsInRange(supabase, athleteId, from, today),
        ]);
        if (rows.length === 0) return done(null);

        const names = new Map(workouts.map((w) => [w.id, w.name]));
        done(rows.map((row) => toActivitySummary(row, (id) => names.get(id))));
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
