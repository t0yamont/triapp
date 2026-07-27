/**
 * sessions/heat.ts — heat adaptation blocks (§7.4).
 *
 * Protocols in the literature average ~8 exposures of ~90 min, with ≥14-day protocols
 * producing larger effects (Bayesian meta-regression across 211 papers; Tyler et al. 2016;
 * Benjamin et al. 2019). Passive post-session exposure (sauna/hot bath) is preferred because it
 * does not compromise prescribed training intensity.
 *
 * The engine reduces intensity targets during *active* heat sessions and must never score the
 * athlete as under-performing for failing to hit normal power in the heat (§7.4).
 */

import {
  HEAT_BLOCK_END_DAYS_BEFORE_RACE,
  HEAT_TRIGGER_MARGIN_C,
  HEAT_EXPOSURES_RANGE,
  HEAT_EXPOSURE_MIN_MINUTES,
  HEAT_PASSIVE_MINUTES,
} from '../constants.js';

export interface HeatBlockInput {
  daysToRace: number;
  /** Expected wet-bulb temperature at the race, °C. */
  raceWbgtC: number;
  /** The athlete's training-environment norm, °C. */
  athleteNormWbgtC: number;
  /**
   * How far the race must exceed the athlete's norm before a block is prescribed, °C.
   * Defaults to the product policy in `HEAT_TRIGGER_MARGIN_C` (§7.4 never defines the margin
   * — see DECISIONS.md `D-HEAT-MARGIN`); override per athlete when there's reason to.
   */
  triggerMarginC?: number;
  /** False when the athlete has no sauna/hot-bath access — the block becomes active sessions. */
  passiveAvailable?: boolean;
}

export interface HeatBlock {
  prescribed: boolean;
  reasonCode: string;
  reasonText: string;
  exposures: number;
  minutesPerExposure: number;
  /** Passive post-session exposure keeps prescribed intensity intact — the default when available. */
  mode: 'passive' | 'active';
  /** Days before the race the block starts / finishes (finishing inside the §7.4 5–10 day band). */
  startDaysBeforeRace: number;
  endDaysBeforeRace: number;
  /** Active heat sessions run at reduced intensity targets and are not scored as under-performance. */
  reduceIntensityTargets: boolean;
}

const NOT_PRESCRIBED = (reasonCode: string, reasonText: string): HeatBlock => ({
  prescribed: false,
  reasonCode,
  reasonText,
  exposures: 0,
  minutesPerExposure: 0,
  mode: 'passive',
  startDaysBeforeRace: 0,
  endDaysBeforeRace: 0,
  reduceIntensityTargets: false,
});

/**
 * Plan a heat block of 8–14 exposures finishing 5–10 days before the race (§7.4), or explain
 * why none is prescribed.
 */
export function planHeatBlock(input: HeatBlockInput): HeatBlock {
  const excess = input.raceWbgtC - input.athleteNormWbgtC;
  if (excess < (input.triggerMarginC ?? HEAT_TRIGGER_MARGIN_C)) {
    return NOT_PRESCRIBED(
      'HEAT_NOT_NEEDED',
      'Race conditions are close enough to what you already train in — no heat block needed.',
    );
  }

  const [minExposures, maxExposures] = HEAT_EXPOSURES_RANGE;
  // Finish at the near end of the §7.4 5–10 day band: heat adaptation decays once exposure
  // stops, so ending closer to the race retains more of it while staying clear of race week.
  const endDaysBeforeRace = HEAT_BLOCK_END_DAYS_BEFORE_RACE[0];
  const availableDays = input.daysToRace - endDaysBeforeRace;

  if (availableDays < minExposures) {
    return NOT_PRESCRIBED(
      'HEAT_TOO_LATE',
      `Not enough time before the race for a full heat block — it needs at least ${minExposures} exposures finishing ${endDaysBeforeRace} days out.`,
    );
  }

  const exposures = Math.min(maxExposures, availableDays);
  const mode = input.passiveAvailable === false ? 'active' : 'passive';

  return {
    prescribed: true,
    reasonCode: 'HEAT_BLOCK_SCHEDULED',
    reasonText:
      mode === 'passive'
        ? `Your race is ${excess.toFixed(1)}°C hotter than you train in — added ${exposures} post-session sauna or hot-bath exposures, finishing ${endDaysBeforeRace} days out. Your training intensity is unchanged.`
        : `Your race is ${excess.toFixed(1)}°C hotter than you train in — added ${exposures} heat sessions, finishing ${endDaysBeforeRace} days out. Targets are eased on those days: don't chase normal numbers in the heat.`,
    exposures,
    // Passive exposure is short (20–30 min sauna/hot bath); an active heat session runs long.
    minutesPerExposure: mode === 'passive' ? HEAT_PASSIVE_MINUTES : HEAT_EXPOSURE_MIN_MINUTES,
    mode,
    startDaysBeforeRace: endDaysBeforeRace + exposures,
    endDaysBeforeRace,
    reduceIntensityTargets: mode === 'active',
  };
}
