import { describe, expect, it } from 'vitest';
import { planHeatBlock, type HeatBlockInput } from '../sessions/heat.js';
import { strengthDayBlockers, strengthPrescription, type StrengthDayContext } from '../sessions/strength.js';
import type { PlanPhase } from '../plan/types.js';

describe('Strength prescription (§7.3)', () => {
  it('prescribes 2×/week heavy work with plyometrics in Base', () => {
    const p = strengthPrescription('base')!;
    expect(p.sessionsPerWeek).toBe(2);
    expect(p.sets).toEqual([3, 5]);
    expect(p.reps).toEqual([4, 6]);
    expect(p.pct1RM).toEqual([0.8, 0.85]);
    expect(p.includesPlyometrics).toBe(true);
    expect(p.volumeReduction).toBe(0);
  });

  it('keeps the load heavy but trims volume through Build and Peak', () => {
    expect(strengthPrescription('build')!.volumeReduction).toBe(0.25);
    expect(strengthPrescription('build')!.sessionsPerWeek).toBe(2);
    expect(strengthPrescription('peak')!.sessionsPerWeek).toBe(1);
    expect(strengthPrescription('peak')!.pct1RM).toEqual([0.8, 0.85]); // still heavy
    expect(strengthPrescription('build')!.includesPlyometrics).toBe(false);
  });

  it('allows one taper session and none in recovery, race week or transition', () => {
    expect(strengthPrescription('taper')!.sessionsPerWeek).toBe(1);
    for (const phase of ['recovery', 'race_week', 'transition'] as PlanPhase[]) {
      expect(strengthPrescription(phase)).toBeNull();
    }
  });
});

describe('Strength scheduling rules (§7.3)', () => {
  const ctx = (over: Partial<StrengthDayContext> = {}): StrengthDayContext => ({
    isRecoveryDay: false,
    nextDayIsKeyS3: false,
    isLowerBody: false,
    ...over,
  });

  it('accepts a clean day', () => {
    expect(strengthDayBlockers(ctx())).toEqual([]);
    expect(strengthDayBlockers(ctx({ hoursFromKeyAerobic: 8 }))).toEqual([]);
  });

  it('blocks recovery days and the day before a key S3', () => {
    expect(strengthDayBlockers(ctx({ isRecoveryDay: true }))).toContain('RECOVERY_DAY');
    expect(strengthDayBlockers(ctx({ nextDayIsKeyS3: true }))).toContain('DAY_BEFORE_KEY_S3');
  });

  it('requires 6 h of separation from a key aerobic session', () => {
    expect(strengthDayBlockers(ctx({ hoursFromKeyAerobic: 5 }))).toContain('TOO_CLOSE_TO_KEY_AEROBIC');
    expect(strengthDayBlockers(ctx({ hoursFromKeyAerobic: 6 }))).not.toContain('TOO_CLOSE_TO_KEY_AEROBIC');
  });

  it('keeps lower-body work 48 h clear of a long run — upper body is unaffected', () => {
    expect(strengthDayBlockers(ctx({ isLowerBody: true, hoursFromLongRun: 24 }))).toContain('WITHIN_48H_OF_LONG_RUN');
    expect(strengthDayBlockers(ctx({ isLowerBody: true, hoursFromLongRun: 48 }))).not.toContain('WITHIN_48H_OF_LONG_RUN');
    expect(strengthDayBlockers(ctx({ isLowerBody: false, hoursFromLongRun: 12 }))).toEqual([]);
  });

  it('stops entirely inside the final 10 days', () => {
    expect(strengthDayBlockers(ctx({ daysToRace: 10 }))).toContain('INSIDE_TAPER_LOCKOUT');
    expect(strengthDayBlockers(ctx({ daysToRace: 11 }))).not.toContain('INSIDE_TAPER_LOCKOUT');
  });
});

describe('Heat adaptation block (§7.4)', () => {
  const input = (over: Partial<HeatBlockInput> = {}): HeatBlockInput => ({
    daysToRace: 40,
    raceWbgtC: 28,
    athleteNormWbgtC: 16,
    triggerMarginC: 5,
    ...over,
  });

  it('prescribes a passive block when the race is much hotter than the athlete trains in', () => {
    const b = planHeatBlock(input());
    expect(b.prescribed).toBe(true);
    expect(b.mode).toBe('passive'); // sauna/hot bath — training intensity untouched
    expect(b.reduceIntensityTargets).toBe(false);
    expect(b.exposures).toBe(14); // capped at the top of the 8–14 band
    expect(b.minutesPerExposure).toBe(25);
    expect(b.endDaysBeforeRace).toBe(5);
    expect(b.startDaysBeforeRace).toBe(19);
    expect(b.reasonCode).toBe('HEAT_BLOCK_SCHEDULED');
    expect(b.reasonText).toMatch(/intensity is unchanged/);
  });

  it('falls back to active heat sessions with eased targets when there is no sauna', () => {
    const b = planHeatBlock(input({ passiveAvailable: false }));
    expect(b.mode).toBe('active');
    expect(b.reduceIntensityTargets).toBe(true); // never scored as under-performance (§7.4)
    expect(b.minutesPerExposure).toBe(60);
    expect(b.reasonText).toMatch(/don't chase normal numbers/);
  });

  it('does not prescribe when the race is close to the athlete\'s own conditions', () => {
    const b = planHeatBlock(input({ raceWbgtC: 20, athleteNormWbgtC: 16, triggerMarginC: 5 }));
    expect(b.prescribed).toBe(false);
    expect(b.reasonCode).toBe('HEAT_NOT_NEEDED');
    expect(b.exposures).toBe(0);
  });

  it('does not prescribe a block that cannot finish in time', () => {
    const b = planHeatBlock(input({ daysToRace: 12 })); // 12 − 5 = 7 days, under the 8 minimum
    expect(b.prescribed).toBe(false);
    expect(b.reasonCode).toBe('HEAT_TOO_LATE');
  });

  it('shortens the block to what fits, down to the 8-exposure minimum', () => {
    const b = planHeatBlock(input({ daysToRace: 15 })); // 15 − 5 = 10 exposures
    expect(b.prescribed).toBe(true);
    expect(b.exposures).toBe(10);
  });
});
