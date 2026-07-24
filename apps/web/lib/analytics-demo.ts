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
  weeklyReplan,
  type Distribution,
  type DurabilityResponse,
  type FitnessPoint,
  type ReplanDecision,
  type WeeklyReplanContext,
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
  /** One sentence on where form stands — TSB reads sub-zero mid-build by design (§5.2). */
  tsbNarrative: string;
  distribution: {
    actual: Distribution;
    target: Distribution;
    withinTolerance: boolean;
    moderateDrift: boolean;
    narrative: string;
  };
  durability: {
    latestPct: number;
    valid: boolean;
    exceedsTarget: boolean;
    trend: number[];
    response: DurabilityResponse;
  };
  /** This week's §10.3 weekly re-planning triggers — empty means the plan is on track. */
  replan: ReplanDecision[];
}

// A representative week that trips two real §10.3 triggers: two weeks of under-completion
// with clean readiness (the plan asked too much), and a sustained HR-at-pace improvement
// (verify with a test before touching zones — never a silent upgrade).
const REPLAN_CONTEXT: WeeklyReplanContext = {
  completionByWeek: [0.68, 0.65],
  actualLoadLastWeek: 640,
  readinessFlaggedWeeks: 0,
  readinessStableWeeks: 0,
  hrAtPaceChangeFrac: -0.035,
  hrAtPaceWeeks: 3,
};

function tsbNarrative(tsb: number): string {
  if (tsb < -5) return "Form has been running low for a few weeks — that's what a build block looks like. It comes back in the taper.";
  if (tsb > 5) return "Form is positive — you're fresh, which is useful heading into a key session or race.";
  return 'Fitness and fatigue are roughly in step right now.';
}

function distributionNarrative(withinTolerance: boolean, moderateDrift: boolean): string {
  if (moderateDrift) return 'Your S2 time is creeping up — worth easing back toward genuinely easy on aerobic days.';
  if (withinTolerance) return 'Neither too polarised nor grey-zone. Your easy work is genuinely easy.';
  return "Your mix has drifted from target — the plan will nudge it back over the next few weeks.";
}

export function buildAnalyticsView(): AnalyticsView {
  const series = fitnessSeries(buildDailyLoads());
  const current = series[series.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };
  const peakCtl = Math.max(...series.map((p) => p.ctl));

  const actual: Distribution = { S1: 76, S2: 16, S3: 8 };
  const target = distributionTarget('build', 'long');
  const withinTolerance = isWithinTolerance(actual, target);
  const moderateDrift = isModerateDrift(actual.S2 / 100);

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
    tsbNarrative: tsbNarrative(current.tsb),
    distribution: {
      actual,
      target,
      withinTolerance,
      moderateDrift,
      narrative: distributionNarrative(withinTolerance, moderateDrift),
    },
    durability: {
      latestPct: latest.decouplingPct,
      valid: latest.valid,
      exceedsTarget: latest.exceedsTarget,
      trend: [8.4, 7.6, 7.1, latest.decouplingPct],
      response: durabilityResponse(latest),
    },
    replan: weeklyReplan(REPLAN_CONTEXT),
  };
}
