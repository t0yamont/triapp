/**
 * distribution/policy.ts — phase-dependent intensity-distribution targets (§4.2) and the
 * moderate-drift check (§3.4). Distribution is a TARGET, not a constraint: the planner
 * optimises toward it and never rejects a session for missing it (§4.3).
 */

import {
  DISTRIBUTION_TARGETS,
  DISTRIBUTION_TOLERANCE,
  MODERATE_DRIFT_S2_TIME_PCT,
} from '../constants.js';
import type { CourseType, Distribution, PlanPhase } from '../plan/types.js';

/**
 * The §4.2 distribution target for a phase. Long-course peaking is deliberately NOT
 * polarised. `race_week` inherits the taper shape; `transition` inherits recovery.
 */
export function distributionTarget(phase: PlanPhase, course: CourseType): Distribution {
  switch (phase) {
    case 'base':
      return { ...DISTRIBUTION_TARGETS.base };
    case 'build':
      return { ...(course === 'short' ? DISTRIBUTION_TARGETS.build_short : DISTRIBUTION_TARGETS.build_long) };
    case 'peak':
      return { ...(course === 'short' ? DISTRIBUTION_TARGETS.peak_short : DISTRIBUTION_TARGETS.peak_long) };
    case 'taper':
    case 'race_week':
      return { ...DISTRIBUTION_TARGETS.taper };
    case 'recovery':
    case 'transition':
      return { ...DISTRIBUTION_TARGETS.recovery };
  }
}

/** True when a measured distribution is within tolerance of its target (±7 S1, ±5 S2/S3). */
export function isWithinTolerance(actual: Distribution, target: Distribution): boolean {
  return (
    Math.abs(actual.S1 - target.S1) <= DISTRIBUTION_TOLERANCE.S1 &&
    Math.abs(actual.S2 - target.S2) <= DISTRIBUTION_TOLERANCE.S2 &&
    Math.abs(actual.S3 - target.S3) <= DISTRIBUTION_TOLERANCE.S3
  );
}

/**
 * Moderate-drift check (§3.4): the most common self-coached failure mode is easy sessions
 * creeping up. Warns when S2 time-in-zone exceeds 25% of weekly time even though session-goal
 * classification says the week was polarised.
 */
export function isModerateDrift(s2TimeFraction: number): boolean {
  return s2TimeFraction > MODERATE_DRIFT_S2_TIME_PCT;
}
