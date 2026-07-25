import { describe, expect, it } from 'vitest';
import {
  bestMeanEffort,
  durabilityIndex,
  isCpFittableDuration,
  isGenuinelyMaximal,
  meanMaxCurve,
  mergeMeanMax,
} from '../load/meanMax.js';

describe('bestMeanEffort', () => {
  it('finds the best sustained average, not just the peak sample', () => {
    // A single 500 W spike must not beat a sustained 300 W block over a 3 s window.
    const samples = [500, 100, 100, 300, 300, 300, 100];
    expect(bestMeanEffort(samples, 3)).toBe(300);
  });

  it('equals the mean when the window is the whole series', () => {
    expect(bestMeanEffort([100, 200, 300], 3)).toBe(200);
  });

  it('returns null when the series is shorter than the window, or the window is empty', () => {
    expect(bestMeanEffort([100, 200], 10)).toBeNull();
    expect(bestMeanEffort([100, 200], 0)).toBeNull();
  });

  it('honours a non-1 Hz sample rate', () => {
    // 0.5 Hz → a 4 s window is 2 samples.
    expect(bestMeanEffort([100, 100, 300, 300], 4, 0.5)).toBe(300);
  });
});

describe('meanMaxCurve', () => {
  const ride = [...Array<number>(60).fill(200), ...Array<number>(60).fill(320)];

  it('reports the best average at each requested duration', () => {
    const curve = meanMaxCurve(ride, [60, 120]);
    expect(curve).toEqual([
      { durationS: 60, value: 320 }, // the hard block
      { durationS: 120, value: 260 }, // the whole ride
    ]);
  });

  it('omits durations longer than the session', () => {
    expect(meanMaxCurve(ride, [60, 600]).map((p) => p.durationS)).toEqual([60]);
  });

  it('merges curves across sessions, keeping the best at each duration', () => {
    expect(
      mergeMeanMax([
        [
          { durationS: 300, value: 280 },
          { durationS: 600, value: 260 },
        ],
        [
          { durationS: 300, value: 295 },
          { durationS: 1200, value: 240 },
        ],
      ]),
    ).toEqual([
      { durationS: 300, value: 295 },
      { durationS: 600, value: 260 },
      { durationS: 1200, value: 240 },
    ]);
  });

  it('merges to an empty curve when there is nothing to merge', () => {
    expect(mergeMeanMax([])).toEqual([]);
  });
});

describe('CP-fitting eligibility (§6.3)', () => {
  it('accepts 2–15 min on the bike and 3–20 min on the run, and rejects outside', () => {
    expect(isCpFittableDuration(120, 'bike')).toBe(true);
    expect(isCpFittableDuration(900, 'bike')).toBe(true);
    expect(isCpFittableDuration(119, 'bike')).toBe(false); // under 2 min inflates CP
    expect(isCpFittableDuration(901, 'bike')).toBe(false);
    expect(isCpFittableDuration(180, 'run')).toBe(true);
    expect(isCpFittableDuration(1200, 'run')).toBe(true);
    expect(isCpFittableDuration(179, 'run')).toBe(false);
  });

  it('counts an effort as genuinely maximal within 95% of the all-time best', () => {
    expect(isGenuinelyMaximal(285, 300)).toBe(true); // 95%
    expect(isGenuinelyMaximal(284, 300)).toBe(false);
    expect(isGenuinelyMaximal(285, 0)).toBe(false); // no history to compare against
  });
});

describe('durabilityIndex (§11.1)', () => {
  const fresh = [{ durationS: 300, value: 300 }];

  it('reports the % decline in the late-session curve', () => {
    expect(durabilityIndex(fresh, [{ durationS: 300, value: 276 }], 300)).toBe(8); // 8% down
    expect(durabilityIndex(fresh, [{ durationS: 300, value: 300 }], 300)).toBe(0); // held
  });

  it('reports a negative index when the athlete was stronger late', () => {
    expect(durabilityIndex(fresh, [{ durationS: 300, value: 315 }], 300)).toBe(-5);
  });

  it('returns null when either curve lacks the duration, or the fresh value is unusable', () => {
    expect(durabilityIndex(fresh, [], 300)).toBeNull();
    expect(durabilityIndex([], [{ durationS: 300, value: 276 }], 300)).toBeNull();
    expect(durabilityIndex([{ durationS: 300, value: 0 }], [{ durationS: 300, value: 0 }], 300)).toBeNull();
  });
});
