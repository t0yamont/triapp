import { describe, expect, it } from 'vitest';
import { distributionTarget, isModerateDrift, isWithinTolerance } from '../distribution/policy.js';

describe('Distribution targets (§4.2)', () => {
  it('is pyramidal in Base', () => {
    expect(distributionTarget('base', 'short')).toEqual({ S1: 80, S2: 15, S3: 5 });
  });

  it('differs by course in Build and Peak — long course peaking is NOT polarised', () => {
    expect(distributionTarget('build', 'short')).toEqual({ S1: 78, S2: 12, S3: 10 });
    expect(distributionTarget('build', 'long')).toEqual({ S1: 78, S2: 17, S3: 5 });
    expect(distributionTarget('peak', 'short')).toEqual({ S1: 78, S2: 6, S3: 16 }); // polarised
    expect(distributionTarget('peak', 'long')).toEqual({ S1: 75, S2: 20, S3: 5 }); // race-specific pyramidal
  });

  it('maps taper/race_week to the taper shape and recovery/transition to recovery', () => {
    expect(distributionTarget('taper', 'long')).toEqual({ S1: 82, S2: 10, S3: 8 });
    expect(distributionTarget('race_week', 'short')).toEqual({ S1: 82, S2: 10, S3: 8 });
    expect(distributionTarget('recovery', 'long')).toEqual({ S1: 92, S2: 8, S3: 0 });
    expect(distributionTarget('transition', 'short')).toEqual({ S1: 92, S2: 8, S3: 0 });
  });

  it('returns a copy, not the shared constant', () => {
    const a = distributionTarget('base', 'short');
    a.S1 = 0;
    expect(distributionTarget('base', 'short').S1).toBe(80);
  });
});

describe('Tolerance (§4.2) — ±7 S1, ±5 S2/S3', () => {
  const target = { S1: 80, S2: 15, S3: 5 };
  it('accepts within tolerance', () => {
    expect(isWithinTolerance({ S1: 73, S2: 20, S3: 7 }, target)).toBe(true);
  });
  it('rejects S1 drift beyond 7 points', () => {
    expect(isWithinTolerance({ S1: 72, S2: 15, S3: 5 }, target)).toBe(false);
  });
  it('rejects S3 drift beyond 5 points', () => {
    expect(isWithinTolerance({ S1: 80, S2: 15, S3: 11 }, target)).toBe(false);
  });
});

describe('Moderate-drift check (§3.4)', () => {
  it('warns only above 25% S2 time-in-zone', () => {
    expect(isModerateDrift(0.24)).toBe(false);
    expect(isModerateDrift(0.25)).toBe(false);
    expect(isModerateDrift(0.26)).toBe(true);
  });
});
