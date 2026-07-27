import { describe, expect, it } from 'vitest';
import { generatePlan, type GeneratePlanInput } from '../plan/generate.js';
import {
  renderSession,
  structureDurationSec,
  type Repeat,
  type Step,
  type WorkoutElement,
} from '../sessions/library.js';

const repeats = (steps: readonly WorkoutElement[]): Repeat[] =>
  steps.filter((s): s is Repeat => s.kind === 'repeat');
const steps = (els: readonly WorkoutElement[]): Step[] => els.filter((s): s is Step => s.kind === 'step');

const input: GeneratePlanInput = {
  totalWeeks: 16,
  eventType: 'ironman',
  course: 'long',
  availability: {
    dayMinutes: { 0: 240, 1: 60, 2: 90, 3: 60, 4: 75, 5: 45, 6: 240 },
    weeklyHoursMax: 12,
    longRideDay: 6,
    longRunDay: 0,
    swimDays: [2],
  },
  startingLoad: 400,
  confidence: 0.7,
  trainingAgeYears: 4,
  startDate: '2026-08-03',
};

describe('renderSession (§7.1/§7.2)', () => {
  // The persisted `planned_duration_min` drives load and every guardrail. A structure that
  // disagreed with it would be two contradictory numbers describing one session.
  it('renders to exactly the duration the planner allocated', () => {
    for (const durationMin of [20, 30, 40, 45, 60, 75, 90, 150, 240]) {
      for (const sport of ['run', 'bike', 'swim'] as const) {
        for (const purpose of ['vo2max', 'aerobic_volume', 'durability', 'recovery', 'technique'] as const) {
          const s = renderSession({ sport, purpose, goalZone: purpose === 'vo2max' ? 'S3' : 'S1', durationMin });
          expect(structureDurationSec(s.steps) / 60).toBe(durationMin);
        }
      }
    }
  });

  it('keeps each sport’s own interval format when it shortens a session (F13)', () => {
    // 40 min is the planner's S3 cap — well under the canonical bike session's ~63 min.
    const bike = renderSession({ sport: 'bike', purpose: 'vo2max', goalZone: 'S3', durationMin: 40 });
    const set = repeats(bike.steps)[0]!;
    const rep = repeats(set.steps)[0]!;
    expect((rep.steps[0] as Step).durationSec).toBe(30); // 30/15 preserved …
    expect((rep.steps[1] as Step).durationSec).toBe(15);
    expect(rep.count).toBeLessThanOrEqual(13); // … only the rep count flexes

    const run = renderSession({ sport: 'run', purpose: 'vo2max', goalZone: 'S3', durationMin: 40 });
    const runRep = repeats(run.steps)[0]!;
    const work = (runRep.steps[0] as Step).durationSec;
    expect(work).toBeGreaterThanOrEqual(180); // long intervals, not 30/15
    expect(work).toBeLessThanOrEqual(240);
  });

  it('always renders at least one repetition, however short the slot', () => {
    const tiny = renderSession({ sport: 'run', purpose: 'vo2max', goalZone: 'S3', durationMin: 20 });
    expect(repeats(tiny.steps)[0]!.count).toBeGreaterThanOrEqual(1);
  });

  it('puts the durability session’s race-pace block in its final third (§7.2, §11)', () => {
    const long = renderSession({ sport: 'bike', purpose: 'durability', goalZone: 'S1', durationMin: 180 });
    const blocks = steps(long.steps);
    expect(blocks[0]!.targetZone).toBe('S1');
    expect(blocks[blocks.length - 1]!.targetZone).toBe('S2'); // the harder work is *last*
    expect(blocks[blocks.length - 1]!.durationSec / 60).toBeCloseTo(60, 0); // a third of 180
  });

  it('leaves an easy session unembellished', () => {
    const easy = renderSession({ sport: 'run', purpose: 'aerobic_volume', goalZone: 'S1', durationMin: 60 });
    expect(easy.steps).toEqual([{ kind: 'step', intent: 'steady', durationSec: 3600, targetZone: 'S1' }]);
  });
});

describe('generatePlan attaches a real template to every workout', () => {
  const plan = generatePlan(input);

  it('gives every workout a purpose, a name, a template id and a structure', () => {
    expect(plan.workouts.length).toBeGreaterThan(0);
    for (const w of plan.workouts) {
      expect(w.purpose).toBeTruthy();
      expect(w.name).toMatch(/\S/);
      expect(w.templateId).toBe(`${w.sport}-${w.purpose}`);
      expect(w.structure.steps.length).toBeGreaterThan(0);
    }
  });

  it('every structure matches its own planned duration', () => {
    for (const w of plan.workouts) {
      expect(structureDurationSec(w.structure.steps) / 60).toBe(w.durationMin);
    }
  });

  it('names are no longer generic — a quality session says what it is', () => {
    const hard = plan.workouts.find((w) => w.isHard)!;
    expect(hard.purpose).toBe('vo2max');
    expect(hard.name).toContain('VO₂');
    expect(hard.structure.steps.some((s) => s.kind === 'repeat')).toBe(true);
  });

  it('recovery weeks prescribe recovery, not aerobic volume', () => {
    const recoveryWeek = plan.weeks.find((w) => w.isRecoveryWeek);
    if (!recoveryWeek) return;
    const inWeek = plan.workouts.filter((w) => w.weekNumber === recoveryWeek.weekNumber);
    expect(inWeek.every((w) => w.purpose === 'recovery')).toBe(true);
  });

  it('long sessions in Build carry the race-pace finish, Base ones do not', () => {
    const build = plan.workouts.filter((w) => w.phase === 'build' && w.purpose === 'durability');
    const base = plan.workouts.filter((w) => w.phase === 'base');
    expect(build.length).toBeGreaterThan(0);
    expect(base.every((w) => w.purpose !== 'durability')).toBe(true);
  });
});

// §7.2b — sub-threshold work is written as controlled blocks, never one continuous effort.
describe('sub-threshold rendering (§7.2b)', () => {
  const spec = (durationMin: number, sport: 'run' | 'bike' = 'run') =>
    ({ sport, purpose: 'threshold' as const, goalZone: 'S2' as const, durationMin });

  it('renders repeated blocks with a float between them', () => {
    const s = renderSession(spec(70));
    const repeat = s.steps.find((el) => el.kind === 'repeat');
    expect(repeat).toBeDefined();
    expect((repeat as { count: number }).count).toBeGreaterThan(1);
  });

  // The block structure IS the intensity control — running each block too fast is the
  // documented dominant error of athletes copying this method.
  it('never renders the work above the session goal zone', () => {
    const s = renderSession(spec(70));
    const zones = JSON.stringify(s);
    expect(zones).not.toContain('"S3"');
  });

  it('totals exactly the requested duration, for every slot length', () => {
    for (const min of [25, 33, 40, 55, 70, 90]) {
      const s = renderSession(spec(min));
      expect(structureDurationSec(s.steps)).toBe(min * 60);
    }
  });

  it('still produces one block when the slot is too short for two', () => {
    const s = renderSession(spec(20));
    const repeat = s.steps.find((el) => el.kind === 'repeat') as { count: number };
    expect(repeat.count).toBe(1);
    expect(structureDurationSec(renderSession(spec(20)).steps)).toBe(1200);
  });

  it('leaves a threshold swim to the swim-set renderer', () => {
    const s = renderSession({ sport: 'swim', purpose: 'threshold', goalZone: 'S2', durationMin: 40 });
    expect(structureDurationSec(s.steps)).toBe(2400);
  });
});
