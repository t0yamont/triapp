import { describe, expect, it } from 'vitest';
import { assemblePlan, type PlanInput } from '../plan/assemble.js';
import { validateWeek } from '../plan/invariants.js';
import type { Availability } from '../plan/micro.js';

const availability: Availability = {
  dayMinutes: { 1: 60, 2: 60, 3: 90, 4: 60, 5: 90, 6: 210 },
  weeklyHoursMax: 14,
  longRideDay: 6,
  longRunDay: 3,
  swimDays: [2],
};

const baseInput: Omit<PlanInput, 'totalWeeks'> = {
  eventType: 'ironman',
  course: 'long',
  availability,
  startingLoad: 400,
  confidence: 0.8,
  trainingAgeYears: 3,
};

describe('Plan assembly (§8) — Phase 5 gate', () => {
  it('a 24-week Ironman plan satisfies every invariant with no gaps', () => {
    const plan = assemblePlan({ ...baseInput, totalWeeks: 24 });

    // Complete, contiguous layout ending on the race.
    expect(plan.map((w) => w.weekNumber)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(plan[23]!.phase).toBe('race_week');
    const phases = new Set(plan.map((w) => w.phase));
    for (const p of ['base', 'build', 'peak', 'taper', 'race_week']) expect(phases.has(p as never)).toBe(true);

    // Every week is a guardrail-valid microcycle (I5–I11, I17, I18).
    for (const w of plan) expect(validateWeek(w.week)).toEqual([]);

    // I5 — no loading week's load ramps more than 8% above the 3-week rolling mean.
    const actual = plan.map((w) => w.week.sessions.reduce((a, s) => a + s.load, 0));
    plan.forEach((w, i) => {
      if (w.isRecoveryWeek || w.phase === 'taper' || w.phase === 'race_week') return;
      const prior = actual.slice(Math.max(0, i - 3), i);
      const rolling = prior.length > 0 ? prior.reduce((a, b) => a + b, 0) / prior.length : baseInput.startingLoad;
      expect(actual[i]!).toBeLessThanOrEqual(rolling * 1.08 + 1);
    });

    // Recovery weeks and a taper both appear.
    expect(plan.some((w) => w.isRecoveryWeek)).toBe(true);
    expect(plan.filter((w) => w.phase === 'taper').length).toBeGreaterThan(0);
  });

  it('generates a valid short-course plan too', () => {
    const plan = assemblePlan({ ...baseInput, eventType: 'olympic_tri', course: 'short', totalWeeks: 16 });
    expect(plan).toHaveLength(16);
    for (const w of plan) expect(validateWeek(w.week)).toEqual([]);
  });

  it('degrades to an all-taper plan when the window is shorter than the taper', () => {
    const plan = assemblePlan({ ...baseInput, totalWeeks: 2 });
    expect(plan.map((w) => w.weekNumber)).toEqual([1, 2]);
    expect(plan.every((w) => w.phase === 'taper' || w.phase === 'race_week')).toBe(true);
    for (const w of plan) expect(validateWeek(w.week)).toEqual([]);
  });
});
