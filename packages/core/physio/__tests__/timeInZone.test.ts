import { describe, expect, it } from 'vitest';
import { buildAthleteModel } from '../anchors/model.js';
import { trimp } from '../load/trimp.js';
import { buildZones } from '../zones/build.js';
import { rollupToSZones } from '../zones/seiler.js';
import { timeInZones, zoneOfHr } from '../zones/timeInZone.js';

const NOW = '2026-07-26T07:00:00.000Z';
const { model } = buildAthleteModel({
  hrMax: { athleteReported: { value: 190, measuredAt: NOW }, now: NOW },
  hrRest: { morningReadings: [50, 50, 50], now: NOW },
  now: NOW,
})!;
const zoneSet = buildZones(model, 'run');
const zones = zoneSet.zones;
const [z1, , , , z5] = zones;

describe('zoneOfHr', () => {
  it('places a heart rate inside its band', () => {
    for (const z of zones) {
      const mid = Math.floor((z.lower.bpm + z.upper.bpm) / 2);
      if (mid > z.lower.bpm && mid < z.upper.bpm) expect(zoneOfHr(mid, zones)).toBe(z.id);
    }
  });

  it('puts a boundary value in the higher zone, so no sample is double-counted', () => {
    const boundary = zones[1]!.lower.bpm;
    expect(zoneOfHr(boundary, zones)).toBe(zones[1]!.id);
  });

  it('clamps rather than drops values outside the model — never shortens the session', () => {
    expect(zoneOfHr(z1!.lower.bpm - 30, zones)).toBe('Z1'); // easier than modelled HRrest
    expect(zoneOfHr(z5!.upper.bpm + 30, zones)).toBe('Z5'); // above modelled HRmax: still maximal
  });

  it('returns null with no zones to bin into', () => {
    expect(zoneOfHr(150, [])).toBeNull();
  });

  it('puts a HR inside a gap between bands in the top zone rather than dropping it', () => {
    // `buildZones` never leaves a gap; a hand-edited or corrupt persisted zone set could.
    const gappy = [z1!, { ...z5!, lower: { ...z5!.lower, bpm: z1!.upper.bpm + 20 } }];
    expect(zoneOfHr(z1!.upper.bpm + 5, gappy)).toBe('Z5');
  });
});

describe('timeInZones', () => {
  const steady = (bpm: number, n: number) => Array.from({ length: n }, () => bpm);

  it('assumes 1 Hz when there is no time series', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    const result = timeInZones(steady(easy, 600), zoneSet)!;
    expect(result.totalSeconds).toBe(600);
    expect(result.secondsPerZone.Z1).toBe(600);
  });

  it('uses the gap to the next sample, so irregular sampling is handled', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    // Samples 5s apart ⇒ 3 samples cover 5 + 5 + 1 (last assumed) seconds.
    const result = timeInZones([easy, easy, easy], zoneSet, { timeS: [0, 5, 10] })!;
    expect(result.totalSeconds).toBe(11);
  });

  it('caps a recording break so a paused device cannot credit untrained hours', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    const result = timeInZones([easy, easy], zoneSet, { timeS: [0, 7200], maxSampleGapS: 60 })!;
    expect(result.totalSeconds).toBe(61); // 60 capped + 1 for the final sample
  });

  it('skips samples the time series does not cover', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    // A shorter timeS than hr means the device disagrees with itself: 2 samples timed
    // (1s + 1s assumed for the last), the third untimed and therefore uncountable.
    const result = timeInZones([easy, easy, easy], zoneSet, { timeS: [0, 1] })!;
    expect(result.totalSeconds).toBe(2);
  });

  it('ignores dropout samples', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    const result = timeInZones([easy, 0, easy, Number.NaN], zoneSet)!;
    expect(result.totalSeconds).toBe(2);
  });

  it('returns null when nothing usable is present', () => {
    expect(timeInZones([], zoneSet)).toBeNull();
    expect(timeInZones([0, 0, 0], zoneSet)).toBeNull();
  });

  it('splits a session across the zones it actually visited', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    const hard = z5!.lower.bpm + 1;
    const result = timeInZones([...steady(easy, 300), ...steady(hard, 100)], zoneSet)!;
    expect(result.secondsPerZone.Z1).toBe(300);
    expect(result.secondsPerZone.Z5).toBe(100);
    expect(result.totalSeconds).toBe(400);
  });

  it('feeds TRIMP end to end — harder work costs more per minute', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    const hard = z5!.lower.bpm + 1;
    const minutes = (bpm: number) => {
      const s = rollupToSZones(timeInZones(steady(bpm, 3600), zoneSet)!.secondsPerZone);
      return trimp({ S1: s.S1 / 60, S2: s.S2 / 60, S3: s.S3 / 60 });
    };
    expect(minutes(hard)).toBeGreaterThan(minutes(easy));
    expect(minutes(easy)).toBeGreaterThan(0);
  });
});
