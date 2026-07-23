/**
 * ingest/parse/gpx.ts — GPX 1.1 track parser (03-ROADMAP Phase 2; 05-INTEGRATIONS §1).
 *
 * GPX carries a track of points with optional Garmin TrackPointExtension (hr, cadence,
 * temperature) and a <power> extension. It has no laps and no RR intervals. Times are UTC.
 */

import type { IngestProvider, ParsedActivity, ParsedStreams } from '../types.js';
import { mapKeywordSport } from './sportmap.js';
import { num, toArray, xmlParser } from './xml.js';

export function parseGpx(xml: string, provider: IngestProvider = 'fit_upload'): ParsedActivity {
  const doc = xmlParser.parse(xml);
  const gpx = doc?.gpx;
  if (!gpx) throw new Error('GPX: no <gpx> root element');

  const trk = toArray(gpx.trk)[0];
  if (!trk) throw new Error('GPX: no <trk> element');

  const points = toArray(trk.trkseg).flatMap((seg: Record<string, unknown>) => toArray(seg.trkpt));
  if (points.length === 0) throw new Error('GPX: track has no points');

  const timeS: number[] = [];
  const hr: number[] = [];
  const cadence: number[] = [];
  const altitudeM: number[] = [];
  const powerW: number[] = [];
  const temperatureC: number[] = [];
  const latlng: [number, number][] = [];

  let firstMs: number | undefined;
  let lastMs = 0;
  let anyHr = false;
  let anyCad = false;
  let anyAlt = false;
  let anyPow = false;
  let anyTemp = false;

  for (const p of points as Record<string, unknown>[]) {
    const t = typeof p['time'] === 'string' ? new Date(p['time']).getTime() : undefined;
    if (t !== undefined && Number.isFinite(t)) {
      if (firstMs === undefined) firstMs = t;
      lastMs = t;
      timeS.push((t - firstMs) / 1000);
    }
    const lat = num(p['@_lat']);
    const lon = num(p['@_lon']);
    if (lat !== undefined && lon !== undefined) latlng.push([lat, lon]);

    const ele = num(p['ele']);
    altitudeM.push(ele ?? 0);
    if (ele !== undefined) anyAlt = true;

    const ext = (p['extensions'] ?? {}) as Record<string, unknown>;
    const tpx = (ext['TrackPointExtension'] ?? {}) as Record<string, unknown>;
    const hrv = num(tpx['hr']);
    hr.push(hrv ?? 0);
    if (hrv !== undefined) anyHr = true;
    const cad = num(tpx['cad']);
    cadence.push(cad ?? 0);
    if (cad !== undefined) anyCad = true;
    const temp = num(tpx['atemp']);
    temperatureC.push(temp ?? 0);
    if (temp !== undefined) anyTemp = true;
    const pow = num(ext['power']);
    powerW.push(pow ?? 0);
    if (pow !== undefined) anyPow = true;
  }

  const streams: ParsedStreams = { sampleRateHz: 1 };
  if (timeS.length > 0) streams.timeS = timeS;
  if (latlng.length > 0) streams.latlng = latlng;
  if (anyHr) streams.hr = hr;
  if (anyCad) streams.cadence = cadence;
  if (anyAlt) streams.altitudeM = altitudeM;
  if (anyPow) streams.powerW = powerW;
  if (anyTemp) streams.temperatureC = temperatureC;

  const startTime = firstMs !== undefined ? new Date(firstMs).toISOString() : new Date(0).toISOString();

  return {
    sport: mapKeywordSport(typeof trk.type === 'string' ? trk.type : undefined),
    startTime,
    localTzOffsetMin: 0, // GPX times are UTC; local offset is unknown from this format
    durationS: firstMs !== undefined ? (lastMs - firstMs) / 1000 : 0,
    provider,
    hasRrIntervals: false,
    hasStreams: false, // finalised by normalizeActivity
    laps: [],
    streams,
  };
}
