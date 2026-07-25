/**
 * anchors/criticalSwimSpeed.ts — Critical Swim Speed (CSS), the swim `criticalIntensity`
 * anchor (03-ALGORITHM.md §6.3 lists "CS (m/s) or CSS (m/s)" but ships no swim estimator).
 *
 *   CSS = (d_long − d_short) / (t_long − t_short)
 *
 * from a 400 m and 200 m time trial in one session (~5 min easy recovery between). CSS tracks
 * lactate-threshold speed reasonably well but is not an exact substitute for it: validated at
 * r=0.87, SEE=0.033 m/s vs measured MLSS, with a 0.07 ± 0.13 m/s bias (Nikitakis & Toubekis;
 * see docs/algorithm-review-2026-07.md §2.4). That moderate-but-imperfect agreement is why CSS
 * carries its own provenance tier rather than borrowing `field_test`.
 */

import { CSS_LONG_M, CSS_MAX_PACE_DRIFT, CSS_SHORT_M, PROVENANCE_CONFIDENCE } from '../constants.js';
import type { Estimate, ISODateTime } from '../types.js';

export interface CssTrial {
  distanceM: number;
  timeS: number;
}

export type CssRejection = 'wrong_distances' | 'non_increasing' | 'pacing_inconsistent';

export interface CssResult {
  estimate: Estimate<number> | null; // m/s
  rejection?: CssRejection;
}

/**
 * Fit CSS from a 200 m and 400 m time trial (either order). Rejects a pair that isn't really
 * two paced efforts at the prescribed distances, or where the swimmer went out so hard on the
 * short trial that the pair no longer reflects a sustainable speed (§6.3's "genuinely maximal,
 * not just fast" requirement, applied here as an internal-consistency check since there is no
 * all-time-best to compare against for a first test).
 */
export function fitCriticalSwimSpeed(trials: [CssTrial, CssTrial], now?: ISODateTime): CssResult {
  const sorted = [...trials].sort((x, y) => x.distanceM - y.distanceM);
  const a = sorted[0]!;
  const b = sorted[1]!;

  if (a.distanceM !== CSS_SHORT_M || b.distanceM !== CSS_LONG_M) {
    return { estimate: null, rejection: 'wrong_distances' };
  }
  if (b.timeS <= a.timeS) {
    return { estimate: null, rejection: 'non_increasing' }; // 400 m must take longer than 200 m
  }

  const css = (b.distanceM - a.distanceM) / (b.timeS - a.timeS);
  const shortPace = a.distanceM / a.timeS;
  // If the 200 m was paced far faster than CSS implies, it was a sprint, not a threshold effort,
  // and the resulting CSS would be inflated.
  if (shortPace > css * (1 + CSS_MAX_PACE_DRIFT)) {
    return { estimate: null, rejection: 'pacing_inconsistent' };
  }

  return {
    estimate: {
      value: css,
      confidence: PROVENANCE_CONFIDENCE.css_test,
      provenance: 'css_test',
      measuredAt: now ?? new Date(0).toISOString(),
    },
  };
}
