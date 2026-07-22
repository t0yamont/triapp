import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitCriticalPower, type CpFitPoint } from '../anchors/criticalPower.js';
import { reconcileAnchor } from '../anchors/reconcile.js';
import { bikeTss } from '../load/tss.js';
import { buildZones } from '../zones/build.js';
import type { AthleteModel, Estimate } from '../types.js';

const NOW = '2026-07-22T00:00:00Z';

/** Generator of physiologically valid threshold-anchored athlete models. */
const thresholdModelArb = fc
  .record({
    hrRest: fc.integer({ min: 35, max: 65 }),
    hrReserve: fc.integer({ min: 90, max: 150 }),
    aPct: fc.integer({ min: 40, max: 60 }),
    gapPct: fc.integer({ min: 16, max: 30 }),
  })
  .map(({ hrRest, hrReserve, aPct, gapPct }): AthleteModel => {
    const hrMax = hrRest + hrReserve;
    const lt1 = hrRest + Math.round((aPct / 100) * hrReserve);
    const bPct = Math.min(aPct + gapPct, 93);
    const lt2 = hrRest + Math.round((bPct / 100) * hrReserve);
    return {
      hrMax: { value: hrMax, confidence: 0.75, provenance: 'field_test', measuredAt: NOW },
      hrRest: { value: hrRest, confidence: 0.85, provenance: 'field_test', measuredAt: NOW },
      hrReserve,
      sports: {
        run: {
          lt1: { value: { hr: lt1 }, confidence: 0.75, provenance: 'dfa_a1_multi', measuredAt: NOW },
          lt2: { value: { hr: lt2 }, confidence: 0.75, provenance: 'dfa_a1_multi', measuredAt: NOW },
        },
      },
      updatedAt: NOW,
    };
  });

/** Generator of fallback (no-threshold) athlete models. */
const fallbackModelArb = fc
  .record({ hrRest: fc.integer({ min: 35, max: 70 }), hrReserve: fc.integer({ min: 80, max: 160 }) })
  .map(({ hrRest, hrReserve }): AthleteModel => {
    const hrMax = hrRest + hrReserve;
    return {
      hrMax: { value: hrMax, confidence: 0.2, provenance: 'population_formula', measuredAt: NOW },
      hrRest: { value: hrRest, confidence: 0.15, provenance: 'population_formula', measuredAt: NOW },
      hrReserve,
      sports: { run: {} },
      updatedAt: NOW,
    };
  });

function checkBoundaryInvariants(model: AthleteModel) {
  const zs = buildZones(model, 'run');
  const uppers = zs.zones.map((z) => z.upper.bpm);

  // I1 — strictly monotonic increasing upper boundaries.
  for (let i = 1; i < uppers.length; i++) {
    expect(uppers[i]!).toBeGreaterThan(uppers[i - 1]!);
  }

  // I2 — every boundary lies within [hrRest, hrMax].
  for (const z of zs.zones) {
    for (const b of [z.lower, z.upper]) {
      expect(b.bpm).toBeGreaterThanOrEqual(model.hrRest.value);
      expect(b.bpm).toBeLessThanOrEqual(model.hrMax.value);
    }
  }

  // I3 — pctHRR and bpm agree to within 1 bpm after rounding.
  for (const z of zs.zones) {
    for (const b of [z.lower, z.upper]) {
      const reconstructed = Math.round(model.hrRest.value + b.pctHRR * model.hrReserve);
      expect(Math.abs(reconstructed - b.bpm)).toBeLessThanOrEqual(1);
    }
  }
  return zs;
}

describe('Zone invariants (I1–I4)', () => {
  it('I1/I2/I3 hold for all threshold-anchored models', () => {
    fc.assert(
      fc.property(thresholdModelArb, (model) => {
        const zs = checkBoundaryInvariants(model);
        // I4 — Z2.upper == HR@LT1 and Z4.upper == HR@LT2 exactly.
        const byId = Object.fromEntries(zs.zones.map((z) => [z.id, z]));
        expect(byId.Z2!.upper.bpm).toBe(model.sports.run!.lt1!.value.hr);
        expect(byId.Z4!.upper.bpm).toBe(model.sports.run!.lt2!.value.hr);
      }),
    );
  });

  it('I1/I2/I3 hold for all fallback models', () => {
    fc.assert(
      fc.property(fallbackModelArb, (model) => {
        checkBoundaryInvariants(model);
      }),
    );
  });
});

describe('I14 — confidence is never silently increased', () => {
  it('reconcileAnchor never returns more than the max candidate confidence', () => {
    const estArb = fc.record({
      value: fc.integer({ min: 100, max: 200 }),
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
      provenance: fc.constantFrom<Estimate<number>['provenance']>(
        'field_test',
        'dfa_a1_multi',
        'cp_model_fit',
        'athlete_reported',
        'dfa_a1_single',
        'passive_inference',
        'population_formula',
      ),
      measuredAt: fc.constant(NOW),
    });
    fc.assert(
      fc.property(fc.array(estArb, { minLength: 1, maxLength: 8 }), (candidates) => {
        const winner = reconcileAnchor(candidates)!;
        const max = Math.max(...candidates.map((c) => c.confidence));
        expect(winner.confidence).toBeLessThanOrEqual(max);
      }),
    );
  });
});

describe('I16 — engine functions are pure (same inputs → deep-equal outputs)', () => {
  it('buildZones is deterministic', () => {
    fc.assert(
      fc.property(thresholdModelArb, (model) => {
        expect(buildZones(model, 'run')).toEqual(buildZones(model, 'run'));
      }),
    );
  });

  it('bikeTss is deterministic', () => {
    fc.assert(
      fc.property(
        fc.record({
          durationS: fc.integer({ min: 600, max: 14400 }),
          np: fc.integer({ min: 100, max: 400 }),
          cp: fc.integer({ min: 150, max: 450 }),
        }),
        (p) => {
          expect(bikeTss(p)).toEqual(bikeTss(p));
        },
      ),
    );
  });

  it('fitCriticalPower is deterministic', () => {
    const points: CpFitPoint[] = [
      { durationS: 180, power: 320, sessionId: 's1', date: '2026-06-01T00:00:00Z' },
      { durationS: 600, power: 262, sessionId: 's2', date: '2026-06-10T00:00:00Z' },
      { durationS: 900, power: 252, sessionId: 's2', date: '2026-06-10T00:00:00Z' },
    ];
    expect(fitCriticalPower(points, 'bike', NOW)).toEqual(fitCriticalPower(points, 'bike', NOW));
  });
});
