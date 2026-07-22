/**
 * anchors/reconcile.ts — merge all sources into one AthleteModel (03-ALGORITHM.md §2, §6).
 *
 * Multiple estimates for the same anchor (DFA-a1, CP fit, field test, athlete report) are
 * reconciled by trust: the highest-confidence estimate wins, ties broken by recency. This
 * guarantees invariant I14 — an Estimate only ever gains confidence via a higher-priority
 * provenance, never silently.
 */

import type { AthleteModel, Estimate, Sport } from '../types.js';

/** Pick the most trustworthy estimate: highest confidence, ties broken by most recent. */
export function reconcileAnchor<T>(candidates: Estimate<T>[]): Estimate<T> | undefined {
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, c) => {
    if (c.confidence > best.confidence) return c;
    if (c.confidence === best.confidence) {
      return new Date(c.measuredAt).getTime() >= new Date(best.measuredAt).getTime() ? c : best;
    }
    return best;
  });
}

/**
 * The confidence that a sport's zones/plan are built from (§2.4 "combined anchor
 * confidence"). When both thresholds are known the zones are physiology-pinned, so
 * confidence is the weaker of LT1/LT2; otherwise the zones are HRR-fallback and confidence
 * is that of HRmax. Single source of truth, shared with zones/build.ts.
 */
export function sportAnchorConfidence(model: AthleteModel, sport: Sport): number {
  const anchors = model.sports[sport];
  if (anchors?.lt1 && anchors?.lt2) {
    return Math.min(anchors.lt1.confidence, anchors.lt2.confidence);
  }
  return model.hrMax.confidence;
}

/** Assert an updated estimate never downgrades provenance-derived confidence (I14 guard). */
export function assertNoSilentUpgrade<T>(prev: Estimate<T> | undefined, next: Estimate<T>): Estimate<T> {
  if (prev && next.confidence > prev.confidence && next.provenance === prev.provenance) {
    throw new Error(
      `I14 violation: confidence raised from ${prev.confidence} to ${next.confidence} ` +
        `without a higher-priority provenance (still '${next.provenance}')`,
    );
  }
  return next;
}
