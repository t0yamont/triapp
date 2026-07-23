import { describe, expect, it } from 'vitest';
import { parseGpx } from '../parse/gpx.js';
import { parseActivityFile } from '../parse/index.js';

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <type>running</type>
    <trkseg>
      <trkpt lat="51.5000" lon="-0.1000">
        <ele>10</ele>
        <time>2026-07-01T06:00:00Z</time>
        <extensions><gpxtpx:TrackPointExtension>
          <gpxtpx:hr>140</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad><gpxtpx:atemp>19</gpxtpx:atemp>
        </gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="51.5010" lon="-0.1010">
        <ele>14</ele>
        <time>2026-07-01T06:00:10Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe('GPX parser', () => {
  it('parses track points into streams', () => {
    const a = parseGpx(GPX);
    expect(a.sport).toBe('run');
    expect(a.startTime).toBe('2026-07-01T06:00:00.000Z');
    expect(a.durationS).toBe(10);
    expect(a.streams.timeS).toEqual([0, 10]);
    expect(a.streams.hr).toEqual([140, 150]);
    expect(a.streams.altitudeM).toEqual([10, 14]);
    expect(a.streams.cadence?.[0]).toBe(85);
    expect(a.streams.temperatureC?.[0]).toBe(19);
    expect(a.streams.latlng).toHaveLength(2);
    expect(a.hasRrIntervals).toBe(false);
  });

  it('finalises via parseActivityFile: distance from GPS, elevation gain, avg HR', () => {
    const a = parseActivityFile(GPX);
    expect(a.hasStreams).toBe(true);
    expect(a.avgHr).toBe(145); // round(mean(140,150))
    expect(a.maxHr).toBe(150);
    expect(a.elevationGainM).toBe(4); // +4 m
    expect(a.distanceM).toBeGreaterThan(100); // haversine over ~130 m
  });

  it('throws on GPX with no track points', () => {
    expect(() => parseGpx('<gpx><trk><trkseg></trkseg></trk></gpx>')).toThrow(/no points/);
  });
});
