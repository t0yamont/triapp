/**
 * repositories/races.ts — the athlete's race calendar read path.
 *
 * Onboarding already writes a race row; this reads them back so the Races page can run the
 * real calendar through the engine's `resolveRaceCalendar` (§9) instead of guessing which one
 * is the A race. Scoped by athlete_id explicitly, as with every other repository here: under
 * RLS that is redundant, under the service-role client it is the only thing scoping the query.
 */

import type { TriflowClient } from '../client.js';
import type { Tables } from '../types.js';

/** The athlete's races on or after `fromDate` (ISO calendar date), soonest first. */
export async function getUpcomingRaces(
  client: TriflowClient,
  athleteId: string,
  fromDate: string,
): Promise<Tables<'races'>[]> {
  const { data } = await client
    .from('races')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('race_date', fromDate)
    .order('race_date', { ascending: true });
  return data ?? [];
}
