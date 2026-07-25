import { describe, expect, it } from 'vitest';
import { fitCriticalSwimSpeed } from '../anchors/criticalSwimSpeed.js';

describe('fitCriticalSwimSpeed', () => {
  it('computes CSS = (400 − 200) / (t400 − t200) from a well-paced pair', () => {
    // 200 m in 3:20 (200 s), 400 m in 7:00 (420 s) → css = 200 / 220 ≈ 0.909 m/s
    const r = fitCriticalSwimSpeed([
      { distanceM: 200, timeS: 200 },
      { distanceM: 400, timeS: 420 },
    ]);
    expect(r.estimate).not.toBeNull();
    expect(r.estimate!.value).toBeCloseTo(200 / 220, 6);
    expect(r.estimate!.provenance).toBe('css_test');
    expect(r.estimate!.confidence).toBeGreaterThan(0);
  });

  it('accepts the trials in either order', () => {
    const forward = fitCriticalSwimSpeed([
      { distanceM: 200, timeS: 200 },
      { distanceM: 400, timeS: 420 },
    ]);
    const reversed = fitCriticalSwimSpeed([
      { distanceM: 400, timeS: 420 },
      { distanceM: 200, timeS: 200 },
    ]);
    expect(reversed.estimate!.value).toBeCloseTo(forward.estimate!.value, 9);
  });

  it('rejects distances other than 200/400', () => {
    const r = fitCriticalSwimSpeed([
      { distanceM: 100, timeS: 90 },
      { distanceM: 400, timeS: 420 },
    ]);
    expect(r.estimate).toBeNull();
    expect(r.rejection).toBe('wrong_distances');
  });

  it('rejects a 400 m that did not take longer than the 200 m', () => {
    const r = fitCriticalSwimSpeed([
      { distanceM: 200, timeS: 300 },
      { distanceM: 400, timeS: 300 },
    ]);
    expect(r.rejection).toBe('non_increasing');
  });

  it('rejects a 200 m sprinted far faster than CSS implies', () => {
    // 200 m all-out in 2:00 (120 s), 400 m in 7:00 (420 s) → css ≈ 200/300 ≈ 0.667 m/s,
    // but the 200 was swum at 200/120 ≈ 1.67 m/s — way more than 15% over CSS.
    const r = fitCriticalSwimSpeed([
      { distanceM: 200, timeS: 120 },
      { distanceM: 400, timeS: 420 },
    ]);
    expect(r.rejection).toBe('pacing_inconsistent');
  });

  it('accepts a 200 m within the pacing-consistency margin', () => {
    // css = 200/220 ≈ 0.909; 200 pace = 200/200 = 1.0 → 10% over css, under the 15% margin.
    const r = fitCriticalSwimSpeed([
      { distanceM: 200, timeS: 200 },
      { distanceM: 400, timeS: 420 },
    ]);
    expect(r.estimate).not.toBeNull();
  });

  it('stamps measuredAt from `now`, defaulting to epoch', () => {
    const withNow = fitCriticalSwimSpeed(
      [
        { distanceM: 200, timeS: 200 },
        { distanceM: 400, timeS: 420 },
      ],
      '2026-08-01T00:00:00.000Z',
    );
    expect(withNow.estimate!.measuredAt).toBe('2026-08-01T00:00:00.000Z');

    const withoutNow = fitCriticalSwimSpeed([
      { distanceM: 200, timeS: 200 },
      { distanceM: 400, timeS: 420 },
    ]);
    expect(withoutNow.estimate!.measuredAt).toBe(new Date(0).toISOString());
  });
});
