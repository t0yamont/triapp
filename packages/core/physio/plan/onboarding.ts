/**
 * plan/onboarding.ts — turning what an athlete can actually tell you into what the planner needs
 * (docs/algorithm-review-2026-07.md §2.1–2.2).
 *
 * The planner wants `totalWeeks` and a `startingLoad` (a 3-week rolling mean of a TRIMP-style
 * abstraction). No athlete can answer either. They *can* tell you their race date, roughly how
 * much they train now, and how long they can currently keep going in each sport — so this module
 * derives the planner's inputs from those, and says plainly when the answer is "not enough time"
 * or "not enough base".
 */

import {
  EVENT_ENTRY_REQUIREMENTS,
  PLAN_WEEKS_BY_EVENT,
  TRIMP_ZONE_WEIGHTS,
} from '../constants.js';
import { daysBetweenISO } from './generate.js';
import type { EventType, PlanSport } from './types.js';

export interface BaselineAbility {
  /** Longest run the athlete can currently do in one go, minutes. */
  longestRunMin?: number;
  /** Longest ride in one go, minutes. */
  longestRideMin?: number;
  /** Longest continuous swim, metres — distance is the natural unit in the pool. */
  longestSwimM?: number;
  /** Sessions per week they are actually doing now (not aspiring to). */
  sessionsPerWeek: number;
  /** Typical weekly training hours now. */
  typicalWeeklyHours: number;
}

/**
 * The weekly load the athlete is currently carrying, as the planner's ramp base.
 *
 * Deliberately conservative: it values current training at the S1 (easy) zone weight rather than
 * guessing an intensity mix we have no evidence for. Under-estimating the base means the first
 * weeks ramp from a lower number, which is the safe direction to be wrong in — G1 caps growth
 * from this figure, so an inflated base would licence a jump the athlete hasn't earned.
 */
export function baselineWeeklyLoad(b: BaselineAbility): number {
  return Math.round(Math.max(0, b.typicalWeeklyHours) * 60 * TRIMP_ZONE_WEIGHTS.S1);
}

/**
 * The longest session the athlete has actually completed, per sport — the seed G2 needs in week 1.
 *
 * Swim is deliberately absent: the athlete gives us a distance, and converting it to minutes
 * needs a pace we don't have until CSS is measured. Guessing one would put a fabricated number
 * into a guardrail.
 */
export function baselineLongestBySport(b: BaselineAbility): Partial<Record<PlanSport, number>> {
  return {
    ...(b.longestRunMin !== undefined ? { run: b.longestRunMin } : {}),
    ...(b.longestRideMin !== undefined ? { bike: b.longestRideMin } : {}),
  };
}

// ── Plan window ──────────────────────────────────────────────────────────────

export type WindowAdequacy = 'recommended' | 'compressed' | 'too_short';

export interface PlanWindow {
  /** Whole weeks from plan start to race day. */
  totalWeeks: number;
  adequacy: WindowAdequacy;
  recommendedWeeks: number;
  minimumWeeks: number;
  reasonText: string;
}

/** Whole weeks between the plan's first day and race day (0 if the race is in the past). */
export function weeksToRace(planStartDate: string, raceDate: string): number {
  return Math.max(0, Math.floor(daysBetweenISO(planStartDate, raceDate) / 7));
}

/**
 * How well the available window fits the event. A compressed plan is allowed — athletes enter
 * races late — but the engine says what it is costing rather than quietly thinning the plan.
 */
export function assessPlanWindow(eventType: EventType, totalWeeks: number): PlanWindow {
  const { recommended, minimum } = PLAN_WEEKS_BY_EVENT[eventType];
  const base = { totalWeeks, recommendedWeeks: recommended, minimumWeeks: minimum };

  if (totalWeeks >= recommended) {
    return { ...base, adequacy: 'recommended', reasonText: `${totalWeeks} weeks is a full run-up to this race.` };
  }
  if (totalWeeks >= minimum) {
    return {
      ...base,
      adequacy: 'compressed',
      reasonText: `${totalWeeks} weeks is workable but tight — a full build for this race is usually ${recommended}. Expect a shorter base phase and less room to absorb a bad week.`,
    };
  }
  return {
    ...base,
    adequacy: 'too_short',
    reasonText: `${totalWeeks} weeks is not enough to prepare safely for this race — it needs at least ${minimum}. Consider a later date, or a shorter event on this one.`,
  };
}

// ── Readiness to start ───────────────────────────────────────────────────────

export interface StartReadiness {
  /** True when the athlete already meets the event's entry requirements. */
  ready: boolean;
  /** Sports where current ability is below the entry requirement. */
  shortfalls: { sport: PlanSport; current: number; required: number; unit: 'min' | 'm' }[];
  reasonText: string;
}

/**
 * Whether the athlete can currently complete the event's constituent legs. Below these, the plan
 * should open by building continuous duration rather than assuming a base that isn't there —
 * the same failure G1/G2 exist to prevent, one level up.
 *
 * An unanswered baseline is not treated as a shortfall: we don't know, and inventing a deficit
 * would be as wrong as inventing a capability.
 */
export function assessStartReadiness(eventType: EventType, b: BaselineAbility): StartReadiness {
  const req = EVENT_ENTRY_REQUIREMENTS[eventType];
  const shortfalls: StartReadiness['shortfalls'] = [];

  if (req.runMin !== undefined && b.longestRunMin !== undefined && b.longestRunMin < req.runMin) {
    shortfalls.push({ sport: 'run', current: b.longestRunMin, required: req.runMin, unit: 'min' });
  }
  if (req.rideMin !== undefined && b.longestRideMin !== undefined && b.longestRideMin < req.rideMin) {
    shortfalls.push({ sport: 'bike', current: b.longestRideMin, required: req.rideMin, unit: 'min' });
  }
  if (req.swimM !== undefined && b.longestSwimM !== undefined && b.longestSwimM < req.swimM) {
    shortfalls.push({ sport: 'swim', current: b.longestSwimM, required: req.swimM, unit: 'm' });
  }

  if (shortfalls.length === 0) {
    return { ready: true, shortfalls, reasonText: 'You can already cover every leg of this event — the plan builds from here.' };
  }

  const parts = shortfalls.map((s) => `${s.sport} (${s.current}${s.unit} now, ${s.required}${s.unit} to start)`);
  return {
    ready: false,
    shortfalls,
    reasonText: `Your first block builds continuous duration in ${parts.join(' and ')} before the real training starts. That is the plan working, not you being behind.`,
  };
}
