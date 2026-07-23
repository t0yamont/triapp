/**
 * plan/assemble.ts — stitch the macrocycle, weekly load progression, and microcycle
 * construction into a full plan (§8). Loading weeks ramp under G1 (against the 3-week
 * rolling mean); recovery weeks drop to ~62%; taper weeks come from generateTaper. Every
 * week is a guardrail-valid microcycle. The Phase-5 gate: a 24-week plan satisfying every
 * invariant, with a complete phase layout and no gaps.
 */

import { applyRampCap } from './invariants.js';
import { layoutMacrocycle } from './macro.js';
import { constructMicrocycle, type Availability } from './micro.js';
import { generateTaper } from './taper.js';
import type { CourseType, EventType, GuardrailWeek, PlanPhase } from './types.js';

export interface PlanInput {
  totalWeeks: number;
  eventType: EventType;
  course: CourseType;
  availability: Availability;
  /** 3-week rolling mean load at the plan's start. */
  startingLoad: number;
  /** Combined anchor confidence — sets the ramp cap (§2.4, G1). */
  confidence: number;
  trainingAgeYears: number;
  shortLoadingCycle?: boolean;
}

export interface PlanWeekResult {
  weekNumber: number;
  phase: PlanPhase;
  isRecoveryWeek: boolean;
  loadTarget: number;
  week: GuardrailWeek;
}

const RECOVERY_FRACTION = 0.62; // mid of the 55–70% band (G4)

const mean = (xs: number[], seed: number): number =>
  xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : seed;

export function assemblePlan(input: PlanInput): PlanWeekResult[] {
  const { totalWeeks, eventType, course, availability, startingLoad, confidence, trainingAgeYears } = input;
  const macro = layoutMacrocycle({ totalWeeks, eventType, course, shortLoadingCycle: input.shortLoadingCycle });
  const taperCount = macro.filter((w) => w.phase === 'taper' || w.phase === 'race_week').length;
  const loadingCount = macro.length - taperCount;
  const sessionDayCount = Object.values(availability.dayMinutes).filter((m) => m > 0).length;

  const results: PlanWeekResult[] = [];
  const actual: number[] = [];

  const build = (index: number, loadTarget: number, priorWeekLoad?: number): void => {
    const mw = macro[index]!;
    const week = constructMicrocycle({
      phase: mw.phase,
      isRecoveryWeek: mw.isRecoveryWeek,
      loadTarget,
      availability,
      ...(priorWeekLoad !== undefined ? { priorWeekLoad } : {}),
    });
    actual.push(week.sessions.reduce((a, s) => a + s.load, 0));
    results.push({ weekNumber: mw.weekNumber, phase: mw.phase, isRecoveryWeek: mw.isRecoveryWeek, loadTarget, week });
  };

  // Loading block: ramp under G1 against the rolling 3-week mean; recovery weeks drop.
  for (let i = 0; i < loadingCount; i++) {
    if (macro[i]!.isRecoveryWeek) {
      const prior = actual[i - 1]!; // a recovery week is never the first week
      build(i, Math.round(RECOVERY_FRACTION * prior), prior);
    } else {
      const rolling = mean(actual.slice(-3), startingLoad);
      build(i, Math.round(applyRampCap(rolling * 1.1, rolling, confidence, trainingAgeYears).load));
    }
  }

  // Taper: decays from the last loading week's actual load (§8.3).
  const preTaper = actual[loadingCount - 1] ?? startingLoad;
  const taper = generateTaper({ eventType, preTaperLoad: preTaper, preTaperSessionCount: sessionDayCount });
  for (let t = 0; t < taperCount; t++) {
    build(loadingCount + t, taper.weeks[t]!.load); // taperCount ≤ generateTaper week count
  }

  return results;
}
