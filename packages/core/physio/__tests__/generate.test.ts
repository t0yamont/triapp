import { describe, expect, it } from 'vitest';
import { addDaysISO, generatePlan, type GeneratePlanInput } from '../plan/generate.js';

const availability = {
  dayMinutes: { 0: 240, 1: 60, 2: 90, 3: 60, 4: 75, 5: 45, 6: 240 } as Record<number, number>,
  weeklyHoursMax: 12,
  longRideDay: 6,
  longRunDay: 0,
  swimDays: [2],
};

const input: GeneratePlanInput = {
  totalWeeks: 24,
  eventType: 'ironman',
  course: 'long',
  availability,
  startingLoad: 400,
  confidence: 0.7,
  trainingAgeYears: 4,
  startDate: '2026-08-03', // Monday = day 1 of week 1
};

describe('addDaysISO', () => {
  it('adds calendar days across month, year and leap boundaries', () => {
    expect(addDaysISO('2026-08-03', 0)).toBe('2026-08-03');
    expect(addDaysISO('2026-08-30', 3)).toBe('2026-09-02');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysISO('2026-08-10', -7)).toBe('2026-08-03');
  });
});

describe('generatePlan (§8)', () => {
  const plan = generatePlan(input);

  it('produces a complete, dated 24-week plan', () => {
    expect(plan.summary.totalWeeks).toBe(24);
    expect(plan.weeks).toHaveLength(24);
    expect(plan.workouts.length).toBeGreaterThan(0);
    expect(plan.summary.totalWorkouts).toBe(plan.workouts.length);
    expect(plan.startDate).toBe('2026-08-03');
    expect(plan.endDate).toBe(addDaysISO('2026-08-03', 24 * 7 - 1)); // last day of week 24
    expect(plan.summary.peakWeeklyLoad).toBeGreaterThan(0);
  });

  it('schedules every workout on the correct calendar date (Mon-anchored)', () => {
    for (const w of plan.workouts) {
      const expected = addDaysISO(input.startDate, (w.weekNumber - 1) * 7 + ((w.dayOfWeek - 1 + 7) % 7));
      expect(w.scheduledDate).toBe(expected);
    }
  });

  it('returns workouts in chronological order', () => {
    const sorted = [...plan.workouts].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    expect(plan.workouts).toEqual(sorted);
    expect(plan.workouts[0]!.scheduledDate >= plan.startDate).toBe(true);
    expect(plan.workouts[plan.workouts.length - 1]!.scheduledDate <= plan.endDate).toBe(true);
  });

  it('summarises phases and recovery weeks consistently', () => {
    expect(plan.summary.phases.reduce((a, p) => a + p.weeks, 0)).toBe(24);
    expect(plan.summary.recoveryWeeks).toBe(plan.weeks.filter((w) => w.isRecoveryWeek).length);
    expect(plan.summary.phases.map((p) => p.phase)).toContain('base');
    expect(plan.summary.totalPlannedLoad).toBe(plan.workouts.reduce((a, s) => a + s.load, 0));
  });

  it('honours an explicit week-start day', () => {
    const sunStart = generatePlan({ ...input, weekStartDay: 0 });
    for (const w of sunStart.workouts) {
      const expected = addDaysISO(input.startDate, (w.weekNumber - 1) * 7 + ((w.dayOfWeek - 0 + 7) % 7));
      expect(w.scheduledDate).toBe(expected);
    }
  });

  it('is pure — identical inputs give a deep-equal plan (I16)', () => {
    expect(generatePlan(input)).toEqual(generatePlan(input));
  });
});
