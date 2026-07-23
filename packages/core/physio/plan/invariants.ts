/**
 * plan/invariants.ts — the progression guardrails (§5.3). "The single most important safety
 * property of the system." No plan is ever persisted that violates one; if the planner
 * cannot satisfy them it reduces load until it can and logs the reason.
 *
 * The engine does NOT use ACWR (§5.3) — hard guardrails replace it.
 */

import {
  MAX_CONSECUTIVE_HARD_DAYS,
  MAX_WEEKLY_S3_TIME_PCT,
  MAX_WEEKLY_S3_TIME_PCT_BASE,
  MONOTONY_CEILING,
  RAMP_CAP_APPLIED_REASON,
  RAMP_CAP_DEFAULT,
  RAMP_CAP_LOW_CONFIDENCE,
  RAMP_CAP_NOVICE,
  RECOVERY_WEEK_LOAD_RANGE,
} from '../constants.js';
import type { GuardrailWeek, Violation, WeekSession } from './types.js';

// ── G1 — weekly load ramp ────────────────────────────────────────────────────

/** The applicable G1 ramp cap: novice (<1 yr) is most restrictive, then low confidence. */
export function rampCap(confidence: number, trainingAgeYears: number): number {
  if (trainingAgeYears < 1) return RAMP_CAP_NOVICE; // 0.04
  if (confidence < 0.5) return RAMP_CAP_LOW_CONFIDENCE; // 0.05
  return RAMP_CAP_DEFAULT; // 0.08
}

export interface RampResult {
  load: number;
  capped: boolean;
  capPct: number;
  reasonCode?: string;
}

/**
 * Clamp a requested weekly load to the G1 cap over the 3-week rolling mean. When it bites,
 * returns the machine-readable reason code the caller writes to plan_mutations (F8, P1).
 */
export function applyRampCap(
  requestedLoad: number,
  rolling3wkMean: number,
  confidence: number,
  trainingAgeYears: number,
): RampResult {
  const capPct = rampCap(confidence, trainingAgeYears);
  const maxLoad = rolling3wkMean * (1 + capPct);
  if (requestedLoad > maxLoad) {
    return { load: maxLoad, capped: true, capPct, reasonCode: RAMP_CAP_APPLIED_REASON };
  }
  return { load: requestedLoad, capped: false, capPct };
}

// ── Week measures ────────────────────────────────────────────────────────────

/** Load summed per weekday (index 0 = Sun .. 6 = Sat). */
export function dailyLoads(sessions: WeekSession[]): number[] {
  const days = new Array<number>(7).fill(0);
  // dayOfWeek is 0..6 by contract, so the slot is always initialised.
  for (const s of sessions) days[s.dayOfWeek] = (days[s.dayOfWeek] as number) + s.load;
  return days;
}

export function weekLoad(sessions: WeekSession[]): number {
  return sessions.reduce((a, s) => a + s.load, 0);
}

export function weeklyHours(sessions: WeekSession[]): number {
  return sessions.reduce((a, s) => a + s.durationMin, 0) / 60;
}

/** Fraction of weekly duration spent in S3 (§5.3 G6). */
export function s3TimeFraction(sessions: WeekSession[]): number {
  const total = sessions.reduce((a, s) => a + s.durationMin, 0);
  if (total === 0) return 0;
  const s3 = sessions.filter((s) => s.sZone === 'S3').reduce((a, s) => a + s.durationMin, 0);
  return s3 / total;
}

/**
 * Longest run of consecutive hard days, counted in training-week order (default Monday
 * start), so Saturday→Sunday counts as consecutive. A brick is one hard day (G5).
 */
export function consecutiveHardDays(sessions: WeekSession[], weekStartDay = 1): number {
  const hard = new Array<boolean>(7).fill(false);
  for (const s of sessions) if (s.isHard) hard[s.dayOfWeek] = true;
  let max = 0;
  let run = 0;
  for (let i = 0; i < 7; i++) {
    const d = (weekStartDay + i) % 7;
    if (hard[d]) {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

/** Foster monotony: mean daily load ÷ SD of daily load (§5.3 G7). Flat weeks score high. */
export function monotony(daily: number[]): number {
  const n = daily.length;
  const mean = daily.reduce((a, b) => a + b, 0) / n;
  const variance = daily.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return sd === 0 ? Infinity : mean / sd;
}

// ── Week validation (G4, G5, G6, G7, G10) ────────────────────────────────────

/** Return every guardrail a week violates. Empty ⇒ the week is safe to persist. */
export function validateWeek(week: GuardrailWeek, weekStartDay = 1): Violation[] {
  const violations: Violation[] = [];

  const consecutive = consecutiveHardDays(week.sessions, weekStartDay);
  if (consecutive > MAX_CONSECUTIVE_HARD_DAYS) {
    violations.push({
      code: 'G5_CONSECUTIVE_HARD_DAYS',
      message: `${consecutive} consecutive hard days exceeds the limit of ${MAX_CONSECUTIVE_HARD_DAYS}`,
    });
  }

  const s3cap = week.phase === 'base' ? MAX_WEEKLY_S3_TIME_PCT_BASE : MAX_WEEKLY_S3_TIME_PCT;
  const s3frac = s3TimeFraction(week.sessions);
  if (s3frac > s3cap) {
    violations.push({
      code: 'G6_S3_VOLUME',
      message: `S3 time ${(s3frac * 100).toFixed(1)}% exceeds ${(s3cap * 100).toFixed(0)}% cap`,
    });
  }

  const hours = weeklyHours(week.sessions);
  if (hours > week.hoursCeiling) {
    violations.push({
      code: 'G10_HOURS_CEILING',
      message: `${hours.toFixed(1)} h exceeds the declared ceiling of ${week.hoursCeiling} h`,
    });
  }

  if (week.isRecoveryWeek && week.priorWeekLoad !== undefined && week.priorWeekLoad > 0) {
    const frac = weekLoad(week.sessions) / week.priorWeekLoad;
    if (frac < RECOVERY_WEEK_LOAD_RANGE[0] || frac > RECOVERY_WEEK_LOAD_RANGE[1]) {
      violations.push({
        code: 'G4_RECOVERY_LOAD',
        message: `recovery-week load ${(frac * 100).toFixed(0)}% outside 55–70% of the prior week`,
      });
    }
  }

  const mono = monotony(dailyLoads(week.sessions));
  if (mono > MONOTONY_CEILING) {
    violations.push({
      code: 'G7_MONOTONY',
      message: `weekly monotony ${mono.toFixed(2)} exceeds the ceiling of ${MONOTONY_CEILING}`,
    });
  }

  return violations;
}

export function isValidWeek(week: GuardrailWeek, weekStartDay = 1): boolean {
  return validateWeek(week, weekStartDay).length === 0;
}
