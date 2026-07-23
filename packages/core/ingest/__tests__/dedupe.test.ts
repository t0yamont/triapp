import { describe, expect, it } from 'vitest';
import { chooseRicher, idempotencyKey, isDuplicate, richnessScore } from '../dedupe.js';
import type { ParsedActivity } from '../types.js';

function activity(overrides: Partial<ParsedActivity> = {}): ParsedActivity {
  return {
    sport: 'bike',
    startTime: '2026-07-01T06:00:00.000Z',
    localTzOffsetMin: 0,
    durationS: 3600,
    provider: 'garmin',
    hasRrIntervals: false,
    hasStreams: true,
    laps: [],
    streams: {},
    ...overrides,
  };
}

describe('idempotency', () => {
  it('keys on provider + activity id', () => {
    expect(idempotencyKey('garmin', 'abc123')).toBe('garmin:abc123');
  });
  it('is undefined without an activity id', () => {
    expect(idempotencyKey('fit_upload', undefined)).toBeUndefined();
  });
});

describe('deduplication (§7)', () => {
  it('matches the same session within ±120 s and ±3% duration', () => {
    const a = activity();
    const b = activity({ provider: 'strava', startTime: '2026-07-01T06:01:30.000Z', durationS: 3700 });
    expect(isDuplicate(a, b)).toBe(true); // 90 s apart, ~2.7% longer
  });

  it('rejects a different sport', () => {
    expect(isDuplicate(activity(), activity({ sport: 'run' }))).toBe(false);
  });

  it('rejects starts more than 120 s apart', () => {
    expect(isDuplicate(activity(), activity({ startTime: '2026-07-01T06:02:01.000Z' }))).toBe(false);
  });

  it('rejects durations more than 3% apart', () => {
    expect(isDuplicate(activity(), activity({ durationS: 3600 * 1.05 }))).toBe(false);
  });

  it('richness: RR intervals win over more streams', () => {
    const rich = activity({ hasRrIntervals: true, streams: { hr: [1] } });
    const many = activity({ streams: { hr: [1], powerW: [1], speedMps: [1], altitudeM: [1], cadence: [1] } });
    expect(richnessScore(rich)).toBeGreaterThan(richnessScore(many));
    expect(chooseRicher(many, rich)).toBe(rich);
  });

  it('richness: more streams win when neither has RR; ties keep the first', () => {
    const few = activity({ streams: { hr: [1] } });
    const more = activity({ streams: { hr: [1], powerW: [1] } });
    expect(chooseRicher(few, more)).toBe(more);
    expect(chooseRicher(few, activity({ streams: { hr: [1] } }))).toBe(few);
  });
});
