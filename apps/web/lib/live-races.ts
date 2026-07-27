'use client';

/**
 * lib/live-races.ts — reads the athlete's persisted races (written by onboarding) so the
 * Races page can resolve a real calendar. Mirrors `live-plan.ts`: returns null whenever there
 * is nothing live to show (no Supabase env, not signed in, no races) so the caller falls back
 * to the sample athlete rather than rendering an empty page.
 */

import { getUpcomingRaces } from '@ironflow/api-client';
import type { EventType } from '@ironflow/core/physio';
import { useEffect, useState } from 'react';
import { todayISO } from './live-plan';
import type { Priority, RaceSource } from './race-calendar';
import { useSupabase } from './supabase';

const SECONDS_PER_HOUR = 3600;

/**
 * The athlete's upcoming races, or null when there is nothing live (⇒ caller uses the sample).
 *
 * `reloadKey` re-runs the read; bump it after adding a race so the list updates without a
 * navigation. One dependency beats a second copy of this query in the page.
 */
export function useLiveRaces(reloadKey = 0): { races: RaceSource[] | null; loading: boolean } {
  const supabase = useSupabase();
  const [races, setRaces] = useState<RaceSource[] | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const done = (value: RaceSource[] | null) => {
      if (!alive) return;
      setRaces(value);
      setLoading(false);
    };

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const athleteId = auth.user?.id;
        if (!athleteId) return done(null);

        const rows = await getUpcomingRaces(supabase, athleteId, todayISO());
        if (rows.length === 0) return done(null);

        done(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            date: row.race_date,
            eventType: row.event_type as EventType,
            priority: row.priority as Priority,
            ...(row.location ? { detail: row.location } : {}),
            // A goal time is the athlete's own expected duration — the best G9 input we have
            // before there is a prediction from real training data.
            ...(row.goal_time_s ? { expectedDurationH: row.goal_time_s / SECONDS_PER_HOUR } : {}),
          })),
        );
      } catch {
        done(null); // a read failure falls back to the sample rather than blanking the screen
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase, reloadKey]);

  return { races, loading };
}
