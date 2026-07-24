import { describe, expect, it } from 'vitest';
import { weeklyReplan, type ReplanAction, type WeeklyReplanContext } from '../plan/replan.js';

const base: WeeklyReplanContext = {
  completionByWeek: [0.85, 0.85, 0.85],
  actualLoadLastWeek: 400,
  readinessFlaggedWeeks: 0,
  readinessStableWeeks: 0,
};
const ctx = (over: Partial<WeeklyReplanContext>): WeeklyReplanContext => ({ ...base, ...over });
const actions = (c: WeeklyReplanContext): ReplanAction[] => weeklyReplan(c).map((d) => d.action);

describe('Weekly re-planning triggers (§10.3)', () => {
  it('an on-track week raises nothing', () => {
    expect(weeklyReplan(base)).toEqual([]);
  });

  describe('under-completion → cut the target, not the athlete', () => {
    it('fires after two sub-70% weeks with no readiness flags', () => {
      const d = weeklyReplan(ctx({ completionByWeek: [0.85, 0.6, 0.65] }));
      expect(d).toHaveLength(1);
      expect(d[0]!.action).toBe('reduce_weekly_target');
      expect(d[0]!.newWeeklyTarget).toBe(420); // 400 × 1.05
      expect(d[0]!.mutation.actor).toBe('engine');
      expect(d[0]!.reasonText.length).toBeGreaterThan(0);
    });

    it('does not fire when readiness flags explain the misses (§10.3: no flags)', () => {
      expect(actions(ctx({ completionByWeek: [0.6, 0.65], readinessFlaggedWeeks: 1 }))).not.toContain('reduce_weekly_target');
    });

    it('does not fire on a single bad week', () => {
      expect(actions(ctx({ completionByWeek: [0.6] }))).not.toContain('reduce_weekly_target');
    });
  });

  describe('sustained over-completion → earn the full ramp', () => {
    it('fires after three >95% weeks with stable readiness', () => {
      expect(actions(ctx({ completionByWeek: [0.96, 0.97, 0.98], readinessStableWeeks: 3 }))).toContain('permit_full_ramp');
    });

    it('does not fire if readiness has not been stable long enough', () => {
      expect(actions(ctx({ completionByWeek: [0.96, 0.97, 0.98], readinessStableWeeks: 2 }))).not.toContain('permit_full_ramp');
    });

    it('does not fire if a week dipped below 95%', () => {
      expect(actions(ctx({ completionByWeek: [0.96, 0.9, 0.98], readinessStableWeeks: 4 }))).not.toContain('permit_full_ramp');
    });
  });

  describe('apparent fitness gain → verify with a test, never assume', () => {
    it('schedules a test when HR at pace falls ≥3% over 3+ weeks', () => {
      expect(actions(ctx({ hrAtPaceChangeFrac: -0.04, hrAtPaceWeeks: 3 }))).toContain('schedule_fitness_test');
    });

    it('does not fire on a shallow drop or too short a window', () => {
      expect(actions(ctx({ hrAtPaceChangeFrac: -0.02, hrAtPaceWeeks: 4 }))).not.toContain('schedule_fitness_test');
      expect(actions(ctx({ hrAtPaceChangeFrac: -0.05, hrAtPaceWeeks: 2 }))).not.toContain('schedule_fitness_test');
      expect(actions(ctx({ hrAtPaceChangeFrac: -0.05 }))).not.toContain('schedule_fitness_test'); // weeks omitted
    });
  });

  describe('distribution drift → nudge the mix', () => {
    it('fires when the rolling 3-week mix leaves tolerance', () => {
      const d = ctx({ rolling3wkDistribution: { S1: 60, S2: 30, S3: 10 }, distributionTarget: { S1: 80, S2: 15, S3: 5 } });
      expect(actions(d)).toContain('adjust_distribution');
    });

    it('does not fire when the mix is within tolerance', () => {
      const d = ctx({ rolling3wkDistribution: { S1: 80, S2: 15, S3: 5 }, distributionTarget: { S1: 80, S2: 15, S3: 5 } });
      expect(actions(d)).not.toContain('adjust_distribution');
    });
  });

  describe('body-mass change → recompute W/kg', () => {
    it('fires and flags an unexplained change', () => {
      const d = weeklyReplan(ctx({ bodyMassChangeFrac: 0.05, bodyMassChangeWeeks: 4 }));
      const wkg = d.find((x) => x.action === 'recompute_wkg')!;
      expect(wkg.flagUnexplained).toBe(true);
    });

    it('fires without the flag when the change is explained', () => {
      const d = weeklyReplan(ctx({ bodyMassChangeFrac: -0.04, bodyMassChangeWeeks: 5, bodyMassExplained: true }));
      expect(d.find((x) => x.action === 'recompute_wkg')!.flagUnexplained).toBe(false);
    });

    it('does not fire on a small change or too short a window', () => {
      expect(actions(ctx({ bodyMassChangeFrac: 0.02, bodyMassChangeWeeks: 4 }))).not.toContain('recompute_wkg');
      expect(actions(ctx({ bodyMassChangeFrac: 0.05, bodyMassChangeWeeks: 3 }))).not.toContain('recompute_wkg');
      expect(actions(ctx({ bodyMassChangeFrac: 0.05 }))).not.toContain('recompute_wkg'); // weeks omitted
    });
  });

  it('durability worsening shifts toward aerobic volume (§11)', () => {
    expect(actions(ctx({ durabilityWorsening: true }))).toContain('shift_to_aerobic');
    expect(actions(ctx({ durabilityWorsening: false }))).not.toContain('shift_to_aerobic');
  });

  it('raises several independent triggers in the same week', () => {
    const d = actions(
      ctx({
        completionByWeek: [0.5, 0.6],
        durabilityWorsening: true,
        bodyMassChangeFrac: 0.05,
        bodyMassChangeWeeks: 4,
      }),
    );
    expect(d).toEqual(expect.arrayContaining(['reduce_weekly_target', 'recompute_wkg', 'shift_to_aerobic']));
  });
});
