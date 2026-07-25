import { describe, expect, it } from 'vitest';
import { COMPLETION_HIGH_WEEKS, COMPLETION_LOW_WEEKS, DISTRIBUTION_ROLLING_WEEKS } from '../constants.js';
import { buildReplanContext, weeklyReplan, type ReplanWeekSummary } from '../plan/replan.js';

const week = (over: Partial<ReplanWeekSummary> = {}): ReplanWeekSummary => ({
  weekStart: '2026-07-06',
  plannedLoad: 500,
  completedLoad: 500,
  zoneMinutes: { S1: 320, S2: 60, S3: 20 },
  readinessFlagged: false,
  ...over,
});

describe('buildReplanContext', () => {
  it('is safe on an athlete with no completed weeks', () => {
    const ctx = buildReplanContext([]);
    expect(ctx.completionByWeek).toEqual([]);
    expect(ctx.actualLoadLastWeek).toBe(0);
    expect(weeklyReplan(ctx)).toEqual([]); // no evidence ⇒ no decisions
  });

  it('derives completion per week from planned vs completed load', () => {
    const ctx = buildReplanContext([week({ plannedLoad: 500, completedLoad: 250 })]);
    expect(ctx.completionByWeek).toEqual([0.5]);
  });

  it('treats a zero-planned week as 0% rather than dividing by zero', () => {
    const ctx = buildReplanContext([week({ plannedLoad: 0, completedLoad: 0 })]);
    expect(ctx.completionByWeek).toEqual([0]);
    expect(Number.isFinite(ctx.completionByWeek[0]!)).toBe(true);
  });

  it('takes actualLoadLastWeek from the most recent week', () => {
    const ctx = buildReplanContext([week({ completedLoad: 100 }), week({ completedLoad: 420 })]);
    expect(ctx.actualLoadLastWeek).toBe(420);
  });

  it('counts flagged weeks, and stable weeks only as a trailing run', () => {
    // flagged, clean, flagged, clean, clean  ⇒ 2 flagged, 2 trailing stable
    const ctx = buildReplanContext([
      week({ readinessFlagged: true }),
      week(),
      week({ readinessFlagged: true }),
      week(),
      week(),
    ]);
    expect(ctx.readinessFlaggedWeeks).toBe(2);
    expect(ctx.readinessStableWeeks).toBe(2);
  });

  it('withholds the rolling distribution until there are three weeks of it', () => {
    const target = { S1: 80, S2: 15, S3: 5 };
    const two = buildReplanContext([week(), week()], target);
    expect(two.rolling3wkDistribution).toBeUndefined();

    const three = buildReplanContext([week(), week(), week()], target);
    expect(three.rolling3wkDistribution).toBeDefined();
  });

  it('aggregates zone minutes across the window rather than averaging percentages', () => {
    const target = { S1: 80, S2: 15, S3: 5 };
    // A big S1 week and two tiny S3-heavy weeks: summing minutes keeps the big week dominant.
    const ctx = buildReplanContext(
      [
        week({ zoneMinutes: { S1: 900, S2: 0, S3: 0 } }),
        week({ zoneMinutes: { S1: 0, S2: 0, S3: 30 } }),
        week({ zoneMinutes: { S1: 0, S2: 0, S3: 30 } }),
      ],
      target,
    );
    expect(ctx.rolling3wkDistribution!.S1).toBeGreaterThan(90);
  });

  it('omits the distribution pair entirely when no target is supplied', () => {
    const ctx = buildReplanContext([week(), week(), week()]);
    expect(ctx.rolling3wkDistribution).toBeUndefined();
    expect(ctx.distributionTarget).toBeUndefined();
  });

  it('leaves activity-derived evidence undefined — never defaulted to a measured zero', () => {
    const ctx = buildReplanContext([week(), week(), week()]);
    // A default of 0 would assert "measured, and unchanged", firing or suppressing triggers
    // on evidence the athlete never gave.
    expect(ctx).not.toHaveProperty('hrAtPaceChangeFrac');
    expect(ctx).not.toHaveProperty('bodyMassChangeFrac');
    expect(ctx).not.toHaveProperty('durabilityWorsening');
    expect(weeklyReplan(ctx).map((d) => d.action)).not.toContain('schedule_fitness_test');
  });
});

describe('buildReplanContext → weeklyReplan, end to end', () => {
  it('fires under-completion when the plan asked too much and readiness was fine', () => {
    const weeks = Array.from({ length: COMPLETION_LOW_WEEKS }, () =>
      week({ plannedLoad: 500, completedLoad: 250 }),
    );
    const decisions = weeklyReplan(buildReplanContext(weeks));
    const reduce = decisions.find((d) => d.action === 'reduce_weekly_target');
    expect(reduce).toBeDefined();
    expect(reduce!.newWeeklyTarget).toBeGreaterThan(250); // actual + a little, not a cliff
    expect(reduce!.newWeeklyTarget).toBeLessThan(500);
  });

  it('does NOT blame the plan when readiness was flagged — the athlete was under strain', () => {
    const weeks = Array.from({ length: COMPLETION_LOW_WEEKS }, () =>
      week({ plannedLoad: 500, completedLoad: 250, readinessFlagged: true }),
    );
    expect(weeklyReplan(buildReplanContext(weeks)).map((d) => d.action)).not.toContain('reduce_weekly_target');
  });

  it('grants the full ramp after sustained over-completion with stable readiness', () => {
    const weeks = Array.from({ length: COMPLETION_HIGH_WEEKS }, () =>
      week({ plannedLoad: 500, completedLoad: 500 }),
    );
    expect(weeklyReplan(buildReplanContext(weeks)).map((d) => d.action)).toContain('permit_full_ramp');
  });

  it('flags distribution drift when the real mix leaves tolerance', () => {
    const target = { S1: 80, S2: 15, S3: 5 };
    const weeks = Array.from({ length: DISTRIBUTION_ROLLING_WEEKS }, () =>
      week({ zoneMinutes: { S1: 100, S2: 100, S3: 100 } }),
    );
    expect(weeklyReplan(buildReplanContext(weeks, target)).map((d) => d.action)).toContain('adjust_distribution');
  });

  it('stays quiet when the athlete is on plan', () => {
    const target = { S1: 80, S2: 15, S3: 5 };
    const weeks = Array.from({ length: DISTRIBUTION_ROLLING_WEEKS }, () =>
      week({ plannedLoad: 500, completedLoad: 450, zoneMinutes: { S1: 320, S2: 60, S3: 20 } }),
    );
    expect(weeklyReplan(buildReplanContext(weeks, target))).toEqual([]);
  });
});
