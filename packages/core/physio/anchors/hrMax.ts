/**
 * anchors/hrMax.ts — HRmax derivation with confidence (03-ALGORITHM.md §2.2).
 *
 * Priority order, highest available wins: supervised test (1.00) → highest valid observed
 * HR in the last 12 months (0.80) → athlete-reported (0.60) → population formula (0.20).
 *
 * A zone system built on estimated HRmax can be a full zone wrong (SD ≈ 10–12 bpm), which
 * is why confidence must propagate and the engine aggressively schedules a test.
 */

import { HRMAX_HUNT, HRMAX_TANAKA, PROVENANCE_CONFIDENCE } from '../constants.js';
import type { Estimate, ISODateTime } from '../types.js';

export type HrMaxFormula = 'HUNT' | 'Tanaka' | 'measured';

/** HRmax estimate, extended with the formula identifier the spec requires we store. */
export interface HrMaxEstimate extends Estimate<number> {
  formula: HrMaxFormula;
  /** Tanaka comparison value, present for display only when a formula was used (§2.2). */
  tanakaComparison?: number;
}

/**
 * A candidate observed-HR maximum, already extracted from a session by the ingest layer.
 * The validity filter (§2.2) is applied here; the raw stream never reaches physio/.
 */
export interface ObservedHrMaxCandidate {
  value: number;
  measuredAt: ISODateTime;
  source: 'chest_strap' | 'validated_optical' | 'wrist_optical';
  /** Seconds sustained at this HR after 3-second smoothing. Must be ≥10. */
  sustainedSeconds: number;
  /** True if preceded by a >20 bpm jump in <5 s (strap artefact) — invalidates. */
  precededByJumpOver20BpmIn5s: boolean;
  /** Session duration in minutes. Must be ≥10. */
  sessionDurationMin: number;
  /** False if the value is >3 SD above the athlete's rolling 90-day HR peak distribution. */
  withinPeakDistribution: boolean;
}

export interface HrMaxInputs {
  age?: number;
  labTest?: { value: number; measuredAt: ISODateTime };
  athleteReported?: { value: number; measuredAt: ISODateTime };
  /** Best observed candidate from the last 12 months (ingest supplies the window filter). */
  observed?: ObservedHrMaxCandidate;
  /** Current time, passed in (physio never reads the clock). */
  now: ISODateTime;
}

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

/** Pure formula pair. Used for the working fallback and the comparison display (§2.2, F3). */
export function hrMaxFormulas(age: number): { hunt: number; tanaka: number } {
  return {
    hunt: HRMAX_HUNT.intercept - HRMAX_HUNT.ageCoef * age,
    tanaka: HRMAX_TANAKA.intercept - HRMAX_TANAKA.ageCoef * age,
  };
}

function observedIsValid(o: ObservedHrMaxCandidate, now: ISODateTime): boolean {
  const withinWindow =
    new Date(now).getTime() - new Date(o.measuredAt).getTime() <= TWELVE_MONTHS_MS;
  return (
    withinWindow &&
    (o.source === 'chest_strap' || o.source === 'validated_optical') &&
    o.sustainedSeconds >= 10 &&
    !o.precededByJumpOver20BpmIn5s &&
    o.sessionDurationMin >= 10 &&
    o.withinPeakDistribution
  );
}

/**
 * Derive HRmax from the best available source. Returns `null` only when no age is given
 * and no other source exists — the caller must then degrade (§14).
 */
export function deriveHrMax(inputs: HrMaxInputs): HrMaxEstimate | null {
  if (inputs.labTest) {
    return {
      value: inputs.labTest.value,
      confidence: PROVENANCE_CONFIDENCE.lab_test,
      provenance: 'lab_test',
      measuredAt: inputs.labTest.measuredAt,
      formula: 'measured',
    };
  }

  if (inputs.observed && observedIsValid(inputs.observed, inputs.now)) {
    // Highest valid observed HR in the last 12 months — confidence 0.80 (§2.2).
    return {
      value: inputs.observed.value,
      confidence: PROVENANCE_CONFIDENCE.observed_max,
      provenance: 'observed_max',
      measuredAt: inputs.observed.measuredAt,
      formula: 'measured',
    };
  }

  if (inputs.athleteReported) {
    return {
      value: inputs.athleteReported.value,
      confidence: PROVENANCE_CONFIDENCE.athlete_reported,
      provenance: 'athlete_reported',
      measuredAt: inputs.athleteReported.measuredAt,
      formula: 'measured',
    };
  }

  if (inputs.age !== undefined) {
    const { hunt, tanaka } = hrMaxFormulas(inputs.age);
    return {
      value: hunt, // HUNT is the working value; Tanaka is comparison only (§2.2)
      confidence: PROVENANCE_CONFIDENCE.population_formula,
      provenance: 'population_formula',
      measuredAt: inputs.now,
      formula: 'HUNT',
      tanakaComparison: tanaka,
    };
  }

  return null;
}
