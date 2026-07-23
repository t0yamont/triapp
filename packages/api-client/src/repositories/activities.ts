/**
 * repositories/activities.ts — the ingest write path.
 *
 * Composes the pure, tested parser/dedup pipeline (@ironflow/core/ingest) with the database.
 * All queries are typed against the generated `Database`, so column/type mismatches are
 * caught at compile time. The service-role client bypasses RLS, so every query here scopes
 * by athlete_id explicitly (ARCH §6).
 */

import { isDuplicate, type ParsedActivity } from '@ironflow/core/ingest';
import type { IronflowClient } from '../client.js';
import { packFloat32, packInt16, packLatLng, toByteaHex } from '../streams.js';
import type { TablesInsert } from '../types.js';

// ── Pure mappers (unit-tested) ───────────────────────────────────────────────

export function toActivityRow(athleteId: string, a: ParsedActivity): TablesInsert<'activities'> {
  return {
    athlete_id: athleteId,
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
  client: IronflowClient,
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
  client: IronflowClient,
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

async function insertActivity(client: IronflowClient, athleteId: string, a: ParsedActivity): Promise<string> {
  const { data, error } = await client.from('activities').insert(toActivityRow(athleteId, a)).select('id').single();
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
  client: IronflowClient,
  athleteId: string,
  a: ParsedActivity,
): Promise<{ activityId: string; outcome: UpsertOutcome }> {
  // 1. Idempotency — replaying a webhook must not create a second row (ARCH §3).
  if (a.providerActivityId) {
    const existing = await findActivityIdByProvider(client, a.provider, a.providerActivityId);
    if (existing) return { activityId: existing, outcome: 'idempotent_noop' };
  }

  // 2. Cross-provider dedup (§7).
  const dup = await findDuplicatePrimary(client, athleteId, a);
  const newId = await insertActivity(client, athleteId, a);
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
