/**
 * degradation.ts — §14's degradation matrix, as a table (F15).
 *
 * The product's premise is that the *same* engine serves an athlete with a lab test and an
 * athlete with a watch and nothing else ([[Project Premise]]); §2.4 makes an under-informed plan
 * *safe*, and §14 says what to do when an input is simply absent. Until now §14 lived only as
 * prose in the spec: `deriveHrMax`/`deriveHrRest` returned null and told the caller to "degrade",
 * and no caller knew what that meant.
 *
 * Pure and total: every combination of capabilities returns a complete answer, because "no
 * crash, no null targets" is exactly what F15 asserts.
 */

import { RPE_BY_SZONE } from './constants.js';
import type { PlanSport } from './plan/types.js';
import type { SZone, ZoneSet } from './types.js';

/**
 * What data this athlete actually has. Every field defaults to *absent* at the call site, so a
 * caller that knows nothing gets the most degraded (safest) prescription rather than the
 * best-case one.
 */
export interface AthleteCapabilities {
  /** RR intervals, for DFA-a1 threshold detection (§6.1). */
  hasHrv: boolean;
  /** Heart rate at all. Without it there are no HR zones. */
  hasHr: boolean;
  hasPowerMeter: boolean;
  /** GPS on runs; false for treadmill-only (§14: accept entered speed, flag GAP unavailable). */
  hasRunningGps: boolean;
  /** Any swim data — pace, distance, stroke count. */
  hasSwimData: boolean;
  /** A device that reports sleep and/or HRV overnight. */
  hasSleepDevice: boolean;
}

/** How a target is expressed to the athlete. Order is the order they should be shown. */
export type TargetModality = 'power' | 'pace' | 'hr' | 'rpe' | 'stroke_count';

export interface DegradationPlan {
  /** DFA-a1 threshold detection is possible (§6.1). */
  dfaA1Available: boolean;
  /** A critical-power fit may be attempted — never from GPS speed alone (§14, bike row). */
  cpFitAllowed: boolean;
  /** Grade-adjusted pace is meaningless without GPS; flag it rather than computing it. */
  gapAvailable: boolean;
  /** TRIMP needs HR. Without it, internal load is not computable at all. */
  trimpAvailable: boolean;
  /** Readiness falls back to wellness + completion when there is no HRV/sleep device (§10.1). */
  readinessFromWellnessOnly: boolean;
  /** A daily wellness prompt becomes required, not optional, as the only readiness input. */
  requireDailyWellnessPrompt: boolean;
  /**
   * §14: with no swim data, swim load is excluded from load totals **with a visible note**.
   * The note is the point — a silently smaller total is indistinguishable from an easy week.
   */
  excludeSwimFromLoadTotals: boolean;
  /** Present exactly when something is excluded, so a caller cannot omit the explanation. */
  swimExclusionNote?: string;
  /** A bike field test with HR anchoring is warranted (§14, no-power-meter row). */
  recommendBikeFieldTest: boolean;
}

const SWIM_EXCLUSION_NOTE =
  'Swim load is left out of your totals: without swim pace data there is no way to score it honestly. The sessions still count as training.';

/** §14, evaluated. */
export function degradationPlan(caps: AthleteCapabilities): DegradationPlan {
  return {
    dfaA1Available: caps.hasHrv,
    // "CP from GPS speed is unreliable — do not attempt."
    cpFitAllowed: caps.hasPowerMeter,
    gapAvailable: caps.hasRunningGps,
    trimpAvailable: caps.hasHr,
    readinessFromWellnessOnly: !caps.hasHrv && !caps.hasSleepDevice,
    requireDailyWellnessPrompt: !caps.hasHrv && !caps.hasSleepDevice,
    excludeSwimFromLoadTotals: !caps.hasSwimData,
    ...(caps.hasSwimData ? {} : { swimExclusionNote: SWIM_EXCLUSION_NOTE }),
    recommendBikeFieldTest: !caps.hasPowerMeter,
  };
}

/**
 * Which modalities a session's targets should be expressed in (§14).
 *
 * Always returns at least one, and RPE is always available because it needs no sensor — that is
 * the whole reason §14 falls back to it. The ordering is "most objective first": an athlete with
 * a power meter reads watts and treats RPE as a sanity check; an athlete with neither reads RPE
 * and treats it as the prescription.
 */
export function targetModalities(sport: PlanSport, caps: AthleteCapabilities): TargetModality[] {
  const modalities: TargetModality[] = [];

  if (sport === 'bike' && caps.hasPowerMeter) modalities.push('power');
  if (sport === 'run' && caps.hasRunningGps) modalities.push('pace');
  if (sport === 'swim') {
    // §14: with no swim data, prescribe by RPE *and* stroke count.
    if (caps.hasSwimData) modalities.push('pace');
    else modalities.push('stroke_count');
  }
  if (caps.hasHr && sport !== 'swim') modalities.push('hr');
  modalities.push('rpe');

  return modalities;
}

/** The CR10 band for a zone (`RPE_BY_SZONE` — a flagged convention, see `D-RPE-BANDS`). */
export function rpeBand(sZone: SZone): { lo: number; hi: number } {
  return RPE_BY_SZONE[sZone];
}

export interface LoadTotal {
  total: number;
  /** Load left out, and why — never silently dropped. */
  excluded: number;
  excludedNote?: string;
}

/**
 * Sum load, honouring §14's exclusions.
 *
 * **Planned load is deliberately not the caller here.** The planner's load heuristic is
 * duration × zone weight and needs no swim data at all, so excluding planned swim volume would
 * distort the ramp guardrails for no gain. §14's exclusion is about *measured* load totals,
 * where a swim score with no pace data would be fabricated.
 */
export function sumMeasuredLoad(
  entries: readonly { sport: PlanSport; load: number }[],
  caps: AthleteCapabilities,
): LoadTotal {
  const plan = degradationPlan(caps);
  let total = 0;
  let excluded = 0;
  for (const e of entries) {
    if (plan.excludeSwimFromLoadTotals && e.sport === 'swim') excluded += e.load;
    else total += e.load;
  }
  return {
    total,
    excluded,
    ...(excluded > 0 && plan.swimExclusionNote ? { excludedNote: plan.swimExclusionNote } : {}),
  };
}

/**
 * A concrete target for one session, in whatever modalities the athlete's data supports.
 *
 * `hr` is present only when a zone set exists — an athlete with no HR anchors gets RPE alone,
 * which is a real prescription rather than a null.
 */
export interface SessionTarget {
  modality: TargetModality;
  /** Numeric band where one exists; absent for an instruction-only target like stroke count. */
  band?: { lo: number; hi: number };
  unit?: 'bpm' | 'rpe';
}

const ZONES_IN: Record<SZone, readonly string[]> = { S1: ['Z1', 'Z2'], S2: ['Z3', 'Z4'], S3: ['Z5'] };

export function sessionTargets(
  sport: PlanSport,
  sZone: SZone,
  caps: AthleteCapabilities,
  zoneSet?: ZoneSet,
): SessionTarget[] {
  const targets: SessionTarget[] = [];
  for (const modality of targetModalities(sport, caps)) {
    if (modality === 'hr') {
      const bands = zoneSet?.zones.filter((z) => ZONES_IN[sZone].includes(z.id)) ?? [];
      if (bands.length === 0) continue; // no zones ⇒ no HR target; RPE still follows
      targets.push({
        modality: 'hr',
        unit: 'bpm',
        band: {
          lo: Math.round(Math.min(...bands.map((b) => b.lower.bpm))),
          hi: Math.round(Math.max(...bands.map((b) => b.upper.bpm))),
        },
      });
    } else if (modality === 'rpe') {
      targets.push({ modality: 'rpe', unit: 'rpe', band: rpeBand(sZone) });
    } else {
      // power / pace / stroke_count: the modality is prescribable, but the *number* needs an
      // anchor (CP, threshold pace, a stroke-count baseline) that no field test has produced.
      // Naming the modality without a fabricated band is the honest half of the answer.
      targets.push({ modality });
    }
  }
  return targets;
}
