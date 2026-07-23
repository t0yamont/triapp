import { describe, expect, it } from 'vitest';
import {
  elevationGain,
  haversineDistance,
  maxOf,
  mean,
  normalizeActivity,
  normalizedPower,
} from '../normalize.js';
import type { ParsedActivity } from '../types.js';

function base(streams: ParsedActivity['streams']): ParsedActivity {
  return {
    sport: 'bike',
    startTime: '2026-07-01T06:00:00.000Z',
    localTzOffsetMin: 0,
    durationS: 0,
    provider: 'fit_upload',
    hasRrIntervals: false,
    hasStreams: false,
    laps: [],
    streams,
  };
}

describe('summary helpers', () => {
  it('mean / maxOf handle empty and non-empty', () => {
    expect(mean([])).toBeUndefined();
    expect(mean([2, 4, 6])).toBe(4);
    expect(maxOf([])).toBeUndefined();
    expect(maxOf([3, 9, 1])).toBe(9);
  });

  it('normalizedPower needs a full 30 s window, else undefined', () => {
    expect(normalizedPower([200, 210, 205])).toBeUndefined();
    const steady = new Array(120).fill(200);
    expect(normalizedPower(steady)).toBeCloseTo(200, 6); // steady power → NP ≈ AP
  });

  it('normalizedPower exceeds average power for efforts that vary above the 30 s window', () => {
    // 60 s blocks of 100 W then 300 W — variability the 30 s rolling average does NOT smooth
    // away (unlike a sub-30 s oscillation, which it correctly does).
    const block = (w: number) => new Array(60).fill(w);
    const variable = [...block(100), ...block(300), ...block(100), ...block(300)];
    const ap = mean(variable)!; // 200
    expect(normalizedPower(variable)!).toBeGreaterThan(ap + 40);
  });

  it('elevationGain sums positive deltas only', () => {
    expect(elevationGain([100, 105, 103, 110])).toBe(12); // +5, +7
    expect(elevationGain([50])).toBeUndefined();
  });

  it('haversineDistance measures along a track', () => {
    const d = haversineDistance([
      [51.5, -0.1],
      [51.51, -0.1],
    ]);
    expect(d).toBeGreaterThan(1000); // ~1.11 km per 0.01° latitude
    expect(d).toBeLessThan(1200);
  });
});

describe('normalizeActivity', () => {
  it('derives summaries and flags from streams', () => {
    const a = normalizeActivity(
      base({ timeS: [0, 1, 2, 3], hr: [140, 150, 160, 150], powerW: [200, 220, 210, 205], sampleRateHz: 1 }),
    );
    expect(a.durationS).toBe(3);
    expect(a.avgHr).toBe(150);
    expect(a.maxHr).toBe(160);
    expect(a.avgPowerW).toBeCloseTo(208.75, 2);
    expect(a.hasStreams).toBe(true);
  });

  it('marks chest_strap when RR intervals are present', () => {
    const a = normalizeActivity(base({ hr: [140], rrIntervalsMs: [810, 800] }));
    expect(a.hasRrIntervals).toBe(true);
    expect(a.hrSource).toBe('chest_strap');
  });

  it('marks hrSource none when there is no HR at all', () => {
    const a = normalizeActivity(base({ powerW: [200, 210] }));
    expect(a.hrSource).toBe('none');
  });

  it('does not overwrite values a parser already set', () => {
    const withSummary = { ...base({ hr: [100, 100] }), avgHr: 175 };
    expect(normalizeActivity(withSummary).avgHr).toBe(175);
  });
});
