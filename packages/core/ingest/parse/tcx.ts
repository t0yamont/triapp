/**
 * ingest/parse/tcx.ts — Garmin TCX parser (05-INTEGRATIONS §1).
 *
 * TCX carries laps, each with a track of points (hr, cadence, altitude, distance, position,
 * and TPX Speed/Watts). Times are UTC. No RR intervals.
 */

import type { IngestProvider, ParsedActivity, ParsedLap, ParsedStreams } from '../types.js';
import { mapKeywordSport } from './sportmap.js';
import { num, toArray, valueOf, xmlParser } from './xml.js';

export function parseTcx(xml: string, provider: IngestProvider = 'fit_upload'): ParsedActivity {
  const doc = xmlParser.parse(xml);
  const activity = toArray(doc?.TrainingCenterDatabase?.Activities?.Activity)[0];
  if (!activity) throw new Error('TCX: no <Activity> element');

  const sport = mapKeywordSport(typeof activity['@_Sport'] === 'string' ? activity['@_Sport'] : undefined);
  const tcxLaps = toArray(activity.Lap) as Record<string, unknown>[];
  if (tcxLaps.length === 0) throw new Error('TCX: activity has no laps');

  // Activity start: the <Id>, else the first lap's StartTime.
  const idTime = typeof activity.Id === 'string' ? new Date(activity.Id).getTime() : undefined;
  const firstLapStart = num(new Date(String(tcxLaps[0]!['@_StartTime'])).getTime());
  const startMs = Number.isFinite(idTime) ? idTime! : (firstLapStart ?? 0);

  const timeS: number[] = [];
  const hr: number[] = [];
  const cadence: number[] = [];
  const altitudeM: number[] = [];
  const powerW: number[] = [];
  const speedMps: number[] = [];
  const latlng: [number, number][] = [];
  const anyPresent = { hr: false, cad: false, alt: false, pow: false, spd: false };

  const laps: ParsedLap[] = [];

  tcxLaps.forEach((lap, lapIndex) => {
    const lapStartMs = new Date(String(lap['@_StartTime'])).getTime();
    const totalTime = num(lap['TotalTimeSeconds']);
    const lapDistance = num(lap['DistanceMeters']);
    laps.push({
      lapIndex,
      startOffsetS: Number.isFinite(lapStartMs) ? (lapStartMs - startMs) / 1000 : 0,
      durationS: totalTime ?? 0,
      distanceM: lapDistance,
      avgHr: valueOf(lap['AverageHeartRateBpm']),
      avgSpeedMps: lapDistance !== undefined && totalTime ? lapDistance / totalTime : undefined,
    });

    const track = (lap['Track'] ?? {}) as Record<string, unknown>;
    for (const tp of toArray(track['Trackpoint']) as Record<string, unknown>[]) {
      const t = typeof tp['Time'] === 'string' ? new Date(tp['Time']).getTime() : undefined;
      if (t !== undefined && Number.isFinite(t)) timeS.push((t - startMs) / 1000);

      const pos = (tp['Position'] ?? {}) as Record<string, unknown>;
      const lat = num(pos['LatitudeDegrees']);
      const lon = num(pos['LongitudeDegrees']);
      if (lat !== undefined && lon !== undefined) latlng.push([lat, lon]);

      const alt = num(tp['AltitudeMeters']);
      altitudeM.push(alt ?? 0);
      if (alt !== undefined) anyPresent.alt = true;

      const h = valueOf(tp['HeartRateBpm']);
      hr.push(h ?? 0);
      if (h !== undefined) anyPresent.hr = true;

      const ext = (tp['Extensions'] ?? {}) as Record<string, unknown>;
      const tpx = (ext['TPX'] ?? {}) as Record<string, unknown>;
      const cad = num(tp['Cadence']) ?? num(tpx['RunCadence']);
      cadence.push(cad ?? 0);
      if (cad !== undefined) anyPresent.cad = true;
      const watts = num(tpx['Watts']);
      powerW.push(watts ?? 0);
      if (watts !== undefined) anyPresent.pow = true;
      const spd = num(tpx['Speed']);
      speedMps.push(spd ?? 0);
      if (spd !== undefined) anyPresent.spd = true;
    }
  });

  const streams: ParsedStreams = { sampleRateHz: 1 };
  if (timeS.length > 0) streams.timeS = timeS;
  if (latlng.length > 0) streams.latlng = latlng;
  if (anyPresent.hr) streams.hr = hr;
  if (anyPresent.cad) streams.cadence = cadence;
  if (anyPresent.alt) streams.altitudeM = altitudeM;
  if (anyPresent.pow) streams.powerW = powerW;
  if (anyPresent.spd) streams.speedMps = speedMps;

  const totalDuration = laps.reduce((sum, l) => sum + l.durationS, 0);

  return {
    sport,
    startTime: new Date(startMs).toISOString(),
    localTzOffsetMin: 0, // TCX times are UTC
    durationS: totalDuration,
    provider,
    hasRrIntervals: false,
    hasStreams: false, // finalised by normalizeActivity
    laps,
    streams,
  };
}
