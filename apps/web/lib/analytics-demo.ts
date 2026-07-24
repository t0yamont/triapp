/**
 * lib/analytics-demo.ts — presentation glue for Analytics (06-UX.md §5; §5.2 fitness; §11
 * durability). Every value is computed by the pure engine: the CTL/ATL/TSB series from
 * `fitnessSeries`, the distribution check from `distribution/policy`, and decoupling from
 * `durability/decoupling`. This module only supplies a representative training block and maps
 * the output into view props. Swaps to live activity/rollup reads later.
 */

import {
  computeDecoupling,
  distributionTarget,
  durabilityResponse,
  fitnessSeries,
  isModerateDrift,
  isWithinTolerance,
  type Distribution,
  type DurabilityResponse,
  type FitnessPoint,
} from '@ironflow/core/physio';

// ── Representative 12-week build block (deterministic) ────────────────────────
// A progressive load with a weekly rhythm and a recovery week every 4th — enough to shape a
// believable fitness/fatigue/form curve. Synthetic seed, not physiology.
const WEEKS = 12;
const DAY_PATTERN = [0.7, 1.4, 0.6, 1.3, 0, 1.85, 1.1]; // Mon..Sun weighting
function buildDailyLoads(): number[] {
  const loads: number[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const isRecovery = w % 4 === 3;
    const base = (42 + w * 3.2) * (isRecovery ? 0.6 : 1); // progressive ramp, recovery dips
    for (let d = 0; d < 7; d++) loads.push(Math.round(base * (DAY_PATTERN[d] ?? 0)));
  }
  return loads;
}

export interface AnalyticsView {
  series: FitnessPoint[];
  current: FitnessPoint;
  /** Peak CTL over the block, for chart scaling and a "fitness high" read. */
  peakCtl: number;
  distribution: {
    actual: Distribution;
    target: Distribution;
    withinTolerance: boolean;
    moderateDrift: boolean;
  };
  durability: {
    latestPct: number;
    valid: boolean;
    exceedsTarget: boolean;
    trend: number[];
    response: DurabilityResponse;
  };
}

export function buildAnalyticsView(): AnalyticsView {
  const series = fitnessSeries(buildDailyLoads());
  const current = series[series.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };
  const peakCtl = Math.max(...series.map((p) => p.ctl));

  const actual: Distribution = { S1: 76, S2: 16, S3: 8 };
  const target = distributionTarget('build', 'long');

  // Latest long-ride decoupling — drifting late but improving across the block.
  const latest = computeDecoupling({
    first: { meanHr: 152, meanIntensity: 248, intensityCv: 0.05 },
    second: { meanHr: 162, meanIntensity: 248, intensityCv: 0.06 },
    durationMin: 195,
    hadLongStop: false,
    ambientRecorded: true,
  });

  return {
    series,
    current,
    peakCtl,
    distribution: {
      actual,
      target,
      withinTolerance: isWithinTolerance(actual, target),
      moderateDrift: isModerateDrift(actual.S2 / 100),
    },
    durability: {
      latestPct: latest.decouplingPct,
      valid: latest.valid,
      exceedsTarget: latest.exceedsTarget,
      trend: [8.4, 7.6, 7.1, latest.decouplingPct],
      response: durabilityResponse(latest),
    },
  };
}
