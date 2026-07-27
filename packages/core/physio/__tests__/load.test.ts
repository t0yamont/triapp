import { describe, expect, it } from 'vitest';
import f6 from '../../../../supabase/seed/fixtures/F6-load-metrics.json' with { type: 'json' };
import { fitnessSeries } from '../load/fitness.js';
import { srpe } from '../load/srpe.js';
import { bikeTss, runTss, swimTss } from '../load/tss.js';
import { trimp } from '../load/trimp.js';

describe('External load — TSS (§5.1, F6)', () => {
  it('bike TSS = 70.6 for NP 210, CP 250, 3600 s', () => {
    const { tss, intensityFactor } = bikeTss(f6.bike);
    expect(intensityFactor).toBeCloseTo(0.84, 5);
    expect(tss).toBeCloseTo(f6.bike.expectedTss, 1); // 70.6 ± 0.1
  });

  it('run rTSS = 81.0 for GAP 3.60, LT2 4.00, 3600 s', () => {
    const { tss, intensityFactor } = runTss(f6.run);
    expect(intensityFactor).toBeCloseTo(0.9, 5);
    expect(tss).toBeCloseTo(f6.run.expectedRTss, 1); // 81.0 ± 0.1
  });

  it('swim sTSS applies the cubic exponent (value not pinned by the fixture)', () => {
    const { tss, intensityFactor } = swimTss(f6.swim);
    // IF = actual / CSS, like every other sport (D-SWIM-IF resolves the inverted §5.1 formula).
    expect(intensityFactor).toBeCloseTo(1.05 / 1.2, 6);
    // cubic: (2400 × IF³) / 3600 × 100
    const expected = (f6.swim.durationS * intensityFactor ** 3) / 3600 * 100;
    expect(tss).toBeCloseTo(expected, 6);
  });

  it('swim IF reads below 1 when easier than CSS and above it when harder', () => {
    const easy = swimTss({ durationS: 1800, cssSpeed: 1.2, actualSpeed: 1.0 });
    const hard = swimTss({ durationS: 1800, cssSpeed: 1.2, actualSpeed: 1.35 });
    expect(easy.intensityFactor).toBeLessThan(1);
    expect(hard.intensityFactor).toBeGreaterThan(1);
    // The whole point of the correction: an easy swim must not out-score a hard one.
    expect(easy.tss).toBeLessThan(hard.tss);
  });
});

describe('Internal load — TRIMP (§5.1)', () => {
  it('weights S1:1, S2:2, S3:3', () => {
    expect(trimp({ S1: 60, S2: 20, S3: 10 })).toBe(60 * 1 + 20 * 2 + 10 * 3);
  });
});

describe('Perceived load — sRPE (§5.1)', () => {
  it('is RPE × duration', () => {
    expect(srpe({ rpe: 7, durationMin: 60 })).toBe(420);
  });
  it('rejects an out-of-range RPE', () => {
    expect(() => srpe({ rpe: 11, durationMin: 60 })).toThrow();
  });
});

describe('Fitness / fatigue — CTL/ATL/TSB (§5.2)', () => {
  it('matches a hand-computed reference series to 0.1', () => {
    const series = fitnessSeries([100, 100, 100]);
    // Reference values computed from the §5.2 recursion (kCTL=0.023536, kATL=0.133122):
    expect(series[0]!.tsb).toBeCloseTo(0, 6); // day 1 uses yesterday's (zero) balance
    expect(series[0]!.ctl).toBeCloseTo(2.354, 2);
    expect(series[0]!.atl).toBeCloseTo(13.312, 2);
    expect(series[2]!.ctl).toBeCloseTo(6.896, 2);
    expect(series[2]!.atl).toBeCloseTo(34.857, 2);
    expect(series[2]!.tsb).toBeCloseTo(-20.201, 2);
  });

  it('TSB is a lagged signal: TSB_t = CTL_{t−1} − ATL_{t−1}', () => {
    const series = fitnessSeries([50, 80, 30, 90]);
    for (let t = 1; t < series.length; t++) {
      expect(series[t]!.tsb).toBeCloseTo(series[t - 1]!.ctl - series[t - 1]!.atl, 9);
    }
  });

  it('CTL and ATL both converge to a constant load', () => {
    const series = fitnessSeries(new Array(600).fill(100));
    const last = series.at(-1)!;
    expect(last.ctl).toBeCloseTo(100, 1);
    expect(last.atl).toBeCloseTo(100, 1);
    expect(last.tsb).toBeCloseTo(0, 1);
  });

  it('is exact under incremental seeding (§Performance: incremental recompute)', () => {
    const full = fitnessSeries([40, 55, 70, 65, 80]);
    const firstTwo = fitnessSeries([40, 55]);
    const rest = fitnessSeries([70, 65, 80], { ctl: firstTwo[1]!.ctl, atl: firstTwo[1]!.atl });
    expect(rest[0]!.ctl).toBeCloseTo(full[2]!.ctl, 9);
    expect(rest.at(-1)!.ctl).toBeCloseTo(full.at(-1)!.ctl, 9);
    expect(rest.at(-1)!.atl).toBeCloseTo(full.at(-1)!.atl, 9);
  });
});
