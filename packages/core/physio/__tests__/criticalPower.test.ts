import { describe, expect, it } from 'vitest';
import f5 from '../../../../supabase/seed/fixtures/F5-critical-power.json' with { type: 'json' };
import { fitCriticalPower, type CpFitPoint } from '../anchors/criticalPower.js';

const points = f5.input.points as CpFitPoint[];
const NOW = '2026-06-20T00:00:00Z';

describe('Critical power fit (§6.3)', () => {
  it('F5 — fits CP/W′ from mean-max points with R² ≥ 0.95', () => {
    const { estimate, rejection } = fitCriticalPower(points, 'bike', NOW);
    expect(rejection).toBeUndefined();
    expect(estimate).not.toBeNull();
    const e = estimate!;
    expect(e.provenance).toBe(f5.expected.provenance);
    expect(e.value.r2).toBeGreaterThanOrEqual(f5.expected.r2Min);
    expect(e.value.criticalIntensity).toBeCloseTo(f5.expected.cpApprox, 0); // ≈236.4 W
    expect(Math.abs(e.value.wPrime - f5.expected.wPrimeApprox)).toBeLessThan(60); // ≈15282 J
    const [wLo, wHi] = f5.expected.wPrimeRange as [number, number];
    expect(e.value.wPrime).toBeGreaterThanOrEqual(wLo);
    expect(e.value.wPrime).toBeLessThanOrEqual(wHi);
    // Confidence: nominal cp_model_fit is 0.70, scaled toward 0.5 near the R² floor (§6.3).
    // This near-perfect fit (R²≈0.996) yields ≈0.684. See DECISIONS.md D-CP-CONF.
    expect(e.confidence).toBeCloseTo(f5.expected.confidenceApprox, 1);
    expect(e.confidence).toBeGreaterThan(0.68);
    expect(e.confidence).toBeLessThanOrEqual(0.7);
  });

  it('F5 negative — a 45 s effort is excluded by the duration filter, not fitted', () => {
    const withShort = [f5.negative.extraPoint as CpFitPoint, ...points];
    const { estimate } = fitCriticalPower(withShort, 'bike', NOW);
    // Result must equal the clean fit — the short point must not perturb CP.
    const clean = fitCriticalPower(points, 'bike', NOW).estimate!;
    expect(estimate!.value.criticalIntensity).toBeCloseTo(clean.value.criticalIntensity, 6);
    expect(estimate!.sampleSize).toBe(4);
  });

  it('rejects fewer than 3 in-range points', () => {
    const { estimate, rejection } = fitCriticalPower(points.slice(0, 2), 'bike', NOW);
    expect(estimate).toBeNull();
    expect(rejection).toBe('too_few_points');
  });

  it('rejects a single-session set', () => {
    const oneSession = points.map((p) => ({ ...p, sessionId: 's1' }));
    const { rejection } = fitCriticalPower(oneSession, 'bike', NOW);
    expect(rejection).toBe('too_few_sessions');
  });

  it('rejects a degenerate fit (flat power → non-positive W′)', () => {
    const flat: CpFitPoint[] = [
      { durationS: 180, power: 250, sessionId: 'a', date: '2026-06-01T00:00:00Z' },
      { durationS: 600, power: 250, sessionId: 'b', date: '2026-06-02T00:00:00Z' },
      { durationS: 900, power: 250, sessionId: 'b', date: '2026-06-02T00:00:00Z' },
    ];
    const { estimate, rejection } = fitCriticalPower(flat, 'bike', NOW);
    expect(estimate).toBeNull();
    expect(rejection).toBe('degenerate');
  });

  it('rejects a poor fit (R² below 0.95)', () => {
    // Non-physiological: power rises from 180 s to 300 s → hyperbola fits badly.
    const noisy: CpFitPoint[] = [
      { durationS: 180, power: 300, sessionId: 's1', date: '2026-06-01T00:00:00Z' },
      { durationS: 300, power: 305, sessionId: 's1', date: '2026-06-01T00:00:00Z' },
      { durationS: 600, power: 262, sessionId: 's2', date: '2026-06-02T00:00:00Z' },
      { durationS: 900, power: 252, sessionId: 's2', date: '2026-06-02T00:00:00Z' },
    ];
    expect(fitCriticalPower(noisy, 'bike', NOW).rejection).toBe('r2_below_threshold');
  });

  it('rejects a fit whose W′ exceeds the physiological ceiling', () => {
    const steep: CpFitPoint[] = [
      { durationS: 120, power: 520, sessionId: 's1', date: '2026-06-01T00:00:00Z' },
      { durationS: 180, power: 420, sessionId: 's1', date: '2026-06-01T00:00:00Z' },
      { durationS: 900, power: 250, sessionId: 's2', date: '2026-06-02T00:00:00Z' },
    ];
    expect(fitCriticalPower(steep, 'bike', NOW).rejection).toBe('w_prime_out_of_bounds');
  });

  it('rejects a fit whose W′ is below the physiological floor', () => {
    const shallow: CpFitPoint[] = [
      { durationS: 180, power: 262, sessionId: 's1', date: '2026-06-01T00:00:00Z' },
      { durationS: 600, power: 258, sessionId: 's2', date: '2026-06-02T00:00:00Z' },
      { durationS: 900, power: 256, sessionId: 's2', date: '2026-06-02T00:00:00Z' },
    ];
    expect(fitCriticalPower(shallow, 'bike', NOW).rejection).toBe('w_prime_out_of_bounds');
  });

  it('does not gate run fits on the bike-specific W′ bounds', () => {
    // Same shallow shape as above (tiny W′/D′) is accepted for run — no J bounds apply.
    const run: CpFitPoint[] = [
      { durationS: 300, power: 4.2, sessionId: 's1', date: '2026-06-01T00:00:00Z' },
      { durationS: 600, power: 4.05, sessionId: 's2', date: '2026-06-02T00:00:00Z' },
      { durationS: 1000, power: 3.95, sessionId: 's2', date: '2026-06-02T00:00:00Z' },
    ];
    const { estimate } = fitCriticalPower(run, 'run', NOW);
    expect(estimate).not.toBeNull();
    expect(estimate!.value.criticalIntensity).toBeGreaterThan(0);
  });

  it('derives measuredAt from the latest effort date when now is omitted', () => {
    const { estimate } = fitCriticalPower(points, 'bike');
    expect(new Date(estimate!.measuredAt).getTime()).toBe(new Date('2026-06-10T09:00:00Z').getTime());
  });

  it('keeps in-range points that lack a date when other points are dated', () => {
    const mixed: CpFitPoint[] = [
      { durationS: 180, power: 320, sessionId: 's1', date: '2026-06-01T09:00:00Z' },
      { durationS: 300, power: 290, sessionId: 's1' }, // no date → not window-filtered out
      { durationS: 600, power: 262, sessionId: 's2', date: '2026-06-10T09:00:00Z' },
      { durationS: 900, power: 252, sessionId: 's2', date: '2026-06-10T09:00:00Z' },
    ];
    const { estimate } = fitCriticalPower(mixed, 'bike', NOW);
    expect(estimate).not.toBeNull();
    expect(estimate!.sampleSize).toBe(4);
  });

  it('falls back to the epoch when neither now nor dates are supplied', () => {
    const undated: CpFitPoint[] = [
      { durationS: 180, power: 320 },
      { durationS: 600, power: 262 },
      { durationS: 900, power: 252 },
    ];
    const { estimate } = fitCriticalPower(undated, 'bike');
    expect(estimate!.measuredAt).toBe(new Date(0).toISOString());
  });
});
