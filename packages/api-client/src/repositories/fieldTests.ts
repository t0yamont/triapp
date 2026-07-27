/**
 * repositories/fieldTests.ts — recording what a field test actually measured.
 *
 * §12 opens with "tests are prescriptions, not suggestions", and `nextFieldTest` has been telling
 * athletes *when* to test since early on. Nothing anywhere recorded a **result**, so
 * `fitCriticalSwimSpeed` and `fitCriticalPower` had no caller outside their own tests, no
 * athlete ever acquired a threshold anchor, and `external_load` (TSS) was null for everyone.
 *
 * This is the write half of that loop. The read half is `deriveAthleteModel`, which now folds
 * stored sport anchors back into the model — a stored anchor nobody reads would be the same dead
 * end in a new place.
 */

import {
  CSS_LONG_M,
  CSS_SHORT_M,
  fitCriticalSwimSpeed,
  type CssRejection,
  type CssTrial,
  type Estimate,
  type Sport,
} from '@ironflow/core/physio';
import type { TriflowClient } from '../client.js';
import type { Tables } from '../types.js';

/** The two time trials a CSS test is: 200 m and 400 m, one session, ~5 min easy between. */
export interface CssTestInput {
  shortTimeS: number;
  longTimeS: number;
}

export type FieldTestOutcome =
  | { status: 'recorded'; anchor: Estimate<number>; pacePer100m: number }
  | { status: 'rejected'; reason: CssRejection }
  | { status: 'blocked'; reason: string };

/** Seconds per 100 m — how swimmers actually read a pace. */
export function pacePer100m(speedMps: number): number {
  return 100 / speedMps;
}

/**
 * Postgres rejects an enum value that doesn't exist yet. `css_test` was added to the engine by
 * `D-GOAL-TIME-CSS` and to the database by migration `20260726100000` — which may not have been
 * applied to a given project. Detected explicitly so the athlete gets an actionable sentence
 * rather than a raw driver error, since this is the *first* code path that writes that value.
 */
function isMissingProvenanceEnum(message: string): boolean {
  return /invalid input value for enum provenance/i.test(message) || /css_test/i.test(message);
}

/**
 * Record a swim CSS time trial: fit it, store the anchor, supersede the previous one.
 *
 * The fit can legitimately refuse — wrong distances, a 400 m faster than the 200 m, or a 200 m
 * paced so hard the pair no longer describes a sustainable speed. A refusal is **not** an error
 * to swallow: an inflated CSS becomes every swim target and every swim TSS value until the next
 * test, so "we couldn't use that" is the correct outcome and the athlete is told why.
 */
export async function recordCssTest(
  client: TriflowClient,
  athleteId: string,
  input: CssTestInput,
  now: string,
): Promise<FieldTestOutcome> {
  const trials: [CssTrial, CssTrial] = [
    { distanceM: CSS_SHORT_M, timeS: input.shortTimeS },
    { distanceM: CSS_LONG_M, timeS: input.longTimeS },
  ];
  const { estimate, rejection } = fitCriticalSwimSpeed(trials, now);
  if (!estimate) return { status: 'rejected', reason: rejection ?? 'pacing_inconsistent' };

  // One current anchor per sport+type: close the old one before opening the new (I14's audit
  // trail — an anchor is superseded, never overwritten, so a past prescription stays explicable).
  const { error: supersedeError } = await client
    .from('athlete_anchors')
    .update({ superseded_at: now })
    .eq('athlete_id', athleteId)
    .eq('sport', 'swim')
    .eq('anchor_type', 'css')
    .is('superseded_at', null);
  if (supersedeError) throw supersedeError;

  const { error } = await client.from('athlete_anchors').insert({
    athlete_id: athleteId,
    sport: 'swim',
    anchor_type: 'css',
    value_numeric: estimate.value,
    unit: 'm/s',
    confidence: estimate.confidence,
    provenance: estimate.provenance,
    measured_at: estimate.measuredAt,
    sample_size: 2,
  });
  if (error) {
    if (isMissingProvenanceEnum(error.message)) {
      return {
        status: 'blocked',
        reason:
          'This project is missing the provenance migration (20260726100000_provenance_add_tiers). Apply it and record the test again — nothing was saved.',
      };
    }
    throw error;
  }

  // Close the prescription this fulfils. Without it the test stays "scheduled" for ever and the
  // athlete is reminded about a test they have already done.
  await client
    .from('field_tests')
    .update({ status: 'completed', completed_at: now })
    .eq('athlete_id', athleteId)
    .eq('sport', 'swim')
    .eq('status', 'scheduled')
    .then(undefined, () => undefined);

  return { status: 'recorded', anchor: estimate, pacePer100m: pacePer100m(estimate.value) };
}

/** Current (not superseded) sport anchors, newest first. */
export async function getCurrentAnchors(
  client: TriflowClient,
  athleteId: string,
): Promise<Tables<'athlete_anchors'>[]> {
  const { data } = await client
    .from('athlete_anchors')
    .select('*')
    .eq('athlete_id', athleteId)
    .is('superseded_at', null)
    .order('measured_at', { ascending: false });
  return data ?? [];
}

/** The athlete's current CSS in m/s, or null. Used to score swim load (§5.1's swim TSS). */
export async function getCriticalSwimSpeed(client: TriflowClient, athleteId: string): Promise<number | null> {
  const { data } = await client
    .from('athlete_anchors')
    .select('value_numeric')
    .eq('athlete_id', athleteId)
    .eq('sport', 'swim')
    .eq('anchor_type', 'css')
    .is('superseded_at', null)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.value_numeric === undefined || data?.value_numeric === null ? null : Number(data.value_numeric);
}

/** Stored anchor rows → the `sports` map `buildAthleteModel` takes (§2.1). */
export function toSportAnchors(
  rows: Tables<'athlete_anchors'>[],
): Partial<Record<Sport, { criticalIntensity?: Estimate<number> }>> {
  const sports: Partial<Record<Sport, { criticalIntensity?: Estimate<number> }>> = {};
  for (const row of rows) {
    // `css`/`critical_speed`/`critical_power` all populate `criticalIntensity` — §6.3 keeps them
    // one concept per sport, deliberately distinct from a measured `lt2`.
    const isCritical = row.anchor_type === 'css' || row.anchor_type === 'critical_speed' || row.anchor_type === 'critical_power';
    if (!isCritical || !row.sport || row.value_numeric === null) continue;
    const sport = row.sport as Sport;
    if (sports[sport]?.criticalIntensity) continue; // newest wins; rows arrive newest first
    sports[sport] = {
      criticalIntensity: {
        value: Number(row.value_numeric),
        confidence: Number(row.confidence),
        provenance: row.provenance,
        measuredAt: row.measured_at,
      },
    };
  }
  return sports;
}
