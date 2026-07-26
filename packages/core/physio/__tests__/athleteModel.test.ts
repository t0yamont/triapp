import { describe, expect, it } from 'vitest';
import { buildAthleteModel } from '../anchors/model.js';
import { buildZones } from '../zones/build.js';

const NOW = '2026-07-26T07:00:00.000Z';

const inputs = (over: Partial<Parameters<typeof buildAthleteModel>[0]> = {}) => ({
  hrMax: { age: 38, now: NOW },
  hrRest: { morningReadings: [50, 49, 51, 50, 48], now: NOW },
  now: NOW,
  ...over,
});

describe('buildAthleteModel', () => {
  it('builds a model from an age formula plus morning resting-HR readings', () => {
    const result = buildAthleteModel(inputs())!;
    expect(result.model.hrMax.value).toBeGreaterThan(150);
    expect(result.model.hrRest.value).toBeGreaterThan(40);
    expect(result.model.hrReserve).toBe(
      Math.round(result.model.hrMax.value) - Math.round(result.model.hrRest.value),
    );
  });

  it('returns null when resting HR cannot be derived at all', () => {
    expect(buildAthleteModel(inputs({ hrRest: { now: NOW } }))).toBeNull();
  });

  it('returns null when HRmax cannot be derived at all', () => {
    expect(buildAthleteModel(inputs({ hrMax: { now: NOW } }))).toBeNull();
  });

  it('refuses a model whose anchors contradict each other', () => {
    // A reported HRmax below the measured resting HR ⇒ non-positive reserve ⇒ nonsense zones.
    const result = buildAthleteModel(
      inputs({
        hrMax: { athleteReported: { value: 45, measuredAt: NOW }, now: NOW },
        hrRest: { morningReadings: [60, 61, 59], now: NOW },
      }),
    );
    expect(result).toBeNull();
  });

  it('takes combined confidence as the minimum, never an average (D-COMBINED-CONF)', () => {
    const result = buildAthleteModel(inputs())!;
    expect(result.combinedConfidence).toBe(
      Math.min(result.model.hrMax.confidence, result.model.hrRest.confidence),
    );
    // A high-confidence HRmax must not disguise a weaker resting HR.
    const lab = buildAthleteModel(
      inputs({ hrMax: { labTest: { value: 190, measuredAt: NOW }, now: NOW } }),
    )!;
    expect(lab.model.hrMax.confidence).toBe(1);
    expect(lab.combinedConfidence).toBeLessThan(1);
  });

  it('prefers a measured anchor over the age formula', () => {
    const formula = buildAthleteModel(inputs())!;
    const measured = buildAthleteModel(
      inputs({ hrMax: { age: 38, labTest: { value: 191, measuredAt: NOW }, now: NOW } }),
    )!;
    expect(measured.model.hrMax.value).toBe(191);
    expect(measured.model.hrMax.confidence).toBeGreaterThan(formula.model.hrMax.confidence);
  });

  it('carries no sport anchors when none were measured — not empty-but-present ones', () => {
    expect(buildAthleteModel(inputs())!.model.sports).toEqual({});
  });

  it('produces a model buildZones can actually use, in HRR fallback mode', () => {
    const { model } = buildAthleteModel(inputs())!;
    const zones = buildZones(model, 'run');
    expect(zones.mode).toBe('hrr_fallback');
    expect(zones.zones).toHaveLength(5);
    // I2: every boundary inside [HRrest, HRmax].
    for (const z of zones.zones) {
      expect(z.lower.bpm).toBeGreaterThanOrEqual(Math.round(model.hrRest.value));
      expect(z.upper.bpm).toBeLessThanOrEqual(Math.round(model.hrMax.value));
    }
  });
});
