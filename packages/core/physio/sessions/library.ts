/**
 * sessions/library.ts — parameterised session structures (§7.1–7.2). The interval evidence
 * genuinely diverges by sport, so the engine must NOT apply one rule to both: cycling VO2max
 * uses short 30/15s intervals, running uses long 3–4 min intervals (F13).
 */

import { BIKE_VO2_SHORT, RUN_VO2_LONG } from '../constants.js';
import type { PlanSport, SessionPurpose } from '../plan/types.js';
import type { SZone } from '../types.js';

/**
 * `drill` is its own intent rather than a flavour of `work`: a swim drill is technique at easy
 * intensity, so scoring it as work would inflate the session's load, and calling it recovery
 * would hide that the athlete is doing something deliberate.
 */
export type StepIntent = 'warmup' | 'work' | 'recovery' | 'steady' | 'cooldown' | 'drill';

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

const SEC_PER_MIN = 60;

/**
 * Canonical warm-up/cool-down, shrunk to fit a short session.
 *
 * 15 minutes of warm-up inside a 30-minute session leaves no session. They are capped at a
 * share of the whole so a short slot still gets a proportionate opening and closing rather
 * than an absurd one.
 */
const PREAMBLE_MAX_FRACTION = 0.45;

function bookends(totalSec: number): { warmup: Step; cooldown: Step; workSec: number } {
  const canonical = WARMUP.durationSec + COOLDOWN.durationSec;
  const budget = Math.min(canonical, Math.floor(totalSec * PREAMBLE_MAX_FRACTION));
  const warmupSec = Math.round((budget * WARMUP.durationSec) / canonical);
  return {
    warmup: step('warmup', warmupSec, 'S1'),
    cooldown: step('cooldown', budget - warmupSec, 'S1'),
    workSec: totalSec - budget,
  };
}

/** Total seconds a structure prescribes — `repeat` counts its children `count` times. */
export function structureDurationSec(steps: readonly WorkoutElement[]): number {
  return steps.reduce(
    (total, el) => total + (el.kind === 'step' ? el.durationSec : el.count * structureDurationSec(el.steps)),
    0,
  );
}

export interface SessionSpec {
  sport: PlanSport;
  purpose: SessionPurpose;
  goalZone: SZone;
  /** The slot the planner allocated. The rendered structure must fill exactly this. */
  durationMin: number;
}

/** Stable identifier for the template a workout was rendered from (`workouts.template_id`). */
export function sessionTemplateId(spec: Pick<SessionSpec, 'sport' | 'purpose'>): string {
  return `${spec.sport}-${spec.purpose}`;
}

/**
 * Fit whole repetitions of a sport's own interval format into the work budget (§7.2, F13).
 *
 * The **format** is the physiological claim and is never rescaled — 30/15 for the bike,
 * 3–4 min for the run — because that divergence is the entire point of F13. What flexes is
 * the number of repetitions, since the planner's slot (`S3_CAP_MIN` is 40 min) is often
 * shorter than the canonical session. At least one repetition is always rendered: a quality
 * session too short for a single rep is a planning bug, not something to paper over here.
 */
function fitReps(workSec: number, repSec: number, canonicalReps: number): number {
  return Math.max(1, Math.min(canonicalReps, Math.floor(workSec / repSec)));
}

/**
 * A concrete session, rendered to exactly the duration the planner allocated.
 *
 * This is what `plan/micro.ts` assigns a purpose to and `plan/generate.ts` attaches to every
 * scheduled workout, so a persisted plan carries real structure instead of
 * `{ kind: 'steady' }`. Every branch returns a structure whose total equals `durationMin`
 * exactly — the persisted `planned_duration_min` drives load and the guardrails, so a
 * structure that disagreed with it would be two contradictory numbers for one session.
 */
export function renderSession(spec: SessionSpec): WorkoutStructure {
  const { sport, purpose, goalZone } = spec;
  const totalSec = spec.durationMin * SEC_PER_MIN;
  const base = { sport, purpose, goalZone };

  if (purpose === 'vo2max') return fitVo2max(spec, totalSec);
  if (purpose === 'durability') return renderDurability(spec, totalSec);
  if (sport === 'swim') return renderSwimSets(spec, totalSec);

  // aerobic_volume, recovery, technique and anything the planner doesn't yet emit: one
  // continuous effort at the goal zone. Deliberately not embellished — an easy run is an easy
  // run, and inventing structure for it would be inventing a prescription.
  return { ...base, steps: [step('steady', totalSec, goalZone)] };
}

function fitVo2max(spec: SessionSpec, totalSec: number): WorkoutStructure {
  const { sport } = spec;
  const base = { sport, purpose: 'vo2max' as SessionPurpose, goalZone: 'S3' as SZone };
  const { warmup, cooldown, workSec } = bookends(totalSec);

  if (sport === 'bike') {
    const { work, rest, reps, sets, setRest } = BIKE_VO2_SHORT;
    // Try to keep the set structure; drop to a single set when the slot can't hold two.
    const perSet = reps * (work + rest) + setRest;
    const setCount = Math.max(1, Math.min(sets, Math.floor(workSec / perSet)));
    const repCount = fitReps(Math.floor(workSec / setCount) - setRest, work + rest, reps);
    const used = setCount * (repCount * (work + rest) + setRest);
    return {
      ...base,
      steps: [
        warmup,
        repeat(setCount, [repeat(repCount, [step('work', work, 'S3'), step('recovery', rest, 'S1')]), step('recovery', setRest, 'S1')]),
        step('cooldown', cooldown.durationSec + (workSec - used), 'S1'),
      ],
    };
  }

  if (sport === 'run') {
    const workSecPerRep = Math.round(((RUN_VO2_LONG.workMin + RUN_VO2_LONG.workMax) / 2) * SEC_PER_MIN);
    const recoverySec = Math.round(workSecPerRep * RUN_VO2_LONG.recoveryRatio);
    const repCount = fitReps(workSec, workSecPerRep + recoverySec, RUN_VO2_LONG.reps[0] + 1);
    const used = repCount * (workSecPerRep + recoverySec);
    return {
      ...base,
      steps: [
        warmup,
        repeat(repCount, [step('work', workSecPerRep, 'S3'), step('recovery', recoverySec, 'S1')]),
        step('cooldown', cooldown.durationSec + (workSec - used), 'S1'),
      ],
    };
  }

  // Swim: 10 × 100 m at CSS pace with short rest (§7.2).
  const repCount = fitReps(workSec, 110, 10);
  const used = repCount * 110;
  return {
    ...base,
    steps: [
      warmup,
      repeat(repCount, [step('work', 90, 'S3'), step('recovery', 20, 'S1')]),
      step('cooldown', cooldown.durationSec + (workSec - used), 'S1'),
    ],
  };
}

// Structural, not physiological: how a swim session is *written*, not a claim about training
// effect. A pool set is broken by the wall, so "swim steadily for 40 minutes" is a prescription
// no coach would hand over — the same easy work is written as sets with short rest. Zones and
// totals are unchanged by this; only the shape is.
const SWIM_SET_SEC = 120;
const SWIM_SET_REST_SEC = 20;
const SWIM_DRILL_SEC = 60;

/**
 * Swim sessions other than VO₂ (which §7.2 already specifies as 10 × 100) — written as sets.
 * A technique session alternates a drill with a swim; everything else is straight sets.
 */
function renderSwimSets(spec: SessionSpec, totalSec: number): WorkoutStructure {
  const base = { sport: spec.sport, purpose: spec.purpose, goalZone: spec.goalZone };
  const { warmup, cooldown, workSec } = bookends(totalSec);
  const isTechnique = spec.purpose === 'technique';

  const cycleSec = (isTechnique ? SWIM_DRILL_SEC : 0) + SWIM_SET_SEC + SWIM_SET_REST_SEC;
  const reps = Math.max(1, Math.floor(workSec / cycleSec));
  const used = reps * cycleSec;

  const cycle = isTechnique
    ? [step('drill', SWIM_DRILL_SEC, 'S1'), step('work', SWIM_SET_SEC, spec.goalZone), step('recovery', SWIM_SET_REST_SEC, 'S1')]
    : [step('work', SWIM_SET_SEC, spec.goalZone), step('recovery', SWIM_SET_REST_SEC, 'S1')];

  return {
    ...base,
    // Any remainder joins the cool-down rather than padding a set to an odd length.
    steps: [warmup, repeat(reps, cycle), step('cooldown', cooldown.durationSec + (workSec - used), 'S1')],
  };
}

/**
 * A long session with race-intensity work in its **final third** (§7.2, §11).
 *
 * Not decoration: this is where durability is built and measured at the same time, because
 * the decoupling reading (§11.1) compares the session's two halves. Putting the harder block
 * early would manufacture drift; putting it last is the point.
 */
function renderDurability(spec: SessionSpec, totalSec: number): WorkoutStructure {
  const base = { sport: spec.sport, purpose: 'durability' as SessionPurpose, goalZone: spec.goalZone };
  const blockSec = Math.round(totalSec / 3);
  return {
    ...base,
    steps: [
      step('steady', totalSec - blockSec, 'S1'),
      step('work', blockSec, 'S2'),
    ],
  };
}

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
