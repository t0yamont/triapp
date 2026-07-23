/**
 * sessions/library.ts — parameterised session structures (§7.1–7.2). The interval evidence
 * genuinely diverges by sport, so the engine must NOT apply one rule to both: cycling VO2max
 * uses short 30/15s intervals, running uses long 3–4 min intervals (F13).
 */

import { BIKE_VO2_SHORT, RUN_VO2_LONG } from '../constants.js';
import type { PlanSport, SessionPurpose } from '../plan/types.js';
import type { SZone } from '../types.js';

export type StepIntent = 'warmup' | 'work' | 'recovery' | 'steady' | 'cooldown';

export interface Step {
  kind: 'step';
  intent: StepIntent;
  durationSec: number;
  targetZone: SZone;
}
export interface Repeat {
  kind: 'repeat';
  count: number;
  steps: WorkoutElement[];
}
export type WorkoutElement = Step | Repeat;

export interface WorkoutStructure {
  sport: PlanSport;
  purpose: SessionPurpose;
  goalZone: SZone;
  steps: WorkoutElement[];
}

const step = (intent: StepIntent, durationSec: number, targetZone: SZone): Step => ({
  kind: 'step',
  intent,
  durationSec,
  targetZone,
});
const repeat = (count: number, steps: WorkoutElement[]): Repeat => ({ kind: 'repeat', count, steps });

const WARMUP = step('warmup', 900, 'S1');
const COOLDOWN = step('cooldown', 600, 'S1');

/**
 * Sport-specific VO2max session (§7.2). Bike: 3×13×(30/15). Run: 4–6×3–4 min. Swim: 10×100.
 * The sports deliberately do not share an interval template (F13).
 */
export function renderVo2max(sport: PlanSport): WorkoutStructure {
  const base = { sport, purpose: 'vo2max' as SessionPurpose, goalZone: 'S3' as SZone };
  switch (sport) {
    case 'bike': {
      const { work, rest, reps, sets, setRest } = BIKE_VO2_SHORT;
      return {
        ...base,
        steps: [
          WARMUP,
          repeat(sets, [
            repeat(reps, [step('work', work, 'S3'), step('recovery', rest, 'S1')]),
            step('recovery', setRest, 'S1'),
          ]),
          COOLDOWN,
        ],
      };
    }
    case 'run': {
      const reps = RUN_VO2_LONG.reps[0] + 1; // 4–6 → 5
      const workSec = Math.round(((RUN_VO2_LONG.workMin + RUN_VO2_LONG.workMax) / 2) * 60); // 3–4 min → 3.5
      return {
        ...base,
        steps: [
          WARMUP,
          repeat(reps, [
            step('work', workSec, 'S3'),
            step('recovery', Math.round(workSec * RUN_VO2_LONG.recoveryRatio), 'S1'),
          ]),
          COOLDOWN,
        ],
      };
    }
    default: {
      // swim (and fallback): 10 × 100 m at CSS pace, short rest (§7.2).
      return {
        ...base,
        steps: [WARMUP, repeat(10, [step('work', 90, 'S3'), step('recovery', 20, 'S1')]), COOLDOWN],
      };
    }
  }
}
