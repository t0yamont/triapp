/**
 * plan/macro.ts — macrocycle layout from the race calendar (§8.1). Backwards from the A
 * race: reserve the taper, a 2–3 week peak, split the rest Base/Build, and drop recovery
 * weeks into the loading blocks per G3. Under 12 weeks: a consolidation block + taper, no
 * distinct Base/Peak. Pure; produces contiguous weeks with no gaps or overlaps.
 */

import { TAPER_TABLE } from '../constants.js';
import type { CourseType, EventType, PlanPhase } from './types.js';

export interface MacroInput {
  /** Weeks from the plan start to (and including) the A-race week. */
  totalWeeks: number;
  eventType: EventType;
  course: CourseType;
  /** G3: 2:1 loading instead of 3:1 (age > 45, or a history of under-completion). */
  shortLoadingCycle?: boolean;
}

export interface MacroWeek {
  weekNumber: number;
  phase: PlanPhase;
  isRecoveryWeek: boolean;
}

const BASE_FRACTION = 0.55; // within the §8.1 Base 50–60% band

export function layoutMacrocycle(input: MacroInput): MacroWeek[] {
  const { totalWeeks, eventType, course } = input;
  const taperWeeks = Math.ceil(TAPER_TABLE[eventType].days / 7);
  const loadWeeks = totalWeeks - taperWeeks;

  const phases: PlanPhase[] = [];
  if (loadWeeks <= 0) {
    // No room for a loading block — the whole window is taper (degenerate but gap-free).
    for (let i = 0; i < totalWeeks; i++) phases.push('taper');
  } else {
    if (totalWeeks < 12) {
      // Time-constrained (§8.1): consolidation only, no distinct Base/Peak.
      for (let i = 0; i < loadWeeks; i++) phases.push('build');
    } else {
      const peakWeeks = course === 'long' ? 3 : 2;
      const remaining = loadWeeks - peakWeeks;
      const baseWeeks = Math.round(remaining * BASE_FRACTION);
      for (let i = 0; i < baseWeeks; i++) phases.push('base');
      for (let i = 0; i < remaining - baseWeeks; i++) phases.push('build');
      for (let i = 0; i < peakWeeks; i++) phases.push('peak');
    }
    for (let i = 0; i < taperWeeks; i++) phases.push('taper');
  }

  // Recovery weeks (G3), only inside the Base/Build loading blocks.
  const cycle = (input.shortLoadingCycle ? 2 : 3) + 1; // 3:1 → every 4th week
  let run = 0;
  return phases.map((phase, i) => {
    let recovery = false;
    if (phase === 'base' || phase === 'build') {
      run += 1;
      if (run % cycle === 0) recovery = true;
    } else {
      run = 0;
    }
    return {
      weekNumber: i + 1,
      phase: i === phases.length - 1 ? 'race_week' : recovery ? 'recovery' : phase,
      isRecoveryWeek: recovery,
    };
  });
}
