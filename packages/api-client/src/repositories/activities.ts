/**
 * repositories/activities.ts — the ingest write path.
 *
 * Composes the pure, tested parser/dedup pipeline (@ironflow/core/ingest) with the database.
 * All queries are typed against the generated `Database`, so column/type mismatches are
 * caught at compile time. The service-role client bypasses RLS, so every query here scopes
 * by athlete_id explicitly (ARCH §6).
 */

import { isDuplicate, type ParsedActivity } from '@ironflow/core/ingest';
import {
  COMPLETION_MATCH_WINDOW_DAYS,
  addDaysISO,
  decouplingFromStreams,
  matchActivityToWorkout,
  rollupToSZones,
  srpe,
  timeInZones,
  trimp,
  type ActivityMatch,
  type PlanSport,
  type ZoneSet,
} from '@ironflow/core/physio';
import type { TriflowClient } from '../client.js';
import { packFloat32, packInt16, packLatLng, toByteaHex } from '../streams.js';
import type { Tables, TablesInsert } from '../types.js';
import { getZoneSetForSport } from './athleteModel.js';

const SECONDS_PER_MINUTE = 60;

// ── Pure mappers (unit-tested) ───────────────────────────────────────────────

/**
 * Aerobic decoupling for this session (§11), computed at ingest.
 *
 * This needs no athlete model at all: decoupling compares HR-to-intensity *within* the
 * session, so it needs no threshold. TRIMP does need zones, which now exist — see
 * `toActivityLoad`. TSS still needs CP/CS/CSS, which no field test has produced yet, so
 * `external_load` stays null rather than being filled with a guessed threshold.
 *
 * An invalid reading is stored, not discarded: the percentage is still evidence, and
 * `decoupling_valid` is exactly how §11.1 says to mark it untrustworthy.
 */
export function toActivityDecoupling(a: ParsedActivity): { pct: number | null; valid: boolean } {
  const result = a.streams
    ? decouplingFromStreams(a.streams, { sport: a.sport, ambientRecorded: a.temperatureC !== undefined })
    : null;
  return result ? { pct: result.decouplingPct, valid: result.valid } : { pct: null, valid: false };
}

/**
 * Time-in-zone and TRIMP for this activity (§3.4 accounting, §5.1 internal load), binned at
 * ingest while the parsed HR samples are still in hand.
 *
 * Ingest-time is the cheap place to do this: stored streams are bytea-packed and there is no
 * unpacker, so re-deriving these later would mean writing one. Binning here also means the
 * zones used are the ones in force *when the session happened*, which is what §3.1 wants.
 *
 * Null when there is no HR stream or no zone set (no athlete model yet, or a sport that has
 * none — see `getZoneSetForSport`). Null is honest; a guessed zone system would make
 * `internal_load` look measured when it isn't.
 */
export function toActivityLoad(
  a: ParsedActivity,
  zoneSet: ZoneSet | null,
): Pick<TablesInsert<'activities'>, 'internal_load' | 'time_in_s1_s' | 'time_in_s2_s' | 'time_in_s3_s'> {
  const binned =
    zoneSet && a.streams.hr ? timeInZones(a.streams.hr, zoneSet, { timeS: a.streams.timeS }) : null;
  if (!binned) return { internal_load: null, time_in_s1_s: null, time_in_s2_s: null, time_in_s3_s: null };

  const seconds = rollupToSZones(binned.secondsPerZone);
  return {
    internal_load: trimp({
      S1: seconds.S1 / SECONDS_PER_MINUTE,
      S2: seconds.S2 / SECONDS_PER_MINUTE,
      S3: seconds.S3 / SECONDS_PER_MINUTE,
    }),
    time_in_s1_s: Math.round(seconds.S1),
    time_in_s2_s: Math.round(seconds.S2),
    time_in_s3_s: Math.round(seconds.S3),
  };
}

export function toActivityRow(
  athleteId: string,
  a: ParsedActivity,
  zoneSet: ZoneSet | null = null,
): TablesInsert<'activities'> {
  const decoupling = toActivityDecoupling(a);
  return {
    athlete_id: athleteId,
    ...toActivityLoad(a, zoneSet),
    decoupling_pct: decoupling.pct,
    decoupling_valid: decoupling.valid,
    sport: a.sport,
    sub_sport: a.subSport ?? null,
    start_time: a.startTime,
    local_tz_offset_min: a.localTzOffsetMin,
    duration_s: Math.round(a.durationS),
    moving_time_s: a.movingTimeS ?? null,
    distance_m: a.distanceM ?? null,
    elevation_gain_m: a.elevationGainM ?? null,
    avg_hr: a.avgHr ?? null,
    max_hr: a.maxHr ?? null,
    avg_power_w: a.avgPowerW ?? null,
    normalized_power_w: a.normalizedPowerW ?? null,
    avg_speed_mps: a.avgSpeedMps ?? null,
    avg_cadence: a.avgCadence ?? null,
    temperature_c: a.temperatureC ?? null,
    hr_source: a.hrSource ?? null,
    has_rr_intervals: a.hasRrIntervals,
    has_streams: a.hasStreams,
    primary_provider: a.provider,
    provider_activity_id: a.providerActivityId ?? null,
  };
}

export function toLapRows(activityId: string, a: ParsedActivity): TablesInsert<'activity_laps'>[] {
  return a.laps.map((l) => ({
    activity_id: activityId,
    lap_index: l.lapIndex,
    start_offset_s: Math.round(l.startOffsetS),
    duration_s: Math.round(l.durationS),
    distance_m: l.distanceM ?? null,
    avg_hr: l.avgHr !== undefined ? Math.round(l.avgHr) : null,
    avg_power_w: l.avgPowerW ?? null,
    avg_speed_mps: l.avgSpeedMps ?? null,
  }));
}

export function toStreamRow(activityId: string, s: ParsedActivity['streams']): TablesInsert<'activity_streams'> {
  const hex = (u8: Uint8Array) => toByteaHex(u8);
  return {
    activity_id: activityId,
    sample_rate_hz: s.sampleRateHz ?? 1,
    time_s: s.timeS ? hex(packFloat32(s.timeS)) : null,
    hr: s.hr ? hex(packInt16(s.hr)) : null,
    rr_intervals: s.rrIntervalsMs ? hex(packInt16(s.rrIntervalsMs)) : null,
    power_w: s.powerW ? hex(packInt16(s.powerW)) : null,
    speed_mps: s.speedMps ? hex(packFloat32(s.speedMps)) : null,
    altitude_m: s.altitudeM ? hex(packFloat32(s.altitudeM)) : null,
    latlng: s.latlng ? hex(packLatLng(s.latlng)) : null,
    cadence: s.cadence ? hex(packInt16(s.cadence)) : null,
    temperature_c: s.temperatureC ? hex(packFloat32(s.temperatureC)) : null,
    compression: 'none',
  };
}

/** Cheap richness comparison from the flags exposed on both a ParsedActivity and a DB row. */
function richness(hasRr: boolean, hasStreams: boolean): number {
  return (hasRr ? 2 : 0) + (hasStreams ? 1 : 0);
}

// ── Impure repository ────────────────────────────────────────────────────────

export type UpsertOutcome = 'inserted' | 'idempotent_noop' | 'deduped_as_source' | 'promoted_primary';

async function findActivityIdByProvider(
  client: TriflowClient,
  provider: ParsedActivity['provider'],
  providerActivityId: string,
): Promise<string | null> {
  const { data } = await client
    .from('activities')
    .select('id')
    .eq('primary_provider', provider)
    .eq('provider_activity_id', providerActivityId)
    .maybeSingle();
  return data?.id ?? null;
}

async function findDuplicatePrimary(
  client: TriflowClient,
  athleteId: string,
  a: ParsedActivity,
): Promise<{ id: string; has_rr_intervals: boolean; has_streams: boolean } | null> {
  const startMs = new Date(a.startTime).getTime();
  const lo = new Date(startMs - 120_000).toISOString();
  const hi = new Date(startMs + 120_000).toISOString();
  const { data } = await client
    .from('activities')
    .select('id, start_time, duration_s, has_rr_intervals, has_streams')
    .eq('athlete_id', athleteId)
    .eq('sport', a.sport)
    .is('is_duplicate_of', null)
    .gte('start_time', lo)
    .lte('start_time', hi);
  for (const row of data ?? []) {
    if (isDuplicate({ sport: a.sport, startTime: row.start_time, durationS: row.duration_s }, a)) {
      return { id: row.id, has_rr_intervals: row.has_rr_intervals, has_streams: row.has_streams };
    }
  }
  return null;
}

async function insertActivity(
  client: TriflowClient,
  athleteId: string,
  a: ParsedActivity,
  zoneSet: ZoneSet | null,
): Promise<string> {
  const { data, error } = await client
    .from('activities')
    .insert(toActivityRow(athleteId, a, zoneSet))
    .select('id')
    .single();
  if (error || !data) throw new Error(`ingest: insert activity failed: ${error?.message}`);
  const activityId = data.id;

  const laps = toLapRows(activityId, a);
  if (laps.length > 0) {
    const { error: lapErr } = await client.from('activity_laps').insert(laps);
    if (lapErr) throw new Error(`ingest: insert laps failed: ${lapErr.message}`);
  }
  if (a.hasStreams || a.hasRrIntervals) {
    const { error: streamErr } = await client.from('activity_streams').insert(toStreamRow(activityId, a.streams));
    if (streamErr) throw new Error(`ingest: insert streams failed: ${streamErr.message}`);
  }
  if (a.providerActivityId) {
    await client
      .from('activity_sources')
      .insert({ activity_id: activityId, provider: a.provider, provider_activity_id: a.providerActivityId });
  }
  return activityId;
}

/**
 * Idempotent, dedup-aware ingest of one parsed activity. Replaying the same
 * (provider, provider_activity_id) is a no-op; the same session from a second provider is
 * merged, keeping the richer record as primary and marking the other `is_duplicate_of` it.
 */
export async function upsertParsedActivity(
  client: TriflowClient,
  athleteId: string,
  a: ParsedActivity,
): Promise<{ activityId: string; outcome: UpsertOutcome }> {
  // 1. Idempotency — replaying a webhook must not create a second row (ARCH §3).
  if (a.providerActivityId) {
    const existing = await findActivityIdByProvider(client, a.provider, a.providerActivityId);
    if (existing) return { activityId: existing, outcome: 'idempotent_noop' };
  }

  // 2. Cross-provider dedup (§7), and the zones this session's HR is binned into (§3.4/§5.1).
  const [dup, zoneSet] = await Promise.all([
    findDuplicatePrimary(client, athleteId, a),
    getZoneSetForSport(client, athleteId, a.sport),
  ]);
  const newId = await insertActivity(client, athleteId, a, zoneSet);
  if (!dup) return { activityId: newId, outcome: 'inserted' };

  // 3. Keep the richer record as primary; mark the other as a duplicate. Never hard-delete.
  const newRicher = richness(a.hasRrIntervals, a.hasStreams) > richness(dup.has_rr_intervals, dup.has_streams);
  if (newRicher) {
    await client.from('activities').update({ is_duplicate_of: newId }).eq('id', dup.id);
    return { activityId: newId, outcome: 'promoted_primary' };
  }
  await client.from('activities').update({ is_duplicate_of: dup.id }).eq('id', newId);
  return { activityId: dup.id, outcome: 'deduped_as_source' };
}

// ── Linking an activity to the session it completed ─────────────────────────

/**
 * The athlete's *local* calendar date for an activity (hard rule #8: stored UTC, reasoned
 * about in the athlete's zone). `local_tz_offset_min` is captured at ingest precisely so this
 * doesn't depend on where the server or the browser happens to be.
 */
export function activityLocalDate(startTime: string, localTzOffsetMin: number): string {
  const local = new Date(new Date(startTime).getTime() + localTzOffsetMin * 60_000);
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${local.getUTCFullYear()}-${m}-${d}`;
}

/**
 * Link an ingested activity to the planned session it completed, if one is plausible.
 *
 * Writes both directions (`activities.planned_workout_id`, `workouts.completed_activity_id`)
 * and marks the workout completed — which is what makes completion rate real for §10.3
 * ([[weeklyReplan]]) instead of inferred.
 *
 * Deliberately writes **no `plan_mutations` row**: hard rule #10 covers plan *mutations*, and
 * this records what the athlete did rather than changing what was asked of them. The plan is
 * untouched. (Adjusting a plan in response to it — §10.2/§10.3 — is audited, as it should be.)
 *
 * Returns the match, or null when nothing plausible was scheduled; an unmatched activity is
 * kept, not discarded — it still counts as training, it just isn't attributed to a session.
 */
export async function linkActivityToPlannedWorkout(
  client: TriflowClient,
  athleteId: string,
  activityId: string,
): Promise<ActivityMatch | null> {
  const { data: activity, error } = await client
    .from('activities')
    .select('id, sport, start_time, local_tz_offset_min, duration_s, planned_workout_id')
    .eq('id', activityId)
    .eq('athlete_id', athleteId)
    .single();
  if (error) throw error;
  if (activity.planned_workout_id) return null; // already attributed

  const localDate = activityLocalDate(activity.start_time, activity.local_tz_offset_min);
  const { data: candidates } = await client
    .from('workouts')
    .select('id, scheduled_date, sport, planned_duration_min, status, completed_activity_id')
    .eq('athlete_id', athleteId)
    .gte('scheduled_date', addDaysISO(localDate, -COMPLETION_MATCH_WINDOW_DAYS))
    .lte('scheduled_date', addDaysISO(localDate, COMPLETION_MATCH_WINDOW_DAYS));

  const match = matchActivityToWorkout(
    { localDate, sport: activity.sport as PlanSport, durationMin: activity.duration_s / SECONDS_PER_MINUTE },
    (candidates ?? []).map((w) => ({
      id: w.id,
      scheduledDate: w.scheduled_date,
      sport: w.sport as PlanSport,
      plannedDurationMin: w.planned_duration_min,
      completed: w.status === 'completed' || w.completed_activity_id !== null,
    })),
  );
  if (!match) return null;

  const { error: linkError } = await client
    .from('workouts')
    .update({ completed_activity_id: activityId, status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', match.workoutId)
    .eq('athlete_id', athleteId);
  if (linkError) throw linkError;

  const { error: backLinkError } = await client
    .from('activities')
    .update({ planned_workout_id: match.workoutId })
    .eq('id', activityId)
    .eq('athlete_id', athleteId);
  if (backLinkError) {
    // Never leave a workout pointing at an activity that doesn't point back.
    await client
      .from('workouts')
      .update({ completed_activity_id: null, status: 'scheduled' })
      .eq('id', match.workoutId);
    throw backLinkError;
  }

  return match;
}

// ── Perceived load: the one load model that needs no sensor ─────────────────

/**
 * sRPE for a session the athlete has just rated (§5.1, Foster et al. 2001).
 *
 * Pure, so the validation lives in one testable place. The RPE must be a **whole number** —
 * `srpe()` accepts any 0–10 value and the `rpe` column is a `smallint`, so a fractional rating
 * would be silently rounded on the way into the database while `perceived_load` kept the
 * unrounded product. The two would then disagree forever.
 *
 * 0 on the CR10 scale means *rest*, so it is rejected here: this rates a session that happened.
 */
export function perceivedLoadFor(rpe: number, durationS: number): number {
  if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
    throw new Error(`RPE must be a whole number on the 1–10 CR10 scale; got ${rpe}`);
  }
  return srpe({ rpe, durationMin: durationS / SECONDS_PER_MINUTE });
}

/**
 * Record the athlete's rating of a session, writing both `rpe` and the `perceived_load` derived
 * from it. Returns the stored sRPE.
 *
 * **Deliberately writes no `plan_mutations` row**, for the same reason
 * `linkActivityToPlannedWorkout` doesn't: hard rule #10 covers plan *mutations*, and this records
 * what the athlete felt rather than changing what was asked of them. The plan is untouched.
 *
 * sRPE is the only one of §5.1's three load models that needs no sensor and no threshold — and
 * it was the only one with no capture path anywhere in the app, so `perceived_load` was null on
 * every row and the §5.1 cross-check between metrics had nothing to compare.
 */
export async function setActivityRpe(
  client: TriflowClient,
  athleteId: string,
  activityId: string,
  rpe: number,
): Promise<number> {
  const { data, error } = await client
    .from('activities')
    .select('duration_s')
    .eq('id', activityId)
    .eq('athlete_id', athleteId)
    .single();
  if (error) throw error;

  // Duration comes from the stored activity, never the caller: the athlete rates effort, and
  // the app already knows how long they went for.
  const perceivedLoad = perceivedLoadFor(rpe, data.duration_s);

  const { error: writeError } = await client
    .from('activities')
    .update({ rpe, perceived_load: perceivedLoad })
    .eq('id', activityId)
    .eq('athlete_id', athleteId);
  if (writeError) throw writeError;

  return perceivedLoad;
}

/** The athlete's activities in [fromDate, toDate], newest first. Excludes deduped copies. */
export async function getActivitiesInRange(
  client: TriflowClient,
  athleteId: string,
  fromDate: string,
  toDate: string,
): Promise<Tables<'activities'>[]> {
  const { data } = await client
    .from('activities')
    .select('*')
    .eq('athlete_id', athleteId)
    .is('is_duplicate_of', null)
    .gte('start_time', `${fromDate}T00:00:00Z`)
    .lte('start_time', `${toDate}T23:59:59Z`)
    .order('start_time', { ascending: false });
  return data ?? [];
}
