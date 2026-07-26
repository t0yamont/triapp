/**
 * anchors/model.ts — assemble the whole-athlete model (§2.1) from whatever anchors are
 * currently derivable.
 *
 * The individual anchor derivations already exist (`deriveHrMax`, `deriveHrRest`); this is
 * the piece that composes them into the `AthleteModel` that [[buildZones]], load metrics and
 * every zone-anchored prescription need. Pure: same inputs, same model, no clock.
 *
 * Returns `null` rather than a partial model when either HR anchor is missing. Zones cannot
 * be built from half an HR reserve, and a model with a fabricated component would be worse
 * than none — every downstream consumer treats "no model" as a well-defined degraded state
 * (§14), but none of them can detect an invented anchor.
 */

import type { AthleteModel, Estimate, ISODateTime, Sport, SportAnchors } from '../types.js';
import { deriveHrMax, type HrMaxInputs } from './hrMax.js';
import { deriveHrRest, type HrRestInputs } from './hrRest.js';

export interface AthleteModelInputs {
  hrMax: HrMaxInputs;
  hrRest: HrRestInputs;
  /** Per-sport thresholds/anchors, when any have been measured. */
  sports?: Partial<Record<Sport, SportAnchors>>;
  bodyMass?: Estimate<number>;
  now: ISODateTime;
}

export interface AthleteModelResult {
  model: AthleteModel;
  /**
   * The model's overall confidence: the **minimum** of its components, never an average
   * (`D-COMBINED-CONF`). A model is only as trustworthy as its weakest anchor, and averaging
   * would let a lab-tested HRmax disguise a guessed resting HR.
   */
  combinedConfidence: number;
}

export function buildAthleteModel(inputs: AthleteModelInputs): AthleteModelResult | null {
  const hrMax = deriveHrMax(inputs.hrMax);
  const hrRest = deriveHrRest(inputs.hrRest);
  if (!hrMax || !hrRest) return null;

  // An HR reserve that isn't positive means the two anchors contradict each other — a
  // reported HRmax below a measured resting HR, say. Zones built on it would be nonsense.
  const hrReserve = Math.round(hrMax.value) - Math.round(hrRest.value);
  if (hrReserve <= 0) return null;

  return {
    model: {
      hrMax,
      hrRest,
      hrReserve,
      sports: inputs.sports ?? {},
      ...(inputs.bodyMass ? { bodyMass: inputs.bodyMass } : {}),
      updatedAt: inputs.now,
    },
    combinedConfidence: Math.min(hrMax.confidence, hrRest.confidence),
  };
}
