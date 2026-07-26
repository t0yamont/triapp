/**
 * zones/timeInZone.ts — bin an activity's HR stream into the athlete's zones (§3.4, §5.1).
 *
 * This is what turns a heart-rate trace into the distribution accounting the whole plan
 * reasons over, and into TRIMP (`internal_load`). It needs a `ZoneSet`, which is why it could
 * only be written once the athlete model was actually persisted.
 *
 * Pure: HR samples in, seconds per zone out. No clock, no I/O.
 */

import type { HrZone, ZoneId, ZoneSet } from '../types.js';

/** Assumed sample spacing when an activity carries HR but no time series. */
const DEFAULT_SAMPLE_S = 1;

/**
 * Which zone a heart rate falls in.
 *
 * Bands are treated as `[lower, upper)` with the top zone inclusive, so a HR exactly on a
 * boundary lands in the higher zone consistently and no sample is counted twice. Values
 * outside the model's range are **clamped**, not dropped: a HR above the modelled HRmax is
 * genuinely maximal work (and a sign the HRmax anchor is low), while a HR below the modelled
 * resting HR is genuinely easy. Discarding either would silently shorten the session.
 */
export function zoneOfHr(hr: number, zones: readonly HrZone[]): ZoneId | null {
  if (zones.length === 0) return null;
  const first = zones[0]!;
  const last = zones[zones.length - 1]!;
  if (hr < first.lower.bpm) return first.id;
  if (hr >= last.upper.bpm) return last.id;
  return zones.find((z) => hr >= z.lower.bpm && hr < z.upper.bpm)?.id ?? last.id;
}

export interface TimeInZoneResult {
  /** Seconds in each of the five prescription zones. */
  secondsPerZone: Record<ZoneId, number>;
  /** Total seconds actually attributed — may be less than the activity if HR dropped out. */
  totalSeconds: number;
}

/**
 * Seconds spent in each zone across an HR stream.
 *
 * `timeS` gives each sample's offset from the start; the time a sample represents is the gap
 * to the *next* one, so irregular sampling and device pauses are handled correctly rather
 * than assuming 1 Hz. A gap longer than `maxSampleGapS` is treated as a recording break and
 * contributes only `maxSampleGapS` — otherwise a paused device would credit hours of Z1 that
 * were never trained.
 */
export function timeInZones(
  hr: readonly number[],
  zoneSet: ZoneSet,
  opts: { timeS?: readonly number[]; maxSampleGapS?: number } = {},
): TimeInZoneResult | null {
  if (hr.length === 0 || zoneSet.zones.length === 0) return null;

  const maxGap = opts.maxSampleGapS ?? DEFAULT_SAMPLE_S * 60;
  const secondsPerZone: Record<ZoneId, number> = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 };
  let totalSeconds = 0;

  for (let i = 0; i < hr.length; i++) {
    const beat = hr[i]!;
    if (!Number.isFinite(beat) || beat <= 0) continue; // dropout, not a real reading

    let seconds = DEFAULT_SAMPLE_S;
    if (opts.timeS) {
      const t = opts.timeS[i];
      const next = opts.timeS[i + 1];
      if (t === undefined) continue;
      seconds = next === undefined ? DEFAULT_SAMPLE_S : Math.min(Math.max(next - t, 0), maxGap);
    }

    // Non-null: `zoneOfHr` only returns null for an empty zone list, excluded above.
    const zone = zoneOfHr(beat, zoneSet.zones)!;
    secondsPerZone[zone] += seconds;
    totalSeconds += seconds;
  }

  return totalSeconds > 0 ? { secondsPerZone, totalSeconds } : null;
}
