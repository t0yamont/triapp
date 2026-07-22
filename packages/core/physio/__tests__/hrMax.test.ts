import { describe, expect, it } from 'vitest';
import f3 from '../../../../supabase/seed/fixtures/F3-hrmax-formula.json' with { type: 'json' };
import { deriveHrMax, hrMaxFormulas } from '../anchors/hrMax.js';

const NOW = '2026-07-22T00:00:00Z';

describe('HRmax derivation (§2.2)', () => {
  it('F3 — HUNT and Tanaka are computed separately and HUNT is the one used', () => {
    const { hunt, tanaka } = hrMaxFormulas(f3.input.age);
    expect(hunt).toBeCloseTo(f3.expected.hunt, 5); // 211 − 0.64·30 = 191.8
    expect(tanaka).toBeCloseTo(f3.expected.tanaka, 5); // 208 − 0.7·30 = 187.0
    expect(hunt).not.toBeCloseTo(tanaka, 1);

    const est = deriveHrMax({ age: f3.input.age, now: NOW })!;
    expect(est.value).toBeCloseTo(f3.expected.hunt, 5);
    expect(est.formula).toBe(f3.expected.usedFormula);
    expect(est.provenance).toBe(f3.expected.provenance);
    expect(est.tanakaComparison).toBeCloseTo(f3.expected.tanaka, 5);
    expect(est.confidence).toBe(0.2);
  });

  it('prefers a lab test (1.00) over everything', () => {
    const est = deriveHrMax({
      age: 30,
      labTest: { value: 195, measuredAt: '2026-01-01T00:00:00Z' },
      now: NOW,
    })!;
    expect(est.value).toBe(195);
    expect(est.provenance).toBe('lab_test');
    expect(est.confidence).toBe(1.0);
  });

  it('accepts a valid observed max (0.80) over athlete-reported and formula', () => {
    const est = deriveHrMax({
      age: 30,
      athleteReported: { value: 190, measuredAt: NOW },
      observed: {
        value: 188,
        measuredAt: '2026-06-01T00:00:00Z',
        source: 'chest_strap',
        sustainedSeconds: 15,
        precededByJumpOver20BpmIn5s: false,
        sessionDurationMin: 45,
        withinPeakDistribution: true,
      },
      now: NOW,
    })!;
    expect(est.value).toBe(188);
    expect(est.provenance).toBe('observed_max');
    expect(est.confidence).toBe(0.8);
  });

  it('rejects an observed max from wrist optical or with a strap artefact', () => {
    const base = {
      value: 205,
      measuredAt: '2026-06-01T00:00:00Z',
      sustainedSeconds: 15,
      precededByJumpOver20BpmIn5s: false,
      sessionDurationMin: 45,
      withinPeakDistribution: true,
    };
    // wrist optical is not acceptable for HRmax observation (§2.2)
    const wrist = deriveHrMax({
      age: 30,
      observed: { ...base, source: 'wrist_optical' },
      now: NOW,
    })!;
    expect(wrist.provenance).toBe('population_formula');
    // strap artefact (>20 bpm jump in <5 s) invalidates
    const artefact = deriveHrMax({
      age: 30,
      observed: { ...base, source: 'chest_strap', precededByJumpOver20BpmIn5s: true },
      now: NOW,
    })!;
    expect(artefact.provenance).toBe('population_formula');
  });

  it('rejects an observed max older than 12 months', () => {
    const est = deriveHrMax({
      age: 30,
      observed: {
        value: 205,
        measuredAt: '2024-01-01T00:00:00Z',
        source: 'chest_strap',
        sustainedSeconds: 15,
        precededByJumpOver20BpmIn5s: false,
        sessionDurationMin: 45,
        withinPeakDistribution: true,
      },
      now: NOW,
    })!;
    expect(est.provenance).toBe('population_formula');
  });

  it('uses athlete-reported (0.60) when no lab test or valid observation exists', () => {
    const est = deriveHrMax({
      age: 30,
      athleteReported: { value: 189, measuredAt: '2026-05-01T00:00:00Z' },
      now: NOW,
    })!;
    expect(est.value).toBe(189);
    expect(est.provenance).toBe('athlete_reported');
    expect(est.confidence).toBe(0.6);
  });

  it('rejects an observed max from too short a session or sustain', () => {
    const base = {
      value: 205,
      measuredAt: '2026-06-01T00:00:00Z',
      source: 'chest_strap' as const,
      precededByJumpOver20BpmIn5s: false,
      withinPeakDistribution: true,
    };
    const shortSustain = deriveHrMax({
      age: 30,
      observed: { ...base, sustainedSeconds: 4, sessionDurationMin: 45 },
      now: NOW,
    })!;
    expect(shortSustain.provenance).toBe('population_formula');
    const shortSession = deriveHrMax({
      age: 30,
      observed: { ...base, sustainedSeconds: 15, sessionDurationMin: 5 },
      now: NOW,
    })!;
    expect(shortSession.provenance).toBe('population_formula');
    const outOfDist = deriveHrMax({
      age: 30,
      observed: { ...base, sustainedSeconds: 15, sessionDurationMin: 45, withinPeakDistribution: false },
      now: NOW,
    })!;
    expect(outOfDist.provenance).toBe('population_formula');
  });

  it('returns null when nothing at all is available', () => {
    expect(deriveHrMax({ now: NOW })).toBeNull();
  });
});
