/**
 * ingest/normalize.ts — fill an activity's summary metrics from its streams.
 *
 * Parsers extract whatever the file gives directly (FIT session/lap summaries, or nothing);
 * this finalises every activity consistently: derived summaries where they were missing,
 * plus the `hasStreams` / `hasRrIntervals` / `hrSource` flags the data model and the engine
 * rely on. Authoritative values already set by a parser are never overwritten.
 */

import type { ParsedActivity, ParsedStreams } from './types.js';

export function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function maxOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => (b > a ? b : a), values[0]!);
}

/**
 * Normalized Power: 4th root of the mean of the 4th powers of a 30-second rolling average
 * of power. Needs enough samples to fill one window; otherwise undefined (falls back to
 * average power at the call site).
 */
export function normalizedPower(power: number[], sampleRateHz = 1): number | undefined {
  const win = Math.max(1, Math.round(30 * sampleRateHz));
  if (power.length < win) return undefined;
  const rolling: number[] = [];
  let sum = 0;
  for (let i = 0; i < power.length; i++) {
    sum += power[i]!;
    if (i >= win) sum -= power[i - win]!;
    if (i >= win - 1) rolling.push(sum / win);
  }
  const meanFourth = rolling.reduce((a, p) => a + p ** 4, 0) / rolling.length;
  return meanFourth ** 0.25;
}

/** Sum of positive consecutive altitude deltas (total ascent). */
export function elevationGain(altitude: number[]): number | undefined {
  if (altitude.length < 2) return undefined;
  let gain = 0;
  for (let i = 1; i < altitude.length; i++) {
    const d = altitude[i]! - altitude[i - 1]!;
    if (d > 0) gain += d;
  }
  return gain;
}

const EARTH_RADIUS_M = 6371000;
/** Great-circle distance summed along a lat/lng track (metres). */
export function haversineDistance(latlng: [number, number][]): number | undefined {
  if (latlng.length < 2) return undefined;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < latlng.length; i++) {
    const [lat1, lon1] = latlng[i - 1]!;
    const [lat2, lon2] = latlng[i]!;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    total += 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

function streamPresent(s: ParsedStreams): boolean {
  return [s.hr, s.powerW, s.speedMps, s.altitudeM, s.cadence, s.latlng].some(
    (a) => a !== undefined && a.length > 0,
  );
}

/** Return a finalised copy of the activity with derived summaries and data-quality flags. */
export function normalizeActivity(activity: ParsedActivity): ParsedActivity {
  const s = activity.streams;
  const a: ParsedActivity = { ...activity, streams: s };

  if (a.durationS === undefined || a.durationS === 0) {
    if (s.timeS && s.timeS.length >= 2) a.durationS = s.timeS[s.timeS.length - 1]! - s.timeS[0]!;
  }
  if (a.avgHr === undefined && s.hr && s.hr.length > 0) a.avgHr = Math.round(mean(s.hr)!);
  if (a.maxHr === undefined && s.hr && s.hr.length > 0) a.maxHr = maxOf(s.hr);
  if (a.avgPowerW === undefined && s.powerW && s.powerW.length > 0) a.avgPowerW = mean(s.powerW);
  if (a.normalizedPowerW === undefined && s.powerW && s.powerW.length > 0) {
    a.normalizedPowerW = normalizedPower(s.powerW, s.sampleRateHz ?? 1) ?? a.avgPowerW;
  }
  if (a.avgCadence === undefined && s.cadence && s.cadence.length > 0) a.avgCadence = mean(s.cadence);
  if (a.elevationGainM === undefined && s.altitudeM && s.altitudeM.length > 0) {
    a.elevationGainM = elevationGain(s.altitudeM);
  }
  if (a.distanceM === undefined && s.latlng && s.latlng.length > 1) {
    a.distanceM = haversineDistance(s.latlng);
  }
  if (a.avgSpeedMps === undefined) {
    if (a.distanceM !== undefined && a.durationS > 0) a.avgSpeedMps = a.distanceM / a.durationS;
    else if (s.speedMps && s.speedMps.length > 0) a.avgSpeedMps = mean(s.speedMps);
  }

  a.hasRrIntervals = (s.rrIntervalsMs?.length ?? 0) > 0;
  a.hasStreams = streamPresent(s);

  if (a.hrSource === undefined) {
    // Only RR-capable devices (chest straps) record beat-to-beat intervals (§6.1). Without
    // RR and without any HR we know it is 'none'; HR-but-no-RR is left unknown (nullable).
    if (a.hasRrIntervals) a.hrSource = 'chest_strap';
    else if (a.avgHr === undefined && !(s.hr && s.hr.length > 0)) a.hrSource = 'none';
  }

  return a;
}
