import { describe, expect, it } from 'vitest';
import { assessGoalFeasibility, predictRaceTime, riegelExponent } from '../plan/goalTime.js';

describe('riegelExponent', () => {
  it('tiers by weekly hours (Vickers & Vertosick)', () => {
    expect(riegelExponent(10)).toBe(1.06); // high volume
    expect(riegelExponent(8)).toBe(1.06); // boundary is high-volume
    expect(riegelExponent(6)).toBe(1.09); // moderate
    expect(riegelExponent(4)).toBe(1.09); // boundary is moderate
    expect(riegelExponent(2)).toBe(1.12); // low volume
    expect(riegelExponent(0)).toBe(1.12);
  });
});

describe('predictRaceTime', () => {
  it('predicts a near-distance race with the classic near-1.06 shape', () => {
    // 10k in 50:00 (3000 s) at high volume → half marathon (21097.5 m) prediction.
    const est = predictRaceTime(10000, 3000, 21097.5, 10);
    const expected = 3000 * (21097.5 / 10000) ** 1.06;
    expect(est.value).toBeCloseTo(expected, 3);
    expect(est.provenance).toBe('riegel_prediction');
  });

  it('uses a higher (more conservative) exponent for a low-volume athlete', () => {
    const high = predictRaceTime(10000, 3000, 42195, 10);
    const low = predictRaceTime(10000, 3000, 42195, 2);
    // A steeper exponent predicts more slowdown over the same distance ratio.
    expect(low.value).toBeGreaterThan(high.value);
  });

  it('confidence sits at the riegel_prediction ceiling for an identical-distance prediction', () => {
    const est = predictRaceTime(10000, 3000, 10000, 10); // ratio 1 — no extrapolation at all
    expect(est.confidence).toBeCloseTo(0.6, 6);
  });

  it('confidence stays close to the ceiling for a modest, near-distance extrapolation', () => {
    const est = predictRaceTime(10000, 3000, 12000, 10); // ratio 1.2, well inside the near range
    expect(est.confidence).toBeGreaterThan(0.55);
    expect(est.confidence).toBeLessThan(0.6);
  });

  it('confidence falls toward the population_formula floor for a wide extrapolation', () => {
    const near = predictRaceTime(5000, 1200, 10000, 6); // ratio 2
    const far = predictRaceTime(5000, 1200, 50000, 6); // ratio 10 — beyond the low-confidence ratio
    expect(far.confidence).toBeLessThan(near.confidence);
    expect(far.confidence).toBeCloseTo(0.2, 2); // floored at population_formula
  });

  it('is symmetric — predicting a shorter distance extrapolates the same as a longer one', () => {
    const long = predictRaceTime(5000, 1200, 25000, 6);
    const short = predictRaceTime(25000, 1200 * 5, 5000, 6);
    expect(long.confidence).toBeCloseTo(short.confidence, 6);
  });

  it('defaults measuredAt to epoch, accepts an explicit now', () => {
    expect(predictRaceTime(5000, 1200, 10000, 6).measuredAt).toBe(new Date(0).toISOString());
    expect(predictRaceTime(5000, 1200, 10000, 6, '2026-08-01T00:00:00.000Z').measuredAt).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });
});

describe('assessGoalFeasibility', () => {
  const predicted = (confidence: number) => ({
    value: 4 * 3600, // 4h predicted
    confidence,
    provenance: 'riegel_prediction' as const,
    measuredAt: new Date(0).toISOString(),
  });

  it('never flags a goal at or slower than the prediction', () => {
    const r = assessGoalFeasibility(predicted(0.6), 4 * 3600);
    expect(r.feasible).toBe(true);
    expect(r.conservative).toBe(true);

    const slower = assessGoalFeasibility(predicted(0.6), 4.5 * 3600);
    expect(slower.feasible).toBe(true);
    expect(slower.conservative).toBe(true);
  });

  it('accepts a modestly faster goal within the confidence-scaled margin', () => {
    // High confidence (0.6) → margin 2% + 0.4*8% = 5.2%. A 3% faster goal is inside it.
    const r = assessGoalFeasibility(predicted(0.6), 4 * 3600 * 0.97);
    expect(r.feasible).toBe(true);
    expect(r.conservative).toBe(false);
  });

  it('rejects a goal well outside the margin', () => {
    const r = assessGoalFeasibility(predicted(0.6), 4 * 3600 * 0.8); // 20% faster
    expect(r.feasible).toBe(false);
    expect(r.reasonText).toMatch(/stretch/);
  });

  it('gives a low-confidence prediction more benefit of the doubt', () => {
    const goal = 4 * 3600 * 0.92; // 8% faster than predicted
    const highConf = assessGoalFeasibility(predicted(0.6), goal);
    const lowConf = assessGoalFeasibility(predicted(0.2), goal);
    expect(highConf.feasible).toBe(false); // margin ≈ 5.2%, 8% is outside it
    expect(lowConf.feasible).toBe(true); // margin ≈ 9.2%, 8% is inside it
  });
});
