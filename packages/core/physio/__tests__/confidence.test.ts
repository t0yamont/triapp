import { describe, expect, it } from 'vitest';
import { combineConfidence, confidenceBehaviour } from '../confidence.js';

describe('Confidence → behaviour tiers (§2.4)', () => {
  it('≥0.75 permits full progression and S3', () => {
    const b = confidenceBehaviour(0.8);
    expect(b.tier).toBe('high');
    expect(b.rampCapMultiplier).toBe(1.0);
    expect(b.intensityShiftPct).toBe(0);
    expect(b.maxSZone).toBe('S3');
    expect(b.testCadenceWeeks).toBe(8);
    expect(b.blocking).toBe(false);
  });

  it('0.50–0.74 reduces ramp 25% and shifts intensity 3% conservative', () => {
    const b = confidenceBehaviour(0.6);
    expect(b.tier).toBe('moderate');
    expect(b.rampCapMultiplier).toBe(0.75);
    expect(b.intensityShiftPct).toBe(3);
    expect(b.testCadenceWeeks).toBe(6);
  });

  it('0.30–0.49 halves ramp and caps Z5 at 50%', () => {
    const b = confidenceBehaviour(0.4);
    expect(b.tier).toBe('low');
    expect(b.rampCapMultiplier).toBe(0.5);
    expect(b.z5VolumeFraction).toBe(0.5);
    expect(b.testWithinDays).toBe(14);
    expect(b.maxSZone).toBe('S3');
  });

  it('<0.30 forbids S3 entirely and blocks (ties I15)', () => {
    const b = confidenceBehaviour(0.2);
    expect(b.tier).toBe('critical');
    expect(b.maxSZone).toBe('S1');
    expect(b.z5VolumeFraction).toBe(0);
    expect(b.testWithinDays).toBe(7);
    expect(b.blocking).toBe(true);
  });

  it('tier boundaries are inclusive at the lower edge', () => {
    expect(confidenceBehaviour(0.75).tier).toBe('high');
    expect(confidenceBehaviour(0.5).tier).toBe('moderate');
    expect(confidenceBehaviour(0.3).tier).toBe('low');
    expect(confidenceBehaviour(0.2999).tier).toBe('critical');
  });

  it('combineConfidence takes the weakest link', () => {
    expect(combineConfidence([0.8, 0.5, 0.9])).toBe(0.5);
    expect(combineConfidence([])).toBe(0);
  });
});
