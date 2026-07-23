import { describe, expect, it } from 'vitest';
import { parseActivityFile } from '../parse/index.js';
import { parseTcx } from '../parse/tcx.js';

const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase>
  <Activities>
    <Activity Sport="Biking">
      <Id>2026-07-01T06:00:00Z</Id>
      <Lap StartTime="2026-07-01T06:00:00Z">
        <TotalTimeSeconds>20</TotalTimeSeconds>
        <DistanceMeters>150</DistanceMeters>
        <AverageHeartRateBpm><Value>140</Value></AverageHeartRateBpm>
        <Track>
          <Trackpoint>
            <Time>2026-07-01T06:00:00Z</Time>
            <Position><LatitudeDegrees>51.5</LatitudeDegrees><LongitudeDegrees>-0.1</LongitudeDegrees></Position>
            <AltitudeMeters>10</AltitudeMeters>
            <HeartRateBpm><Value>138</Value></HeartRateBpm>
            <Cadence>90</Cadence>
            <Extensions><TPX><Speed>7.5</Speed><Watts>210</Watts></TPX></Extensions>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-07-01T06:00:10Z</Time>
            <HeartRateBpm><Value>142</Value></HeartRateBpm>
            <Extensions><TPX><Speed>7.6</Speed><Watts>215</Watts></TPX></Extensions>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

describe('TCX parser', () => {
  it('parses laps and per-sample streams', () => {
    const a = parseTcx(TCX);
    expect(a.sport).toBe('bike');
    expect(a.startTime).toBe('2026-07-01T06:00:00.000Z');
    expect(a.durationS).toBe(20);
    expect(a.laps).toHaveLength(1);
    expect(a.laps[0]!).toMatchObject({ durationS: 20, distanceM: 150, avgHr: 140, avgSpeedMps: 7.5 });
    expect(a.streams.hr).toEqual([138, 142]);
    expect(a.streams.powerW).toEqual([210, 215]);
    expect(a.streams.speedMps).toEqual([7.5, 7.6]);
    expect(a.streams.timeS).toEqual([0, 10]);
  });

  it('finalises via parseActivityFile', () => {
    const a = parseActivityFile(TCX);
    expect(a.hasStreams).toBe(true);
    expect(a.avgHr).toBe(140); // round(mean(138,142))
    expect(a.avgPowerW).toBe(212.5);
  });

  it('throws on TCX with no activity', () => {
    expect(() => parseTcx('<TrainingCenterDatabase><Activities></Activities></TrainingCenterDatabase>')).toThrow(
      /no <Activity>/,
    );
  });
});
