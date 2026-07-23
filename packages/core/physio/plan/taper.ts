/**
 * plan/taper.ts — taper generation (§8.3), rewritten to match the evidence: reduce volume
 * (largest pooled effects in the 8–14 day band), maintain intensity, maintain frequency.
 * Bosquet et al. 2007; Wang et al. 2023.
 */

import { TAPER_TABLE } from '../constants.js';
import type { EventType, TaperWeek } from './types.js';

// The final-week volume band both F7 and I8 require, as a fraction of pre-taper volume.
const FINAL_VOLUME_MIN = 0.4;
const FINAL_VOLUME_MAX = 0.6;

export interface TaperInput {
  eventType: EventType;
  /** The load of the week immediately before the taper begins. */
  preTaperLoad: number;
  /** Pre-taper session count; frequency is held within 1 of this (§8.3, I9). */
  preTaperSessionCount: number;
}

export interface TaperPlan {
  taperDays: number;
  weeks: TaperWeek[];
}

/**
 * Generate the taper weeks for an A race. Volume decays geometrically to the event's
 * final-week target; intensity (≥1 S3 + race-pace per week) and frequency are retained; the
 * final 48 h carry one short activation session.
 */
export function generateTaper(input: TaperInput): TaperPlan {
  const { eventType, preTaperLoad, preTaperSessionCount } = input;
  const { days, reduction } = TAPER_TABLE[eventType];
  const numWeeks = Math.ceil(days / 7);

  // Final-week volume as a fraction of pre-taper, clamped into the required band (§8.3).
  const finalFrac = Math.min(FINAL_VOLUME_MAX, Math.max(FINAL_VOLUME_MIN, 1 - reduction));
  // Geometric (≈exponential) decay that lands the final week exactly on finalFrac.
  const decay = finalFrac ** (1 / numWeeks);

  const weeks: TaperWeek[] = [];
  for (let i = 1; i <= numWeeks; i++) {
    weeks.push({
      weekNumber: i,
      load: Math.round(preTaperLoad * decay ** i),
      sessionCount: preTaperSessionCount,
      hasS3Session: true,
      hasRacePaceSession: true,
      isRaceWeek: i === numWeeks,
      hasActivationSession: i === numWeeks,
    });
  }
  return { taperDays: days, weeks };
}
