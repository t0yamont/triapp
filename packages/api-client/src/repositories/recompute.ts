/**
 * repositories/recompute.ts — the nightly recompute (04-DATA-MODEL.sql tail; ARCH §8).
 *
 * `20260722120300_scheduled_jobs.sql` has been scheduling an hourly POST to `/recompute` since
 * the schema landed, and no such function existed. The consequence was larger than a 404:
 * **nothing ever wrote `ctl_total`, `atl_total`, `tsb_total`, `ctl_by_sport`, `daily_load`,
 * `monotony` or `strain`, and `mean_max_curves` had no writer at all.** The engine has had this
 * maths since Phase 4; nothing ran it. So the fitness chart recomputed CTL in the browser from
 * *planned* load on every page load, a new plan could not be seeded from measured fitness, and
 * G7/G8 had no persisted history to check a week against.
 *
 * Pure maths stays in `@ironflow/core/physio`; this is the read → compute → write shell.
 */

import {
  fitCriticalPower,
  nextFieldTest,
  type FieldTestType,
  type Sport,
  fitnessSeries,
  meanMaxCurve,
  mergeMeanMax,
  monotony,
  strain,
  type MeanMaxPoint,
} from '@ironflow/core/physio';
import { activityLocalDate } from './activities.js';
import type { TriflowClient } from '../client.js';
import type { Json } from '../database.types.js';
import type { Tables } from '../types.js';
import { unpackFloat32, unpackInt16 } from '../streams.js';

/**
 * How much history the daily series is rebuilt from. CTL's time constant is 42 days, so ~4× that
 * makes the seed irrelevant — the EWMA has forgotten anything older by the start of the window,
 * and a full-history rebuild every night would grow without bound for no extra accuracy.
 */
export const RECOMPUTE_WINDOW_DAYS = 180;

/** The trailing window monotony and strain are defined over (§5.3). */
const MONOTONY_WINDOW_DAYS = 7;

/** Mean-max window. Matches the 42-day CP fitting window with headroom for a sparse block. */
export const MEAN_MAX_WINDOW_DAYS = 90;

/** Durations the curve is sampled at, spanning both sports' CP-fittable ranges. */
const MEAN_MAX_DURATIONS_S = [5, 15, 30, 60, 120, 180, 300, 480, 600, 900, 1200, 1800, 3600];

const iso = (date: string, offsetDays: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * One day's training load.
 *
 * Order matters and is the §5 hierarchy: measured internal load (TRIMP from the athlete's own
 * zones) beats external load (TSS against a threshold estimate) beats what they said it felt
 * like. Taking whichever exists means an athlete with no power meter still gets a series, and one
 * with a full sensor set gets the better number, without two code paths.
 */
export function activityLoad(a: Pick<Tables<'activities'>, 'internal_load' | 'external_load' | 'perceived_load'>): number {
  return a.internal_load ?? a.external_load ?? a.perceived_load ?? 0;
}

export interface DailyRollup {
  date: string;
  load: number;
  bySport: Record<string, number>;
}

/**
 * Bucket activities into a **dense, consecutive** day array — rest days present with load 0.
 * `fitnessSeries` decays per element, so a gap-compressed array would decay by *sessions* rather
 * than by days and quietly inflate CTL for anyone who trains intermittently.
 *
 * Days come from `activityLocalDate`, not the UTC timestamp: a 6am ride in New Zealand belongs to
 * the day the athlete rode it (hard rule 8).
 */
export function rollUpDays(activities: readonly Tables<'activities'>[], from: string, to: string): DailyRollup[] {
  const byDate = new Map<string, DailyRollup>();
  for (let d = from; d <= to; d = iso(d, 1)) byDate.set(d, { date: d, load: 0, bySport: {} });

  for (const a of activities) {
    const day = byDate.get(activityLocalDate(a.start_time, a.local_tz_offset_min));
    if (!day) continue; // outside the window — the read is bounded by UTC, the bucket by local date
    const load = activityLoad(a);
    day.load += load;
    day.bySport[a.sport] = (day.bySport[a.sport] ?? 0) + load;
  }
  return [...byDate.values()];
}

export interface DailyMetricRow {
  date: string;
  daily_load: number;
  ctl_total: number;
  atl_total: number;
  tsb_total: number;
  ctl_by_sport: Json;
  monotony: number | null;
  strain: number | null;
}

/** Everything derived from the day series. Pure, so the whole computation is testable. */
export function buildDailyMetrics(days: readonly DailyRollup[]): DailyMetricRow[] {
  const fitness = fitnessSeries(days.map((d) => d.load));

  const sports = [...new Set(days.flatMap((d) => Object.keys(d.bySport)))];
  const bySport = new Map(
    sports.map((sport) => [sport, fitnessSeries(days.map((d) => d.bySport[sport] ?? 0))]),
  );

  return days.map((day, i) => {
    // Monotony needs a full trailing week; a partial one has a meaningless standard deviation.
    const haveWeek = i >= MONOTONY_WINDOW_DAYS - 1;
    const window = haveWeek ? days.slice(i - MONOTONY_WINDOW_DAYS + 1, i + 1).map((d) => d.load) : [];

    return {
      date: day.date,
      daily_load: day.load,
      ctl_total: fitness[i]!.ctl,
      atl_total: fitness[i]!.atl,
      tsb_total: fitness[i]!.tsb,
      ctl_by_sport: Object.fromEntries(sports.map((s) => [s, bySport.get(s)![i]!.ctl])) as Json,
      monotony: haveWeek ? monotony(window) : null,
      strain: haveWeek ? strain(window) : null,
    };
  });
}

/**
 * Rebuild the athlete's daily metrics up to `today` and persist them.
 *
 * The upsert lists only derived columns, so PostgREST's `ON CONFLICT DO UPDATE` touches only
 * those — an athlete's check-in and readiness on the same row survive the recompute untouched.
 */
export async function recomputeDailyMetrics(
  client: TriflowClient,
  athleteId: string,
  today: string,
): Promise<{ days: number; primarySport: string | null }> {
  const from = iso(today, -RECOMPUTE_WINDOW_DAYS);
  const { data, error } = await client
    .from('activities')
    .select('start_time, local_tz_offset_min, sport, internal_load, external_load, perceived_load')
    .eq('athlete_id', athleteId)
    .is('is_duplicate_of', null)
    // A day either side of the window: local dates can sit up to 14 h from their UTC timestamp.
    .gte('start_time', `${iso(from, -1)}T00:00:00Z`)
    .lte('start_time', `${iso(today, 1)}T23:59:59Z`);
  if (error) throw new Error(`recompute read failed: ${error.message}`);

  const days = rollUpDays((data ?? []) as Tables<'activities'>[], from, today);
  const rows = buildDailyMetrics(days);
  const { error: writeError } = await client
    .from('daily_metrics')
    .upsert(rows.map((r) => ({ athlete_id: athleteId, ...r })), { onConflict: 'athlete_id,date' });
  if (writeError) throw new Error(`recompute write failed: ${writeError.message}`);

  return { days: rows.length, primarySport: dominantSport(days) };
}

/**
 * The sport carrying the most load over the window — what §12 calls the athlete's primary sport
 * when deciding which test they are due. Derived rather than asked for: a triathlete's answer
 * changes across a season, and the load already says it.
 */
export function dominantSport(days: readonly DailyRollup[]): string | null {
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const [sport, load] of Object.entries(day.bySport)) totals.set(sport, (totals.get(sport) ?? 0) + load);
  }
  let best: string | null = null;
  let bestLoad = 0;
  for (const [sport, load] of totals) {
    if (load > bestLoad) {
      best = sport;
      bestLoad = load;
    }
  }
  return best;
}

// ── Mean-max curves, and the CP anchor they exist to produce ─────────────────

/** Sports with a mean-max curve worth keeping, and the stream each one is measured on. */
const CURVE_SPORTS = { bike: 'power_w', run: 'speed_mps' } as const;
type CurveSport = keyof typeof CURVE_SPORTS;

/**
 * Rebuild the rolling mean-max curve per sport and, where the fit holds, write the critical
 * power / critical speed anchor §6.3 says should come from ordinary training rather than a test.
 *
 * ponytail: re-reads every stream in the window each run — O(activities) blob reads per athlete
 * per night, which is fine at one activity a day and is not fine at ten. If it gets slow, store
 * each activity's own curve at ingest and merge those instead; `mergeMeanMax` already takes the
 * list of curves that would need.
 */
export async function recomputeMeanMax(
  client: TriflowClient,
  athleteId: string,
  today: string,
): Promise<{ curves: number; anchors: number }> {
  const from = iso(today, -MEAN_MAX_WINDOW_DAYS);
  const { data: activities } = await client
    .from('activities')
    .select('id, sport, start_time')
    .eq('athlete_id', athleteId)
    .is('is_duplicate_of', null)
    .eq('has_streams', true)
    .gte('start_time', `${from}T00:00:00Z`);

  const relevant = (activities ?? []).filter((a): a is typeof a & { sport: CurveSport } => a.sport in CURVE_SPORTS);
  if (relevant.length === 0) return { curves: 0, anchors: 0 };

  const { data: streams } = await client
    .from('activity_streams')
    .select('activity_id, power_w, speed_mps, sample_rate_hz')
    .in('activity_id', relevant.map((a) => a.id));
  const streamById = new Map((streams ?? []).map((s) => [s.activity_id, s]));

  let curves = 0;
  let anchors = 0;

  for (const sport of Object.keys(CURVE_SPORTS) as CurveSport[]) {
    const perActivity: { curve: MeanMaxPoint[]; date: string; id: string }[] = [];

    for (const activity of relevant.filter((a) => a.sport === sport)) {
      const stream = streamById.get(activity.id);
      if (!stream) continue;
      const samples =
        sport === 'bike' ? unpackInt16(stream.power_w as string | null) : unpackFloat32(stream.speed_mps as string | null);
      if (samples.length === 0) continue;
      const curve = meanMaxCurve(samples, MEAN_MAX_DURATIONS_S, Number(stream.sample_rate_hz) || 1);
      if (curve.length > 0) perActivity.push({ curve, date: activity.start_time, id: activity.id });
    }
    if (perActivity.length === 0) continue;

    const merged = mergeMeanMax(perActivity.map((p) => p.curve));
    const metric = sport === 'bike' ? 'power' : 'speed';
    const { error } = await client.from('mean_max_curves').upsert(
      {
        athlete_id: athleteId,
        sport,
        metric,
        window_start: from,
        window_end: today,
        curve: merged as unknown as Json,
      },
      { onConflict: 'athlete_id,sport,metric,window_start,window_end' },
    );
    if (error) throw new Error(`mean-max write failed: ${error.message}`);
    curves += 1;

    // The fit needs each point attributed to its session — two distinct sessions is one of its
    // own guards — so it takes the per-activity points, not the merged curve.
    const fit = fitCriticalPower(
      perActivity.flatMap((p) => p.curve.map((c) => ({ durationS: c.durationS, power: c.value, date: p.date, sessionId: p.id }))),
      sport,
      `${today}T00:00:00.000Z`,
    );
    if (fit.estimate) {
      const ids = [...new Set(perActivity.map((p) => p.id))];
      anchors += (await writeAnchor(client, athleteId, sport, fit.estimate, ids)) ? 1 : 0;
    }
  }

  return { curves, anchors };
}

/**
 * Below this, the fit has not really moved — the same efforts re-fitted a night later. Writing an
 * anchor anyway would manufacture a new "measurement" every night and fill the history the
 * supersede chain exists to keep readable.
 */
const ANCHOR_MOVE_EPSILON: Record<CurveSport, number> = { bike: 1, run: 0.01 };

/**
 * Supersede the current anchor and open a new one — never overwrite (I14: a past prescription has
 * to stay explicable). W\u2032 rides along in `value_json`; it is a property of the same fit, and a
 * second anchor row for it would need its own supersede chain to say nothing extra.
 */
async function writeAnchor(
  client: TriflowClient,
  athleteId: string,
  sport: CurveSport,
  estimate: { value: { criticalIntensity: number; wPrime: number }; confidence: number; provenance: string; measuredAt: string },
  sourceActivityIds: string[],
): Promise<boolean> {
  const anchorType = sport === 'bike' ? 'critical_power' : 'critical_speed';
  const value = estimate.value.criticalIntensity;

  const { data: current } = await client
    .from('athlete_anchors')
    .select('value_numeric')
    .eq('athlete_id', athleteId)
    .eq('sport', sport)
    .eq('anchor_type', anchorType)
    .is('superseded_at', null)
    .maybeSingle();
  if (current && Math.abs(Number(current.value_numeric) - value) < ANCHOR_MOVE_EPSILON[sport]) return false;

  await client
    .from('athlete_anchors')
    .update({ superseded_at: estimate.measuredAt })
    .eq('athlete_id', athleteId)
    .eq('sport', sport)
    .eq('anchor_type', anchorType)
    .is('superseded_at', null);

  const { error } = await client.from('athlete_anchors').insert({
    athlete_id: athleteId,
    sport,
    anchor_type: anchorType,
    value_numeric: value,
    value_json: { wPrime: estimate.value.wPrime } as Json,
    unit: sport === 'bike' ? 'W' : 'm/s',
    confidence: estimate.confidence,
    provenance: estimate.provenance as Tables<'athlete_anchors'>['provenance'],
    measured_at: estimate.measuredAt,
    sample_size: sourceActivityIds.length,
    source_activity_ids: sourceActivityIds,
  });
  if (error) throw new Error(`anchor write failed: ${error.message}`);
  return true;
}

// ── Field tests the athlete is due (§12) ────────────────────────────────────

/**
 * The `field_tests.protocol` each engine test type maps to. The engine names *what* is being
 * re-measured; the column names *how*, and the check constraint on it is the authority.
 */
const TEST_PROTOCOL: Record<FieldTestType, string> = {
  lt2: '20min_tt',
  full_battery: 'cp_12_3',
  confirmatory: '20min_tt',
};

/** A swim primary sport tests CSS; everything else uses the protocol above. */
const swimProtocol = (sport: string, fallback: string): string => (sport === 'swim' ? 'css_400_200' : fallback);

/**
 * Write the field test the athlete is due, if they are due one and none is already open.
 *
 * §12 opens with "tests are prescriptions, not suggestions", and `nextFieldTest` has been able to
 * say *which* test and *by when* since Phase 5 — but nothing ever wrote a row, so no test was ever
 * scheduled, and the `test_due` notification read a table that could never have anything in it.
 */
export async function scheduleDueFieldTest(
  client: TriflowClient,
  athleteId: string,
  today: string,
  primarySport: string | null,
): Promise<boolean> {
  // Already prescribed and not yet done — do not stack a second one on top.
  const { data: open } = await client
    .from('field_tests')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('status', 'scheduled')
    .limit(1);
  if (open && open.length > 0) return false;

  const [{ data: model }, { data: lastTest }, { data: races }] = await Promise.all([
    client.from('athlete_model_current').select('combined_confidence').eq('athlete_id', athleteId).maybeSingle(),
    client
      .from('field_tests')
      .select('scheduled_date, completed_at')
      .eq('athlete_id', athleteId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1),
    client
      .from('races')
      .select('race_date')
      .eq('athlete_id', athleteId)
      .eq('priority', 'A')
      .gte('race_date', today)
      .order('race_date', { ascending: true })
      .limit(1),
  ]);

  // No model yet means nothing to re-anchor — the first anchors have to exist before they can
  // go stale, and prescribing a test to an athlete with no baseline tests nothing.
  if (!model) return false;

  const lastDate = lastTest?.[0]?.completed_at ?? lastTest?.[0]?.scheduled_date ?? null;
  const weeksSinceLastTest = lastDate
    ? Math.floor((new Date(today).getTime() - new Date(lastDate).getTime()) / (7 * 86_400_000))
    : // Never tested: far enough back to trip the cadence rule rather than a magic "0 weeks ago".
      Number.MAX_SAFE_INTEGER;

  const sport = (primarySport ?? 'run') as Sport;
  const trigger = nextFieldTest({
    confidence: Number(model.combined_confidence),
    weeksSinceLastTest,
    primarySport: sport,
    ...(races?.[0]
      ? { daysToARace: Math.round((new Date(races[0].race_date).getTime() - new Date(today).getTime()) / 86_400_000) }
      : {}),
  });
  if (!trigger) return false;

  const testSport = (trigger.sport ?? sport) as Sport;
  const { error } = await client.from('field_tests').insert({
    athlete_id: athleteId,
    sport: testSport,
    protocol: swimProtocol(testSport, TEST_PROTOCOL[trigger.test]),
    // The deadline, not today: §12 places tests against the week, and the athlete has until then.
    scheduled_date: iso(today, Math.max(0, trigger.deadlineDayIndex)),
    status: 'scheduled',
  });
  if (error) throw new Error(`field test schedule failed: ${error.message}`);
  return true;
}
