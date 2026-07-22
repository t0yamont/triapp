/**
 * physio/confidence.ts — how confidence changes behaviour (03-ALGORITHM.md §2.4).
 *
 * "This is the mechanism that makes an under-informed plan *safe* rather than merely
 * uncertain." Low confidence ⇒ slower progression, more conservative intensity, earlier
 * scheduled testing, and — below 0.30 — no Z4/Z5 work at all.
 */

import type { ConfidenceBehaviour } from './types.js';

/**
 * Map combined anchor confidence to the §2.4 behaviour tier.
 *
 * Values the spec states explicitly per tier are transcribed directly. Where the spec
 * does not restate a field at a lower tier (e.g. the 3% intensity shift below 0.50), we
 * carry the last stated conservative value forward — never a *less* conservative one —
 * so behaviour is monotonic in confidence (invariant P2 spirit). These carry-forwards
 * are marked below and logged in DECISIONS.md.
 */
export function confidenceBehaviour(confidence: number): ConfidenceBehaviour {
  if (confidence >= 0.75) {
    // ≥0.75: full progression, intensity to the boundary, test cadence 8 weeks.
    return {
      tier: 'high',
      rampCapMultiplier: 1.0,
      intensityShiftPct: 0,
      z5VolumeFraction: 1.0,
      maxSZone: 'S3',
      testCadenceWeeks: 8,
      testWithinDays: 56,
      blocking: false,
    };
  }
  if (confidence >= 0.5) {
    // 0.50–0.74: ramp cap −25%, intensity 3% conservative, test cadence 6 weeks.
    return {
      tier: 'moderate',
      rampCapMultiplier: 0.75,
      intensityShiftPct: 3,
      z5VolumeFraction: 1.0,
      maxSZone: 'S3',
      testCadenceWeeks: 6,
      testWithinDays: 42,
      blocking: false,
    };
  }
  if (confidence >= 0.3) {
    // 0.30–0.49: ramp cap halved, Z5 capped at 50% nominal, test within 14 days.
    // intensityShiftPct: spec does not restate it here; carry the 3% forward (§2.4).
    return {
      tier: 'low',
      rampCapMultiplier: 0.5,
      intensityShiftPct: 3,
      z5VolumeFraction: 0.5,
      maxSZone: 'S3',
      testCadenceWeeks: 2,
      testWithinDays: 14,
      blocking: false,
    };
  }
  // <0.30: no Z4/Z5 at all — aerobic + technique only. Test within 7 days, UI-blocking.
  // maxSZone S1 encodes "aerobic + technique only" and guarantees invariant I15
  // (no S3 workouts generated at this confidence). rampCapMultiplier carried at 0.5
  // (never less conservative than the tier above).
  return {
    tier: 'critical',
    rampCapMultiplier: 0.5,
    intensityShiftPct: 3,
    z5VolumeFraction: 0,
    maxSZone: 'S1',
    testCadenceWeeks: 1,
    testWithinDays: 7,
    blocking: true,
  };
}

/**
 * Conservative combination of several anchor confidences into one: the weakest link.
 *
 * The spec (§2.4) refers to "combined anchor confidence" but does not pin the combination
 * rule. We take the minimum so the engine never claims more confidence than its least
 * certain load-bearing anchor supports (invariant P2). Documented in DECISIONS.md.
 */
export function combineConfidence(confidences: number[]): number {
  if (confidences.length === 0) return 0;
  return Math.min(...confidences);
}
