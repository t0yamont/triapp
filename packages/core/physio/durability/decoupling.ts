/**
 * durability/decoupling.ts — aerobic decoupling and its planning response (§11). Durability —
 * resistance to physiological decline during prolonged exercise — is the fourth determinant of
 * endurance performance and the one that decides an Ironman. Decoupling is the primary, passive
 * measure: split a steady session in half and compare the internal:external ratio (HR ÷ power
 * for the bike, HR ÷ GAP speed for the run). Rising ratio = the same output is costing more =
 * fatigue resistance is slipping. Track the trend, not one number (§11.1).
 */

import {
  DECOUPLING_MAX_INTENSITY_CV,
  DECOUPLING_MIN_SESSION_MIN,
  DECOUPLING_TARGET_PCT,
  DURABILITY_RACE_ESCALATION_WEEKS,
} from '../constants.js';

/** The DB `sport` enum, which is a superset of the physio `Sport` (adds brick/strength/other). */
export type IngestSportLike = 'run' | 'bike' | 'swim' | 'brick' | 'strength' | 'other';

export interface HalfStats {
  meanHr: number;
  /** Mean external intensity — power (bike) or grade-adjusted speed (run). */
  meanIntensity: number;
  /** Coefficient of variation of intensity within the half (SD ÷ mean) — the steadiness gate. */
  intensityCv: number;
}

export interface DecouplingInput {
  first: HalfStats;
  second: HalfStats;
  durationMin: number;
  /** A long stop invalidates the split (§11.1). */
  hadLongStop: boolean;
  /** Ambient conditions must be recorded for the reading to be comparable (§11.1). */
  ambientRecorded: boolean;
}

export interface DecouplingResult {
  ratioFirst: number;
  ratioSecond: number;
  /** (ratio₂ − ratio₁) / ratio₁ × 100, to 2 dp. Positive = drift (worse). */
  decouplingPct: number;
  valid: boolean;
  /** Machine-readable reasons the reading is not valid (empty ⇒ valid). */
  invalidReasons: string[];
  /** decouplingPct exceeds the §11 target (5%). */
  exceedsTarget: boolean;
}

/**
 * Compute decoupling for one steady session ≥75 min. Only valid when both halves are steady
 * (intensity CV <10%), there was no long stop, and ambient conditions were recorded (§11.1).
 */
export function computeDecoupling(input: DecouplingInput): DecouplingResult {
  const ratioFirst = input.first.meanHr / input.first.meanIntensity;
  const ratioSecond = input.second.meanHr / input.second.meanIntensity;
  const decouplingPct = Math.round(((ratioSecond - ratioFirst) / ratioFirst) * 10000) / 100;

  const invalidReasons: string[] = [];
  if (input.durationMin < DECOUPLING_MIN_SESSION_MIN) invalidReasons.push('TOO_SHORT');
  if (input.first.intensityCv >= DECOUPLING_MAX_INTENSITY_CV || input.second.intensityCv >= DECOUPLING_MAX_INTENSITY_CV) {
    invalidReasons.push('UNSTEADY_INTENSITY');
  }
  if (input.hadLongStop) invalidReasons.push('LONG_STOP');
  if (!input.ambientRecorded) invalidReasons.push('NO_AMBIENT');

  return {
    ratioFirst,
    ratioSecond,
    decouplingPct,
    valid: invalidReasons.length === 0,
    invalidReasons,
    exceedsTarget: decouplingPct > DECOUPLING_TARGET_PCT,
  };
}

export type DurabilityAction =
  | 'none'
  | 'increase_aerobic_volume'
  | 'progress_racepace_duration'
  | 'escalate_durability_focus';

export interface DurabilityResponse {
  action: DurabilityAction;
  reasonCode: string;
  reasonText: string;
}

export interface DurabilityContext {
  /** Decoupling is trending down toward the target across recent long sessions (§11.2). */
  improvingTrend?: boolean;
  /** Weeks until the A race for a long-course athlete; omit if not long-course/near a race. */
  longCourseWeeksToRace?: number;
}

const NONE: DurabilityResponse = { action: 'none', reasonCode: 'DURABILITY_OK', reasonText: 'Fatigue resistance is on track.' };

/**
 * The §11.2 planning response to a decoupling reading. High decoupling adds aerobic volume, never
 * intensity; near an A race it becomes the primary focus; improving decoupling earns longer
 * race-pace blocks. An invalid reading changes nothing.
 */
export function durabilityResponse(result: DecouplingResult, ctx: DurabilityContext = {}): DurabilityResponse {
  if (!result.valid) return NONE;

  if (result.exceedsTarget) {
    if (ctx.longCourseWeeksToRace !== undefined && ctx.longCourseWeeksToRace < DURABILITY_RACE_ESCALATION_WEEKS) {
      return {
        action: 'escalate_durability_focus',
        reasonCode: 'DURABILITY_PRIMARY_LIMITER',
        reasonText:
          'Your fatigue resistance is fading this close to your race — made it the priority over top-end work, with more long aerobic volume.',
      };
    }
    return {
      action: 'increase_aerobic_volume',
      reasonCode: 'DECOUPLING_HIGH',
      reasonText:
        'Your effort drifted late in the ride — added long aerobic volume (and check fuelling) rather than more intensity.',
    };
  }

  if (ctx.improvingTrend) {
    return {
      action: 'progress_racepace_duration',
      reasonCode: 'DECOUPLING_IMPROVING',
      reasonText: 'Your durability is improving — lengthened the race-pace blocks inside your long sessions.',
    };
  }

  return NONE;
}
