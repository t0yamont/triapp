/**
 * repositories/athleteModel.ts — derive the athlete model (§2) from stored data and persist
 * it, together with the HR zones built from it (§3).
 *
 * This closes the longest-standing gap in the app: the engine has had `deriveHrMax`,
 * `deriveHrRest`, `reconcileAnchor` and `buildZones` since the first commit, and **nothing
 * ever wrote an athlete model**. Without one there are no zones, and without zones there is
 * no TRIMP and no time-in-zone — which is why those columns are still null on every activity.
 *
 * Everything here derives from data the athlete actually gave us:
 *   - resting HR  ← their morning check-ins (`daily_metrics.resting_hr`)
 *   - HRmax       ← an age formula from their date of birth, upgraded by any measured value
 *
 * Nothing is invented. If neither anchor can be derived, no model is written at all.
 */

import {
  HRREST_ROLLING_DAYS,
  addDaysISO,
  buildAthleteModel,
  buildZones,
  type AthleteModel,
  type Sport,
  type ZoneSet,
} from '@ironflow/core/physio';
import type { TriflowClient } from '../client.js';
import { getCurrentAnchors, toSportAnchors } from './fieldTests.js';
import type { Json } from '../database.types.js';
import { zoneSetSchema } from '../schemas.js';
import type { Enums, Tables } from '../types.js';

/** Sports the app builds HR zones for. Strength and brick inherit from their parent sport. */
const ZONED_SPORTS: Sport[] = ['run', 'bike', 'swim'];

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Whole years between a date of birth and `now` — the age the HRmax formulas take. */
export function ageFromDateOfBirth(dateOfBirth: string, now: string): number {
  return Math.floor((new Date(now).getTime() - new Date(dateOfBirth).getTime()) / MS_PER_YEAR);
}

export interface DerivedAthleteModel {
  model: AthleteModel;
  combinedConfidence: number;
  zones: { sport: Sport; zoneSet: ZoneSet }[];
}

/**
 * Build the athlete's current model from stored data, or null when there isn't enough.
 *
 * `now` is passed in rather than read from a clock so this is testable and so the model's
 * `updatedAt` matches the moment the caller means.
 */
export async function deriveAthleteModel(
  client: TriflowClient,
  athleteId: string,
  now: string,
): Promise<DerivedAthleteModel | null> {
  const today = now.slice(0, 10);

  const [{ data: profile }, { data: daily }, anchorRows] = await Promise.all([
    client.from('profiles').select('date_of_birth').eq('id', athleteId).maybeSingle(),
    client
      .from('daily_metrics')
      .select('date, resting_hr')
      .eq('athlete_id', athleteId)
      .gte('date', addDaysISO(today, -HRREST_ROLLING_DAYS))
      .lte('date', today)
      .not('resting_hr', 'is', null)
      .order('date', { ascending: false }),
    // Threshold anchors a field test produced (§6.3). Without this the capture screen would
    // write a row nobody reads — the exact dead end this repo keeps re-creating.
    getCurrentAnchors(client, athleteId),
  ]);

  // §2.3 reads morning HR as the athlete's own recent readings, newest first.
  const morningReadings = (daily ?? []).map((d) => d.resting_hr).filter((v): v is number => v !== null);

  const built = buildAthleteModel({
    hrMax: {
      ...(profile?.date_of_birth ? { age: ageFromDateOfBirth(profile.date_of_birth, now) } : {}),
      now,
    },
    hrRest: {
      ...(morningReadings.length > 0 ? { morningReadings } : {}),
      now,
    },
    sports: toSportAnchors(anchorRows),
    now,
  });
  if (!built) return null;

  return {
    ...built,
    zones: ZONED_SPORTS.map((sport) => ({ sport, zoneSet: buildZones(built.model, sport) })),
  };
}

/**
 * Persist the model and its zones.
 *
 * `athlete_model_current` is a single row per athlete (upsert). Zone sets are versioned
 * rather than overwritten: the old row gets `valid_to` set and a new one is inserted, so a
 * past prescription can still be explained by the zones that were in force at the time.
 */
export async function persistAthleteModel(
  client: TriflowClient,
  athleteId: string,
  derived: DerivedAthleteModel,
  now: string,
): Promise<void> {
  const { error: modelError } = await client.from('athlete_model_current').upsert(
    {
      athlete_id: athleteId,
      model: derived.model as unknown as Json,
      combined_confidence: derived.combinedConfidence,
      computed_at: now,
    },
    { onConflict: 'athlete_id' },
  );
  if (modelError) throw modelError;

  // Close the zone sets currently in force before opening new ones.
  const { error: closeError } = await client
    .from('athlete_zones')
    .update({ valid_to: now })
    .eq('athlete_id', athleteId)
    .is('valid_to', null);
  if (closeError) throw closeError;

  const { error: zonesError } = await client.from('athlete_zones').insert(
    derived.zones.map(({ sport, zoneSet }) => ({
      athlete_id: athleteId,
      sport,
      modality: 'hr',
      anchor_mode: zoneSet.mode,
      zones: zoneSet as unknown as Json,
      valid_from: now,
    })),
  );
  if (zonesError) throw zonesError;

  // The anchors themselves, superseding whatever they replace — the audit trail for §2.
  const { error: supersedeError } = await client
    .from('athlete_anchors')
    .update({ superseded_at: now })
    .eq('athlete_id', athleteId)
    .in('anchor_type', ['hr_max', 'hr_rest'])
    .is('superseded_at', null);
  if (supersedeError) throw supersedeError;

  const { error: anchorError } = await client.from('athlete_anchors').insert([
    {
      athlete_id: athleteId,
      anchor_type: 'hr_max',
      value_numeric: derived.model.hrMax.value,
      unit: 'bpm',
      confidence: derived.model.hrMax.confidence,
      provenance: derived.model.hrMax.provenance,
      measured_at: derived.model.hrMax.measuredAt,
    },
    {
      athlete_id: athleteId,
      anchor_type: 'hr_rest',
      value_numeric: derived.model.hrRest.value,
      unit: 'bpm',
      confidence: derived.model.hrRest.confidence,
      provenance: derived.model.hrRest.provenance,
      measured_at: derived.model.hrRest.measuredAt,
      ...(derived.model.hrRest.sampleSize !== undefined ? { sample_size: derived.model.hrRest.sampleSize } : {}),
    },
  ]);
  if (anchorError) throw anchorError;
}

/**
 * Derive and persist in one step, returning what was written (or null when there wasn't
 * enough data). Safe to call repeatedly — it's an upsert plus a versioned zone insert.
 */
export async function refreshAthleteModel(
  client: TriflowClient,
  athleteId: string,
  now: string,
): Promise<DerivedAthleteModel | null> {
  const derived = await deriveAthleteModel(client, athleteId, now);
  if (!derived) return null;
  await persistAthleteModel(client, athleteId, derived, now);
  return derived;
}

/** The athlete's current model, or null if none has been computed yet. */
export async function getAthleteModel(
  client: TriflowClient,
  athleteId: string,
): Promise<Tables<'athlete_model_current'> | null> {
  const { data } = await client.from('athlete_model_current').select('*').eq('athlete_id', athleteId).maybeSingle();
  return data ?? null;
}

/** The zone sets currently in force, one per sport. */
export async function getCurrentZones(
  client: TriflowClient,
  athleteId: string,
): Promise<Tables<'athlete_zones'>[]> {
  const { data } = await client
    .from('athlete_zones')
    .select('*')
    .eq('athlete_id', athleteId)
    .is('valid_to', null);
  return data ?? [];
}

/**
 * The HR zone set in force for one sport, or null when there isn't one.
 *
 * Null is the normal case for `brick`/`strength`/`other` (only [[ZONED_SPORTS]] get zones) and
 * for an athlete with no model yet — callers must treat it as "not computable", never guess a
 * default zone system.
 */
export async function getZoneSetForSport(
  client: TriflowClient,
  athleteId: string,
  sport: Enums<'sport'>,
): Promise<ZoneSet | null> {
  if (!ZONED_SPORTS.includes(sport as Sport)) return null;
  const { data } = await client
    .from('athlete_zones')
    .select('zones')
    .eq('athlete_id', athleteId)
    .eq('sport', sport)
    .eq('modality', 'hr')
    .is('valid_to', null)
    .maybeSingle();
  if (!data) return null;

  const parsed = zoneSetSchema.safeParse(data.zones);
  return parsed.success ? parsed.data : null;
}
