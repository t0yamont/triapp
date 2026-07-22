import { describe, expect, it } from 'vitest';
import { assertNoSilentUpgrade, reconcileAnchor, sportAnchorConfidence } from '../anchors/reconcile.js';
import type { AthleteModel, Estimate, ThresholdPoint } from '../types.js';

const NOW = '2026-07-22T00:00:00Z';

function est(value: number, confidence: number, provenance: Estimate<number>['provenance'], measuredAt = NOW): Estimate<number> {
  return { value, confidence, provenance, measuredAt };
}

describe('Anchor reconciliation (§2, §6)', () => {
  it('picks the highest-confidence estimate', () => {
    const winner = reconcileAnchor([
      est(160, 0.5, 'dfa_a1_single'),
      est(165, 0.85, 'field_test'),
      est(158, 0.7, 'cp_model_fit'),
    ]);
    expect(winner!.value).toBe(165);
    expect(winner!.provenance).toBe('field_test');
  });

  it('breaks ties by recency (either order)', () => {
    const newerSecond = reconcileAnchor([
      est(160, 0.75, 'dfa_a1_multi', '2026-01-01T00:00:00Z'),
      est(163, 0.75, 'dfa_a1_multi', '2026-06-01T00:00:00Z'),
    ]);
    expect(newerSecond!.value).toBe(163);
    // First candidate is the more recent one → it must be kept.
    const newerFirst = reconcileAnchor([
      est(161, 0.75, 'dfa_a1_multi', '2026-06-01T00:00:00Z'),
      est(159, 0.75, 'dfa_a1_multi', '2026-01-01T00:00:00Z'),
    ]);
    expect(newerFirst!.value).toBe(161);
  });

  it('returns undefined for no candidates', () => {
    expect(reconcileAnchor<number>([])).toBeUndefined();
  });

  it('never returns more confidence than the best candidate (I14)', () => {
    const candidates = [est(1, 0.4, 'passive_inference'), est(2, 0.6, 'athlete_reported')];
    const max = Math.max(...candidates.map((c) => c.confidence));
    expect(reconcileAnchor(candidates)!.confidence).toBeLessThanOrEqual(max);
  });

  it('assertNoSilentUpgrade throws on a same-provenance confidence increase (I14)', () => {
    const prev = est(160, 0.5, 'dfa_a1_single');
    const bad = est(160, 0.7, 'dfa_a1_single');
    expect(() => assertNoSilentUpgrade(prev, bad)).toThrow(/I14/);
    // A genuine higher-priority provenance is allowed to raise confidence.
    const good = est(160, 0.75, 'dfa_a1_multi');
    expect(() => assertNoSilentUpgrade(prev, good)).not.toThrow();
  });
});

describe('sportAnchorConfidence (§2.4)', () => {
  const lt = (hr: number, confidence: number): Estimate<ThresholdPoint> => ({
    value: { hr },
    confidence,
    provenance: 'dfa_a1_multi',
    measuredAt: NOW,
  });
  function model(sports: AthleteModel['sports'], hrMaxConf: number): AthleteModel {
    return {
      hrMax: { value: 190, confidence: hrMaxConf, provenance: 'population_formula', measuredAt: NOW },
      hrRest: { value: 50, confidence: 0.85, provenance: 'field_test', measuredAt: NOW },
      hrReserve: 140,
      sports,
      updatedAt: NOW,
    };
  }

  it('is the weaker of LT1/LT2 when both are known', () => {
    const m = model({ run: { lt1: lt(140, 0.75), lt2: lt(168, 0.5) } }, 0.2);
    expect(sportAnchorConfidence(m, 'run')).toBe(0.5);
  });

  it('falls back to HRmax confidence when thresholds are missing', () => {
    const m = model({ run: {} }, 0.2);
    expect(sportAnchorConfidence(m, 'run')).toBe(0.2);
  });
});
