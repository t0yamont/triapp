/**
 * plan/generate.ts — the single "make me a plan" composition (§8). It runs the assembled
 * macrocycle (assemblePlan) and lays every session onto a concrete calendar date, then
 * summarises the block. Pure: dates are computed from the passed-in start date with UTC
 * arithmetic (calendar days, no clock, no zone drift). The output is shaped to persist
 * directly to plan_weeks / workouts.
 */

import { assemblePlan, type PlanInput, type PlanWeekResult } from './assemble.js';
import type { PlanPhase, PlanSport } from './types.js';
import type { SZone } from '../types.js';

export interface GeneratePlanInput extends PlanInput {
  /** ISO calendar date ('YYYY-MM-DD') of the first day of week 1. */
  startDate: string;
  /** 0 = Sun .. 6 = Sat; the day week 1 begins on (default Monday). */
  weekStartDay?: number;
}

export interface ScheduledWorkout {
  weekNumber: number;
  phase: PlanPhase;
  isRecoveryWeek: boolean;
  /** ISO calendar date ('YYYY-MM-DD'). */
  scheduledDate: string;
  dayOfWeek: number;
  sport: PlanSport;
  sZone: SZone;
  durationMin: number;
  load: number;
  isHard: boolean;
}

export interface PlanSummary {
  totalWeeks: number;
  totalWorkouts: number;
  totalPlannedLoad: number;
  totalHours: number;
  peakWeeklyLoad: number;
  recoveryWeeks: number;
  /** Weeks per phase, in the order phases first appear. */
  phases: { phase: PlanPhase; weeks: number }[];
}

export interface GeneratedPlan {
  startDate: string;
  endDate: string;
  weeks: PlanWeekResult[];
  workouts: ScheduledWorkout[];
  summary: PlanSummary;
}

/** Add `days` calendar days to an ISO date, in UTC (deterministic, DST-free). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** Days from the week's start to a given weekday (Mon-first by default). */
const dayOffset = (dayOfWeek: number, weekStartDay: number): number => (dayOfWeek - weekStartDay + 7) % 7;

/**
 * Assemble a plan and schedule every session onto a real date. Workouts are returned in
 * chronological order, ready to persist.
 */
export function generatePlan(input: GeneratePlanInput): GeneratedPlan {
  const weekStartDay = input.weekStartDay ?? 1;
  const weeks = assemblePlan(input);

  const workouts: ScheduledWorkout[] = [];
  for (const w of weeks) {
    for (const s of w.week.sessions) {
      workouts.push({
        weekNumber: w.weekNumber,
        phase: w.phase,
        isRecoveryWeek: w.isRecoveryWeek,
        scheduledDate: addDaysISO(input.startDate, (w.weekNumber - 1) * 7 + dayOffset(s.dayOfWeek, weekStartDay)),
        dayOfWeek: s.dayOfWeek,
        sport: s.sport,
        sZone: s.sZone,
        durationMin: s.durationMin,
        load: s.load,
        isHard: s.isHard,
      });
    }
  }
  // ISO dates sort lexicographically = chronologically; every workout has a unique date.
  workouts.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const byPhase = new Map<PlanPhase, number>();
  for (const w of weeks) byPhase.set(w.phase, (byPhase.get(w.phase) ?? 0) + 1);

  const summary: PlanSummary = {
    totalWeeks: weeks.length,
    totalWorkouts: workouts.length,
    totalPlannedLoad: workouts.reduce((a, s) => a + s.load, 0),
    totalHours: Math.round((workouts.reduce((a, s) => a + s.durationMin, 0) / 60) * 10) / 10,
    peakWeeklyLoad: Math.max(0, ...weeks.map((w) => w.loadTarget)),
    recoveryWeeks: weeks.filter((w) => w.isRecoveryWeek).length,
    phases: [...byPhase].map(([phase, n]) => ({ phase, weeks: n })),
  };

  return {
    startDate: input.startDate,
    endDate: addDaysISO(input.startDate, weeks.length * 7 - 1),
    weeks,
    workouts,
    summary,
  };
}
