/**
 * sessions/heat.ts — heat adaptation blocks (§7.4).
 *
 * Protocols in the literature average 8 ± 4 exposures of 90 ± 36 min at 39.1 ± 4.8 °C, pooling
 * to −17 bpm end-exercise HR, −0.43 °C core temperature, +5.6% plasma volume and **+3.1%
 * time-trial performance** (McDonald et al. 2025, Comp Physiol 15(3):1–49). Passive
 * post-session exposure (sauna/hot bath) is preferred because it does not compromise prescribed
 * training intensity, though exercise-based acclimation remains preferred on specificity
 * grounds (Périard et al. 2015).
 *
 * **r2 added decay.** r1 scheduled a block and then forgot about it. Adaptation is lost at
 * ≈2.5%/day without exposure, and re-induction is 8–12× faster than decay (Daanen et al. 2018)
 * — so a block that finished three weeks out has largely evaporated, and the fix is a cheap
 * top-up rather than a longer block. An engine that silently assumes otherwise produces
 * over-confident race-day pacing guidance.
 *
 * The engine reduces intensity targets during *active* heat sessions and must never score the
 * athlete as under-performing for failing to hit normal power in the heat (§7.4).
 */

import {
  HEAT_BLOCK_END_DAYS_BEFORE_RACE,
  HEAT_DECAY_PCT_PER_DAY,
  HEAT_LONG_REGIMEN_EXPOSURES,
  HEAT_REINDUCTION_SPEED_MULTIPLIER,
  HEAT_RETENTION_TOPUP_THRESHOLD,
  HEAT_TRIGGER_MARGIN_C,
  HEAT_EXPOSURES_RANGE,
  HEAT_EXPOSURE_MIN_MINUTES,
  HEAT_PASSIVE_MINUTES,
} from '../constants.js';

/**
 * The fraction of heat adaptation still retained after `daysSinceLastExposure` without
 * exposure, floored at 0 (§7.4).
 *
 * ≈2.5%/day: end-exercise HR adaptation decays at ≈2.3%/day and core temperature at ≈2.6%/day
 * (Daanen et al. 2018, Sports Med 48:409–430). Linear because that is how the source reports
 * it over the studied range — do not extrapolate an exponential the evidence does not support.
 */
export function heatAdaptationRetained(daysSinceLastExposure: number): number {
  return Math.max(0, 1 - HEAT_DECAY_PCT_PER_DAY * daysSinceLastExposure);
}

export interface HeatTopUp {
  /** True when projected race-day retention has fallen below the top-up threshold. */
  needed: boolean;
  /** Retention projected for race day, 0–1. */
  projectedRetention: number;
  /**
   * Exposures needed to restore the loss. Re-induction is 8–12× faster than decay, so this is
   * small by construction — the whole point of modelling decay is that the fix is cheap.
   */
  exposures: number;
  reasonText: string;
}

/**
 * Project retention forward to race day and decide whether a top-up is needed (§7.4).
 *
 * `daysFromBlockEndToRace` is the gap the block leaves. A gap beyond the §7.4 5–10 day band
 * means the block is **mis-placed** — the answer is to move it later, not to lengthen it,
 * which `planHeatBlock` already does by anchoring to the near end of the band.
 */
export function planHeatTopUp(daysFromBlockEndToRace: number): HeatTopUp {
  const projectedRetention = heatAdaptationRetained(daysFromBlockEndToRace);
  if (projectedRetention >= HEAT_RETENTION_TOPUP_THRESHOLD) {
    return {
      needed: false,
      projectedRetention,
      exposures: 0,
      reasonText: `Your heat adaptation should still be about ${Math.round(projectedRetention * 100)}% on race day — no top-up needed.`,
    };
  }
  // Re-induction runs ~10× faster than decay, so one exposure recovers ~10 days of loss.
  const lostDays = daysFromBlockEndToRace - (1 - HEAT_RETENTION_TOPUP_THRESHOLD) / HEAT_DECAY_PCT_PER_DAY;
  const exposures = Math.max(1, Math.ceil(lostDays / HEAT_REINDUCTION_SPEED_MULTIPLIER));
  return {
    needed: true,
    projectedRetention,
    exposures,
    reasonText: `Your heat block finishes ${daysFromBlockEndToRace} days before the race, so only about ${Math.round(projectedRetention * 100)}% of the adaptation would remain. Added ${exposures} short top-up exposure${exposures === 1 ? '' : 's'} — regaining it is far quicker than building it.`,
  };
}

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
  /**
   * Opt in to a >15-exposure regimen where there is time for it (§7.4). Off by default: it is
   * a real commitment, and the marginal gain per extra exposure is small (+1.9 g haemoglobin
   * mass, +9 mL·h⁻¹ sweat rate) even though it is positive.
   */
  preferLongRegimen?: boolean;
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
  /**
   * Projected retention on race day and any top-up needed (r2, §7.4). Shown to the athlete —
   * a block that finished weeks out has largely evaporated and they should know that.
   */
  topUp: HeatTopUp;
  /**
   * True when a >15-exposure regimen was chosen: longer regimens produce more robust sudomotor
   * adaptation than medium-term (8–14) ones (McDonald et al. 2025).
   */
  longRegimen: boolean;
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
  topUp: { needed: false, projectedRetention: 0, exposures: 0, reasonText: 'No heat block scheduled.' },
  longRegimen: false,
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

  // Prefer the longer regimen when the athlete has both the days and the appetite for it:
  // >15 exposures produces more robust sudomotor adaptation than 8–14 (McDonald et al. 2025).
  const wantsLong = input.preferLongRegimen === true && availableDays >= HEAT_LONG_REGIMEN_EXPOSURES;
  const ceiling = wantsLong ? HEAT_LONG_REGIMEN_EXPOSURES + 1 : maxExposures;
  const exposures = Math.min(ceiling, availableDays);
  const longRegimen = exposures > HEAT_LONG_REGIMEN_EXPOSURES;
  const mode = input.passiveAvailable === false ? 'active' : 'passive';
  const topUp = planHeatTopUp(endDaysBeforeRace);

  return {
    prescribed: true,
    reasonCode: 'HEAT_BLOCK_SCHEDULED',
    topUp,
    longRegimen,
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
