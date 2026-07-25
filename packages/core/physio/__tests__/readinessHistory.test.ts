import { describe, expect, it } from 'vitest';
import { READINESS_MIN_BASELINE_SAMPLES, SWC_MULTIPLIER } from '../constants.js';
import { addDaysISO } from '../plan/generate.js';
import { buildReadinessInputs, readinessCoverage, wellnessMean, type DailyWellness } from '../readiness/history.js';
import { readinessScore } from '../readiness/score.js';

const TODAY = '2026-07-25';

/** `days` rows ending today, newest last. `value(i)` is i days before today. */
const series = (days: number, value: (daysAgo: number) => Partial<DailyWellness>): DailyWellness[] =>
  Array.from({ length: days }, (_, i) => ({ date: addDaysISO(TODAY, -i), ...value(i) }));

describe('wellnessMean', () => {
  it('averages only the sub-scores that were answered', () => {
    expect(wellnessMean({ date: TODAY, wellnessFatigue: 4, wellnessMood: 2 })).toBe(3);
  });

  it('is undefined when none were answered', () => {
    expect(wellnessMean({ date: TODAY, hrvRmssd: 60 })).toBeUndefined();
  });
});

describe('buildReadinessInputs', () => {
  it('is empty for an athlete with no history', () => {
    expect(buildReadinessInputs([], TODAY)).toEqual({});
  });

  it('withholds a metric until the baseline window has enough days', () => {
    const thin = series(READINESS_MIN_BASELINE_SAMPLES - 1, (i) => ({ hrvRmssd: 60 + i }));
    expect(buildReadinessInputs(thin, TODAY).hrv).toBeUndefined();
  });

  it('produces a metric once there is enough history', () => {
    const history = series(30, (i) => ({ hrvRmssd: 60 + (i % 5) }));
    const hrv = buildReadinessInputs(history, TODAY).hrv;
    expect(hrv).toBeDefined();
    expect(hrv!.sd).toBeGreaterThan(0);
  });

  it('withholds a metric whose baseline is perfectly flat — no spread, no signal', () => {
    const flat = series(30, () => ({ hrvRmssd: 60 }));
    expect(buildReadinessInputs(flat, TODAY).hrv).toBeUndefined();
  });

  it('uses the short window for `rolling` and the long one for `baseline`', () => {
    // Last 7 days at 40, the 60-day history otherwise at 60 ⇒ rolling well below baseline.
    const history = series(60, (i) => ({ hrvRmssd: i < 7 ? 40 : 60 + (i % 3) }));
    const hrv = buildReadinessInputs(history, TODAY).hrv!;
    expect(hrv.rolling).toBeCloseTo(40, 5);
    expect(hrv.baseline).toBeGreaterThan(hrv.rolling);
  });

  it('ignores rows dated after today', () => {
    const history: DailyWellness[] = [
      ...series(30, () => ({ hrvRmssd: 50 })),
      { date: addDaysISO(TODAY, 3), hrvRmssd: 9999 },
    ];
    const hrv = buildReadinessInputs(history, TODAY).hrv;
    // The future outlier would blow up both mean and SD if counted.
    expect(hrv?.rolling ?? 50).toBeLessThan(100);
  });

  it('is order-independent', () => {
    const history = series(30, (i) => ({ hrvRmssd: 60 + (i % 4) }));
    const shuffled = [...history].reverse();
    expect(buildReadinessInputs(shuffled, TODAY)).toEqual(buildReadinessInputs(history, TODAY));
  });

  it('tolerates gaps, counting only the days actually logged', () => {
    const everyOtherDay = series(60, (i) => (i % 2 === 0 ? { restingHr: 48 + (i % 5) } : {}));
    expect(buildReadinessInputs(everyOtherDay, TODAY).restingHr).toBeDefined();
  });

  it('builds each metric independently — a wearable HRV feed with no subjective log', () => {
    const history = series(30, (i) => ({ hrvRmssd: 60 + (i % 5) }));
    const inputs = buildReadinessInputs(history, TODAY);
    expect(inputs.hrv).toBeDefined();
    expect(inputs.wellness).toBeUndefined();
    expect(inputs.sleep).toBeUndefined();
    expect(inputs.restingHr).toBeUndefined();
  });

  it('passes completionRate straight through, and omits it when absent', () => {
    expect(buildReadinessInputs([], TODAY, 0.9).completionRate).toBe(0.9);
    expect(buildReadinessInputs([], TODAY)).not.toHaveProperty('completionRate');
  });

  it('averages the four wellness sub-scores into one metric', () => {
    const history = series(30, (i) => ({
      wellnessFatigue: 3 + (i % 3),
      wellnessSoreness: 3,
      wellnessStress: 3,
      wellnessMood: 3,
    }));
    expect(buildReadinessInputs(history, TODAY).wellness).toBeDefined();
  });
});

describe('feeding readinessScore — the contract that matters', () => {
  it('scores below band when the recent week is genuinely worse than baseline', () => {
    // 60 days at ~60, last 7 crashed to 40.
    const history = series(60, (i) => ({ hrvRmssd: i < 7 ? 40 : 60 + (i % 3) }));
    const readiness = readinessScore(buildReadinessInputs(history, TODAY));
    expect(readiness.band).toBe('below');
    expect(readiness.score).toBeLessThan(50);
  });

  it('scores within band when nothing has changed', () => {
    const history = series(60, (i) => ({ hrvRmssd: 60 + (i % 3) }));
    const readiness = readinessScore(buildReadinessInputs(history, TODAY));
    expect(readiness.band).toBe('within');
  });

  it('returns an unknown band — not a fabricated 50 with components — on no data', () => {
    const readiness = readinessScore(buildReadinessInputs([], TODAY));
    expect(readiness.band).toBe('unknown');
    expect(readiness.components).toEqual([]);
  });

  it('treats resting HR as lower-is-better, the inverse of HRV', () => {
    // RHR risen over the last week ⇒ worse readiness.
    const history = series(60, (i) => ({ restingHr: i < 7 ? 60 : 48 + (i % 3) }));
    const readiness = readinessScore(buildReadinessInputs(history, TODAY));
    expect(readiness.band).toBe('below');
  });

  it('puts the SWC band exactly where the constant says', () => {
    const inputs = { hrv: { rolling: 50 + SWC_MULTIPLIER * 2, baseline: 50, sd: 2 } };
    expect(readinessScore(inputs).band).toBe('within'); // z === SWC_MULTIPLIER is not yet "above"
  });
});

describe('readinessCoverage', () => {
  it('reports nothing logged for an empty history', () => {
    expect(readinessCoverage([], TODAY)).toEqual({
      available: [],
      daysLogged: 0,
      daysUntilFirstScore: READINESS_MIN_BASELINE_SAMPLES,
    });
  });

  it('counts down the days remaining before a first score', () => {
    const history = series(3, () => ({ hrvRmssd: 60 }));
    expect(readinessCoverage(history, TODAY).daysUntilFirstScore).toBe(READINESS_MIN_BASELINE_SAMPLES - 3);
  });

  it('lists which metrics cleared, and stops counting down once they have', () => {
    const history = series(30, (i) => ({ hrvRmssd: 60 + (i % 5), restingHr: 48 + (i % 4) }));
    const coverage = readinessCoverage(history, TODAY);
    expect(coverage.available).toEqual(['hrv', 'restingHr']);
    expect(coverage.daysUntilFirstScore).toBe(0);
    expect(coverage.daysLogged).toBe(30);
  });

  it('counts distinct days, not rows', () => {
    const history: DailyWellness[] = [
      { date: TODAY, hrvRmssd: 60 },
      { date: TODAY, restingHr: 50 },
    ];
    expect(readinessCoverage(history, TODAY).daysLogged).toBe(1);
  });
});
