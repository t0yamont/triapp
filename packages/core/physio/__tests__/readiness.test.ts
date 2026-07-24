import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import f9 from '../../../../supabase/seed/fixtures/F9-readiness-downgrade.json' with { type: 'json' };
import { adaptToday, READINESS_REASON, type DailyReadiness } from '../readiness/response.js';
import { readinessScore, type ReadinessInputs } from '../readiness/score.js';
import type { SZone } from '../types.js';

describe('Readiness score (§10.1)', () => {
  const flat = { rolling: 100, baseline: 100, sd: 5 };

  it('returns a bare-score-free result with per-component provenance (P2)', () => {
    const r = readinessScore({
      hrv: flat,
      restingHr: { rolling: 50, baseline: 50, sd: 3 },
      sleep: { rolling: 7, baseline: 7, sd: 1 },
      wellness: { rolling: 4, baseline: 4, sd: 0.5 },
      completionRate: 0.85,
    });
    expect(r.score).toBe(50); // everything at baseline → neutral
    expect(r.band).toBe('within');
    expect(r.components.map((c) => c.key)).toEqual(['hrv', 'restingHr', 'sleep', 'wellness', 'completion']);
    // Weights reweight to sum to 1 across present inputs; each carries its own z + band.
    expect(r.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 6);
    for (const c of r.components) expect(c.band).toBe('within');
  });

  it('scores below when the weighted deviation drops past the SWC lower bound', () => {
    // HRV two SDs low, alone → z = −2 → below band; score clamps toward 0.
    const r = readinessScore({ hrv: { rolling: 90, baseline: 100, sd: 5 } });
    expect(r.band).toBe('below');
    expect(r.components[0]!.band).toBe('below');
    expect(r.score).toBe(0);
  });

  it('scores above when readiness is genuinely elevated (but drives no upgrade — I12)', () => {
    const r = readinessScore({ hrv: { rolling: 110, baseline: 100, sd: 5 } });
    expect(r.band).toBe('above');
    expect(r.components[0]!.band).toBe('above');
    expect(r.score).toBe(100);
  });

  it('reads resting HR inverted (lower is better) and ignores a zero-SD baseline', () => {
    // restingHr below baseline is *good*; hrv with sd=0 contributes a neutral z (no divide).
    const r = readinessScore({ hrv: { rolling: 100, baseline: 100, sd: 0 }, restingHr: { rolling: 45, baseline: 50, sd: 5 } });
    expect(r.components[0]!.z).toBe(0); // sd ≤ 0 → 0, never NaN/Infinity
    expect(r.components[1]!.z).toBeGreaterThan(0); // 50 − 45 = +5 → +1 SD, better
    expect(r.components[1]!.band).toBe('above'); // the RHR component alone reads elevated readiness
    expect(r.band).toBe('within'); // but the zero-weighted-z HRV dilutes the blend to +0.33 SD
  });

  it('falls back to wellness-only weighting when it is the only signal (§10.1)', () => {
    const r = readinessScore({ wellness: { rolling: 3, baseline: 4, sd: 1 } });
    expect(r.components).toHaveLength(1);
    expect(r.components[0]!.weight).toBe(0.2);
    expect(r.band).toBe('below'); // −1 SD
  });

  it('maps completion rate so 70%/95% land in the low/high bands (§10.3)', () => {
    expect(readinessScore({ completionRate: 0.7 }).components[0]!.band).toBe('below');
    expect(readinessScore({ completionRate: 0.95 }).components[0]!.band).toBe('above');
    expect(readinessScore({ completionRate: 0.85 }).components[0]!.band).toBe('within');
  });

  it('returns unknown, not a fabricated number, when there is no input at all', () => {
    const r = readinessScore({});
    expect(r).toEqual({ score: 50, band: 'unknown', components: [] });
  });
});

describe('Readiness response rules (§10.2, F9)', () => {
  it('F9 — two below-band days + an S3 session → easy day, week trimmed 10%, one audited mutation', () => {
    const r = adaptToday(f9.input.history as DailyReadiness[], f9.input.todaySZone as SZone);
    expect(r.action).toBe(f9.expected.action); // reduce_to_s1_or_rest
    expect(r.weekLoadDeltaPct).toBe(f9.expected.weekLoadDeltaPct); // −10
    expect(r.mutation).toBeDefined();
    expect(r.mutation!.reasonCode).toBe(f9.expected.reasonCode); // READINESS_2DAY_LOW
    expect(r.mutation!.reasonCode).toBe(READINESS_REASON.TWO_DAY_LOW);
    expect(r.mutation!.actor).toBe('engine');
    expect(r.mutation!.reasonText.trim().length).toBeGreaterThan(0); // athlete-readable (P1)
    expect(r.illnessPrompt).toBe(false);
  });

  it('F9 paired negative — three above-band days → no plan change, no mutation', () => {
    const r = adaptToday(f9.pairedNegative.history as DailyReadiness[], f9.pairedNegative.todaySZone as SZone);
    expect(r.action).toBe(f9.pairedNegative.expected.action); // none
    expect(r.weekLoadDeltaPct).toBe(0);
    expect(r.mutation).toBeUndefined();
  });

  it('one below day with an S3 session downgrades S3→S2 without touching the week', () => {
    const r = adaptToday([{ band: 'within' }, { band: 'below' }], 'S3');
    expect(r.action).toBe('downgrade_s3_to_s2');
    expect(r.weekLoadDeltaPct).toBe(0);
    expect(r.mutation!.reasonCode).toBe(READINESS_REASON.ONE_DAY_S3_DOWNGRADE);
  });

  it('one below day with a non-S3 session does nothing (asymmetry only cuts hard work)', () => {
    const r = adaptToday([{ band: 'within' }, { band: 'below' }], 'S1');
    expect(r.action).toBe('none');
    expect(r.mutation).toBeUndefined();
  });

  it('four below-band days convert the rest of the week to recovery and suppress S3 for 5 days', () => {
    const r = adaptToday([{ band: 'below' }, { band: 'below' }, { band: 'below' }, { band: 'below' }], 'S1');
    expect(r.action).toBe('convert_week_to_recovery');
    expect(r.weekLoadDeltaPct).toBe(-38); // to ~62% of planned load
    expect(r.suppressS3Days).toBe(5);
    expect(r.illnessPrompt).toBe(true);
    expect(r.mutation!.reasonCode).toBe(READINESS_REASON.MULTIDAY_LOW);
  });

  it('an HRV crash (>2 SD below) converts to recovery even without four below days', () => {
    const r = adaptToday([{ band: 'within' }, { band: 'within', hrvZ: -2.5 }], 'S1');
    expect(r.action).toBe('convert_week_to_recovery');
    expect(r.suppressS3Days).toBe(5);
  });

  it('a defined-but-shallow HRV dip (−1 SD) is not a crash', () => {
    const r = adaptToday([{ band: 'within', hrvZ: -1 }], 'S1');
    expect(r.action).toBe('none'); // exercises hrvZ defined ∧ ≥ −2
  });

  it('resting HR elevated >7 bpm for two days → easy day + illness prompt (§10.2)', () => {
    const r = adaptToday(
      [{ band: 'within', restingHrDeltaBpm: 8 }, { band: 'within', restingHrDeltaBpm: 9 }],
      'S1',
    );
    expect(r.action).toBe('reduce_to_s1_or_rest');
    expect(r.weekLoadDeltaPct).toBe(-10);
    expect(r.illnessPrompt).toBe(true);
    expect(r.mutation!.reasonCode).toBe(READINESS_REASON.RHR_ELEVATED_2DAY);
  });

  it('an elevated RHR for a single day is not yet actionable', () => {
    const r = adaptToday([{ band: 'within' }, { band: 'within', restingHrDeltaBpm: 12 }], 'S1');
    expect(r.action).toBe('none'); // one day > 7 bpm; the ?? 0 default covers the missing prior day
  });

  it('an empty history is inert (defensive — no today, no signal)', () => {
    const r = adaptToday([], 'S3');
    expect(r.action).toBe('none');
    expect(r.mutation).toBeUndefined();
  });
});

describe('Readiness invariants (I12, I13)', () => {
  const bandArb = fc.constantFrom<DailyReadiness['band']>('below', 'within', 'above', 'unknown');
  const dayArb: fc.Arbitrary<DailyReadiness> = fc.record({
    band: bandArb,
    hrvZ: fc.option(fc.double({ min: -5, max: 5, noNaN: true }), { nil: undefined }),
    restingHrDeltaBpm: fc.option(fc.double({ min: -20, max: 30, noNaN: true }), { nil: undefined }),
  });
  const szoneArb = fc.constantFrom<SZone>('S1', 'S2', 'S3');

  it('I12 — no readiness signal ever increases the week load target', () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 12 }), szoneArb, (history, sz) => {
        expect(adaptToday(history, sz).weekLoadDeltaPct).toBeLessThanOrEqual(0);
      }),
    );
  });

  it('I13 — every change carries exactly one non-empty, athlete-readable mutation; no-change carries none', () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 12 }), szoneArb, (history, sz) => {
        const r = adaptToday(history, sz);
        if (r.action === 'none') {
          expect(r.mutation).toBeUndefined();
        } else {
          expect(r.mutation).toBeDefined();
          expect(r.mutation!.actor).toBe('engine');
          expect(r.mutation!.reasonCode.length).toBeGreaterThan(0); // machine-readable (rule #10)
          expect(r.mutation!.reasonText.trim().length).toBeGreaterThan(0); // human-readable (P1)
        }
      }),
    );
  });
});
