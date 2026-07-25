import { generatePlan, type GeneratePlanInput } from '@ironflow/core/physio';
import { describe, expect, it } from 'vitest';
import {
  fromWorkoutRow,
  toPlanWeekRow,
  toTrainingPlanRow,
  toWorkoutRow,
  workoutName,
  workoutPurpose,
  workoutTemplateId,
  type GeneratedPlanMeta,
} from '../repositories/plans.js';

const input: GeneratePlanInput = {
  totalWeeks: 12,
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

const meta: GeneratedPlanMeta = {
  name: 'Ironman build',
  modelSnapshot: { hrMax: 186 },
  availabilitySnapshot: { weeklyHoursMax: 12 },
  distributionPolicy: { base: { S1: 80, S2: 15, S3: 5 } },
  engineVersion: 'test-1',
  course: 'long',
};

const plan = generatePlan(input);
const hardWorkout = plan.workouts.find((w) => w.isHard)!;
const easyWorkout = plan.workouts.find((w) => !w.isHard)!;

describe('plan row mappers', () => {
  it('maps the plan header to a training_plans Insert row', () => {
    const row = toTrainingPlanRow('athlete-1', plan, meta);
    expect(row.athlete_id).toBe('athlete-1');
    expect(row.name).toBe('Ironman build');
    expect(row.start_date).toBe('2026-08-03');
    expect(row.end_date).toBe(plan.endDate);
    expect(row.primary_race_id).toBeNull();
    expect(row.engine_version).toBe('test-1');
    expect(row.model_snapshot).toEqual({ hrMax: 186 });
  });

  it('maps a plan week, deriving hours and the phase distribution target', () => {
    const w = plan.weeks[0]!;
    const row = toPlanWeekRow('plan-1', plan.startDate, w, 'long');
    expect(row.plan_id).toBe('plan-1');
    expect(row.week_number).toBe(1);
    expect(row.week_start_date).toBe('2026-08-03');
    expect(row.phase).toBe(w.phase);
    expect(row.load_target).toBe(w.loadTarget);
    expect(row.hours_target).toBeGreaterThan(0);
    expect(row.distribution_target).toHaveProperty('S1'); // {S1,S2,S3}
  });

  it('week_start_date advances 7 days per week', () => {
    const w2 = plan.weeks[1]!;
    expect(toPlanWeekRow('p', plan.startDate, w2, 'long').week_start_date).toBe('2026-08-10');
  });

  it('materialises a hard session into a key VO₂ workout', () => {
    const row = toWorkoutRow('athlete-1', 'plan-1', 'week-1', hardWorkout);
    expect(row.athlete_id).toBe('athlete-1');
    expect(row.plan_week_id).toBe('week-1');
    expect(row.goal_zone).toBe(hardWorkout.sZone);
    expect(row.is_key_session).toBe(true);
    expect(row.purpose).toBe('vo2max');
    expect(row.planned_duration_min).toBe(hardWorkout.durationMin);
    expect(row.planned_load).toBe(hardWorkout.load);
    expect(row.scheduled_date).toBe(hardWorkout.scheduledDate);
    expect(row.structure).toMatchObject({ kind: 'intervals' });
  });

  it('materialises an easy session into an aerobic workout', () => {
    const row = toWorkoutRow('a', 'p', 'w', easyWorkout);
    expect(row.purpose).toBe('aerobic_volume');
    expect(row.is_key_session).toBe(false);
    expect(row.structure).toMatchObject({ kind: 'steady' });
  });

  it('derives stable name / purpose / template id per intensity', () => {
    expect(workoutPurpose(hardWorkout)).toBe('vo2max');
    expect(workoutPurpose(easyWorkout)).toBe('aerobic_volume');
    expect(workoutName(hardWorkout)).toMatch(/intervals$/);
    expect(workoutName(easyWorkout)).toMatch(/aerobic$/);
    expect(workoutTemplateId(hardWorkout)).toMatch(/\.key$/);
    expect(workoutTemplateId(easyWorkout)).not.toMatch(/\.key$/);
  });

  it('round-trips: every scheduled session survives write → read unchanged', () => {
    for (const sw of plan.workouts) {
      const row = { ...toWorkoutRow('a', 'p', 'w', sw), id: 'x', status: 'scheduled' } as never;
      expect(fromWorkoutRow(row)).toEqual({
        dayOfWeek: sw.dayOfWeek,
        sport: sw.sport,
        sZone: sw.sZone,
        purpose: sw.isHard ? 'vo2max' : 'aerobic_volume',
        durationMin: sw.durationMin,
        load: sw.load,
        isHard: sw.isHard,
      });
    }
  });

  it('skips a stored workout the planner never schedules', () => {
    const row = { ...toWorkoutRow('a', 'p', 'w', easyWorkout), sport: 'other' } as never;
    expect(fromWorkoutRow(row)).toBeNull();
  });

  it('every workout maps to a persistence-valid row', () => {
    for (const sw of plan.workouts) {
      const row = toWorkoutRow('a', 'p', 'w', sw);
      expect(row.planned_duration_min).toBeGreaterThanOrEqual(0);
      expect(['S1', 'S2', 'S3']).toContain(row.goal_zone);
      expect(row.template_id.length).toBeGreaterThan(0);
      expect(row.name.length).toBeGreaterThan(0);
    }
  });
});
