/**
 * readiness/score.ts — daily readiness (§10.1). Rolling means against a rolling baseline
 * with an SWC band (SWC = 0.5 × baseline SD), never single-day values. Reweighted over
 * whatever inputs exist; if only subjective wellness is present it carries full weight.
 * The components are always returned — never a bare score (§16, P2).
 */

import { SWC_MULTIPLIER } from '../constants.js';

export interface MetricInput {
  /** Short rolling mean (7-day for HRV/RHR, 3-day for sleep/wellness). */
  rolling: number;
  /** 60-day baseline (HRV/RHR) or the athlete's own norm (sleep/wellness). */
  baseline: number;
  sd: number;
}

export interface ReadinessInputs {
  hrv?: MetricInput; // higher is better
  restingHr?: MetricInput; // lower is better
  sleep?: MetricInput; // higher is better
  wellness?: MetricInput; // higher is better (1–5)
  completionRate?: number; // 0..1, last 7 days
}

export type Band = 'below' | 'within' | 'above' | 'unknown';

export interface ReadinessComponent {
  key: 'hrv' | 'restingHr' | 'sleep' | 'wellness' | 'completion';
  weight: number;
  /** Standardised deviation from baseline; positive = better readiness. */
  z: number;
  band: Exclude<Band, 'unknown'>;
}

export interface Readiness {
  score: number; // 0..100
  band: Band;
  components: ReadinessComponent[];
}

const WEIGHTS = { hrv: 0.4, restingHr: 0.2, sleep: 0.15, wellness: 0.2, completion: 0.05 } as const;

function zBand(z: number): Exclude<Band, 'unknown'> {
  if (z < -SWC_MULTIPLIER) return 'below';
  if (z > SWC_MULTIPLIER) return 'above';
  return 'within';
}

function metricZ(m: MetricInput, higherIsBetter: boolean): number {
  if (m.sd <= 0) return 0;
  const better = higherIsBetter ? m.rolling - m.baseline : m.baseline - m.rolling;
  return better / m.sd;
}

export function readinessScore(inputs: ReadinessInputs): Readiness {
  const components: ReadinessComponent[] = [];
  const add = (key: ReadinessComponent['key'], weight: number, z: number) =>
    components.push({ key, weight, z, band: zBand(z) });

  if (inputs.hrv) add('hrv', WEIGHTS.hrv, metricZ(inputs.hrv, true));
  if (inputs.restingHr) add('restingHr', WEIGHTS.restingHr, metricZ(inputs.restingHr, false));
  if (inputs.sleep) add('sleep', WEIGHTS.sleep, metricZ(inputs.sleep, true));
  if (inputs.wellness) add('wellness', WEIGHTS.wellness, metricZ(inputs.wellness, true));
  if (inputs.completionRate !== undefined) {
    // Presentational mapping (not a physiological constant): 85% completion is neutral, so
    // the §10.3 thresholds (70% low, 95% high) land in the below/above bands.
    add('completion', WEIGHTS.completion, (inputs.completionRate - 0.85) / 0.15);
  }

  if (components.length === 0) return { score: 50, band: 'unknown', components };

  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  const weightedZ = components.reduce((a, c) => a + c.weight * c.z, 0) / totalWeight;
  const score = Math.round(Math.max(0, Math.min(100, 50 + 25 * weightedZ)));
  return { score, band: zBand(weightedZ), components };
}
