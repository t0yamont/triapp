import { describe, expect, it } from 'vitest';
import { deriveHrRest, median, percentile } from '../anchors/hrRest.js';

const NOW = '2026-07-22T00:00:00Z';

describe('Resting HR derivation (§2.3)', () => {
  it('uses the 5th percentile of nightly minima (0.85) when a wearable series exists', () => {
    // 20 nights; the 5th percentile rejects the single 38 bpm artefact.
    const nightlyMinima = [38, 44, 45, 45, 46, 46, 47, 47, 48, 48, 49, 49, 50, 50, 51, 51, 52, 52, 53, 54];
    const est = deriveHrRest({ nightlyMinima, now: NOW })!;
    expect(est.provenance).toBe('field_test');
    expect(est.confidence).toBe(0.85);
    expect(est.sampleSize).toBe(20);
    expect(est.value).toBeCloseTo(percentile(nightlyMinima, 5), 9);
    expect(est.value).toBeGreaterThan(38); // artefact rejected
  });

  it('falls back to the 5-day median of morning readings (0.60)', () => {
    const est = deriveHrRest({ morningReadings: [52, 50, 54, 51, 53], now: NOW })!;
    expect(est.provenance).toBe('athlete_reported');
    expect(est.confidence).toBe(0.6);
    expect(est.value).toBe(52);
  });

  it('uses a supplied population default (0.15) as last resort', () => {
    const est = deriveHrRest({ populationDefault: 60, now: NOW })!;
    expect(est.provenance).toBe('population_formula');
    expect(est.confidence).toBe(0.15);
    expect(est.value).toBe(60);
  });

  it('returns null when nothing is available (no invented population constant)', () => {
    expect(deriveHrRest({ now: NOW })).toBeNull();
  });
});

describe('percentile / median helpers', () => {
  it('percentile interpolates (numpy type 7)', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
    expect(percentile([42], 5)).toBe(42);
  });
  it('median handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('throws on empty input', () => {
    expect(() => percentile([], 5)).toThrow();
    expect(() => median([])).toThrow();
  });
});
