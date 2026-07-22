import { describe, expect, it } from 'vitest';
import f1 from '../../../../supabase/seed/fixtures/F1-zones-threshold.json' with { type: 'json' };
import f2 from '../../../../supabase/seed/fixtures/F2-zones-fallback.json' with { type: 'json' };
import { buildZones } from '../zones/build.js';
import { rollupToSZones, zoneToSZone } from '../zones/seiler.js';
import type { AthleteModel } from '../types.js';

const NOW = '2026-07-22T00:00:00Z';

function thresholdModel(): AthleteModel {
  const { hrMax, hrRest, lt1Hr, lt2Hr } = f1.input;
  return {
    hrMax: { value: hrMax, confidence: 0.75, provenance: 'field_test', measuredAt: NOW },
    hrRest: { value: hrRest, confidence: 0.85, provenance: 'field_test', measuredAt: NOW },
    hrReserve: hrMax - hrRest,
    sports: {
      run: {
        lt1: { value: { hr: lt1Hr }, confidence: 0.75, provenance: 'dfa_a1_multi', measuredAt: NOW },
        lt2: { value: { hr: lt2Hr }, confidence: 0.75, provenance: 'dfa_a1_multi', measuredAt: NOW },
      },
    },
    updatedAt: NOW,
  };
}

function fallbackModel(): AthleteModel {
  const { hrMax, hrRest } = f2.input;
  return {
    hrMax: { value: hrMax, confidence: 0.2, provenance: 'population_formula', measuredAt: NOW },
    hrRest: { value: hrRest, confidence: 0.15, provenance: 'population_formula', measuredAt: NOW },
    hrReserve: hrMax - hrRest,
    sports: { run: {} },
    updatedAt: NOW,
  };
}

describe('Zone construction (§3)', () => {
  it('F1 — threshold-anchored zones match the golden fixture', () => {
    const zs = buildZones(thresholdModel(), 'run');
    expect(zs.mode).toBe('threshold_anchored');
    expect(zs.hrReserve).toBe(f1.expected.hrReserve); // 142

    const byId = Object.fromEntries(zs.zones.map((z) => [z.id, z]));
    expect(byId.Z1!.upper.bpm).toBe(f1.expected.z1UpperBpm); // 130.64 → 131

    expect(byId.Z2!.upper.bpm).toBe(f1.expected.z2Upper.bpm); // 142
    expect(byId.Z2!.upper.pctHRR).toBeCloseTo(f1.expected.z2Upper.pctHRR, 3); // 69.0%

    expect(byId.Z3!.upper.bpm).toBe(f1.expected.z3Upper.bpm); // 155
    expect(byId.Z3!.upper.pctHRR).toBeCloseTo(f1.expected.z3Upper.pctHRR, 3); // 78.2%

    expect(byId.Z4!.upper.bpm).toBe(f1.expected.z4Upper.bpm); // 168
    expect(byId.Z4!.upper.pctHRR).toBeCloseTo(f1.expected.z4Upper.pctHRR, 3); // 87.3%

    // I4 — the threshold boundaries land exactly on LT1 and LT2.
    expect(byId.Z2!.upper.bpm).toBe(f1.input.lt1Hr);
    expect(byId.Z4!.upper.bpm).toBe(f1.input.lt2Hr);
    // Z5 tops out at HRmax; Z1 floors at HRrest (I2).
    expect(byId.Z5!.upper.bpm).toBe(f1.input.hrMax);
    expect(byId.Z1!.lower.bpm).toBe(f1.input.hrRest);
  });

  it('F2 — HRR fallback zones match the golden fixture and are low-confidence', () => {
    const zs = buildZones(fallbackModel(), 'run');
    expect(zs.mode).toBe('hrr_fallback');
    expect(zs.hrReserve).toBe(f2.expected.hrReserve); // 140

    // The five reported boundaries: Z1 lower (50% HRR) + the four internal uppers.
    const boundaries = [
      zs.zones[0]!.lower.bpm,
      zs.zones[0]!.upper.bpm,
      zs.zones[1]!.upper.bpm,
      zs.zones[2]!.upper.bpm,
      zs.zones[3]!.upper.bpm,
    ];
    expect(boundaries).toEqual(f2.expected.boundaryBpms); // [120, 134, 148, 162, 176]
    expect(zs.zones[4]!.upper.bpm).toBe(f2.input.hrMax); // Z5 → HRmax (190)

    // Ties I15: this model must be flagged low-confidence.
    expect(zs.anchorConfidence).toBeLessThan(f2.expected.anchorConfidenceBelow); // < 0.30
  });

  it('renders zones for a sport that has no thresholds via fallback', () => {
    const model = thresholdModel();
    // bike has no anchors → fallback even though run is threshold-anchored
    const zs = buildZones(model, 'bike');
    expect(zs.mode).toBe('hrr_fallback');
  });
});

describe('3-zone roll-up (§3.3)', () => {
  it('maps 5 zones to the S1/S2/S3 accounting frame', () => {
    expect(zoneToSZone('Z1')).toBe('S1');
    expect(zoneToSZone('Z2')).toBe('S1');
    expect(zoneToSZone('Z3')).toBe('S2');
    expect(zoneToSZone('Z4')).toBe('S2');
    expect(zoneToSZone('Z5')).toBe('S3');
  });

  it('rolls seconds-in-zone up correctly', () => {
    const rolled = rollupToSZones({ Z1: 600, Z2: 1200, Z3: 300, Z4: 200, Z5: 120 });
    expect(rolled).toEqual({ S1: 1800, S2: 500, S3: 120 });
  });

  it('treats missing zones as zero seconds', () => {
    const rolled = rollupToSZones({ Z1: 500, Z3: undefined, Z5: 60 });
    expect(rolled).toEqual({ S1: 500, S2: 0, S3: 60 });
  });
});

describe('Zone construction — degenerate guard', () => {
  it('keeps every boundary within [HRrest, HRmax] with a fractional HRrest (I2)', () => {
    const NOW3 = '2026-07-22T00:00:00Z';
    const model: AthleteModel = {
      hrMax: { value: 186, confidence: 0.8, provenance: 'observed_max', measuredAt: NOW3 },
      // Fractional 5th-percentile HRrest — the case the integer fixtures miss.
      hrRest: { value: 43.3, confidence: 0.85, provenance: 'field_test', measuredAt: NOW3 },
      hrReserve: 142.7,
      sports: {
        run: {
          lt1: { value: { hr: 139 }, confidence: 0.75, provenance: 'dfa_a1_multi', measuredAt: NOW3 },
          lt2: { value: { hr: 154 }, confidence: 0.75, provenance: 'dfa_a1_multi', measuredAt: NOW3 },
        },
      },
      updatedAt: NOW3,
    };
    const zs = buildZones(model, 'run');
    expect(zs.zones[0]!.lower.bpm).toBeGreaterThanOrEqual(Math.round(43.3)); // no dip below HRrest
    expect(zs.zones[0]!.lower.pctHRR).toBeGreaterThanOrEqual(0); // never negative
    for (const z of zs.zones) {
      for (const b of [z.lower, z.upper]) {
        expect(b.bpm).toBeGreaterThanOrEqual(43);
        expect(b.bpm).toBeLessThanOrEqual(186);
      }
    }
  });

  it('does not divide by zero when HRR collapses (hrMax == hrRest)', () => {
    const NOW2 = '2026-07-22T00:00:00Z';
    const degenerate: AthleteModel = {
      hrMax: { value: 150, confidence: 0.2, provenance: 'population_formula', measuredAt: NOW2 },
      hrRest: { value: 150, confidence: 0.15, provenance: 'population_formula', measuredAt: NOW2 },
      hrReserve: 0,
      sports: { run: {} },
      updatedAt: NOW2,
    };
    const zs = buildZones(degenerate, 'run');
    for (const z of zs.zones) {
      expect(Number.isFinite(z.upper.pctHRR)).toBe(true);
      expect(Number.isFinite(z.upper.pctHRmax)).toBe(true);
    }
  });
});
