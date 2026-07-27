import { describe, expect, it } from 'vitest';
import { heatAdaptationRetained, planHeatBlock, planHeatTopUp, type HeatBlockInput } from '../sessions/heat.js';
import { dfaHrSpreadBpm } from '../anchors/dfaAlpha1.js';
import {
  strengthDayBlockers,
  strengthEmphasis,
  strengthPrescription,
  type StrengthDayContext,
} from '../sessions/strength.js';
import { STRENGTH_MIN_HEAVY_LOAD_1RM } from '../constants.js';
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

describe('Heat trigger margin default (D-HEAT-MARGIN)', () => {
  const noMargin = { daysToRace: 40, raceWbgtC: 28, athleteNormWbgtC: 16 };

  it('applies the product-policy margin when the caller supplies none', () => {
    expect(planHeatBlock(noMargin).prescribed).toBe(true); // 12°C over, well past the 3°C default
    expect(planHeatBlock({ ...noMargin, raceWbgtC: 18 }).prescribed).toBe(false); // 2°C over
    expect(planHeatBlock({ ...noMargin, raceWbgtC: 19 }).prescribed).toBe(true); // 3°C — at the margin
  });

  it('still honours an explicit override', () => {
    expect(planHeatBlock({ ...noMargin, raceWbgtC: 19, triggerMarginC: 6 }).prescribed).toBe(false);
  });
});

// ── r2 additions ────────────────────────────────────────────────────────────

describe('§7.3 strength emphasis by threshold speed (r2)', () => {
  it('prescribes plyometric-led work below 12 km/h', () => {
    const e = strengthEmphasis(10.5);
    expect(e.emphasis).toBe('plyometric');
    expect(e.secondary).toBe('heavy');
    expect(e.conservative).toBe(false);
  });

  it('prescribes combined work in the 12–14.5 km/h band', () => {
    expect(strengthEmphasis(13).emphasis).toBe('combined');
    expect(strengthEmphasis(12).emphasis).toBe('combined');
    expect(strengthEmphasis(14.5).emphasis).toBe('combined');
  });

  it('prescribes heavy compound work above 14.5 km/h', () => {
    const e = strengthEmphasis(16);
    expect(e.emphasis).toBe('heavy');
    expect(e.secondary).toBe('plyometric');
  });

  // r1 defaulted every athlete to heavy compound work. A 4:45/km age-grouper and a 3:20/km
  // athlete are not in the same evidence bucket, and an unknown pace is not an excuse to guess.
  it('falls back to conservative combined work when the pace is unknown or poorly known', () => {
    expect(strengthEmphasis(undefined).conservative).toBe(true);
    expect(strengthEmphasis(16, 0.3).conservative).toBe(true);
    expect(strengthEmphasis(16, 0.3).emphasis).toBe('combined');
  });

  it('carries the emphasis into every phase that prescribes strength', () => {
    for (const phase of ['base', 'build', 'peak', 'taper'] as const) {
      expect(strengthPrescription(phase, 16)?.emphasis?.emphasis).toBe('heavy');
    }
  });

  // For a slow runner the reactive block IS the economy driver, not an optional Base extra.
  it('keeps the plyometric block past Base for a plyometric-emphasis athlete', () => {
    expect(strengthPrescription('build', 10)?.includesPlyometrics).toBe(true);
    expect(strengthPrescription('build', 16)?.includesPlyometrics).toBe(false);
  });

  it('never drops below the heavy-load floor — 40–79% 1RM showed no economy effect at all', () => {
    expect(strengthPrescription('base', 16)!.pct1RM[0]).toBeGreaterThanOrEqual(STRENGTH_MIN_HEAVY_LOAD_1RM);
  });
});

describe('§7.4 heat decay and re-induction (r2)', () => {
  it('loses ~2.5% of adaptation per day without exposure', () => {
    expect(heatAdaptationRetained(0)).toBe(1);
    expect(heatAdaptationRetained(10)).toBeCloseTo(0.75);
    expect(heatAdaptationRetained(20)).toBeCloseTo(0.5);
  });

  it('floors at zero rather than going negative', () => {
    expect(heatAdaptationRetained(200)).toBe(0);
  });

  it('needs no top-up when the block finishes inside the §7.4 band', () => {
    const t = planHeatTopUp(5);
    expect(t.needed).toBe(false);
    expect(t.exposures).toBe(0);
  });

  // r1 scheduled a block and then forgot about it. A block that finished three weeks out has
  // largely evaporated, and an engine that assumes otherwise gives over-confident race pacing.
  it('adds top-up exposures when projected retention falls below 75%', () => {
    const t = planHeatTopUp(21);
    expect(t.needed).toBe(true);
    expect(t.projectedRetention).toBeCloseTo(0.475);
    // Re-induction is 8–12× faster than decay, so the fix is cheap by construction.
    expect(t.exposures).toBeLessThanOrEqual(2);
    expect(t.exposures).toBeGreaterThan(0);
  });

  it('pluralises the top-up sensibly at both ends', () => {
    // 15 days out: 62.5% retained, ~5 decay-days lost, and re-induction at ~10x clears that in one.
    expect(planHeatTopUp(15).exposures).toBe(1);
    expect(planHeatTopUp(15).reasonText).toContain('1 short top-up exposure —');
    // A very long gap needs more than one, and says so.
    expect(planHeatTopUp(35).exposures).toBeGreaterThan(1);
    expect(planHeatTopUp(35).reasonText).toContain('exposures');
  });

  it('reports the honest spread beside a DFA-a1 heart rate, per threshold', () => {
    expect(dfaHrSpreadBpm('lt1')).toBe(6);
    expect(dfaHrSpreadBpm('lt2')).toBe(8);
  });

  it('a scheduled block carries its race-day retention projection', () => {
    const block = planHeatBlock({ daysToRace: 30, raceWbgtC: 28, athleteNormWbgtC: 18 });
    expect(block.prescribed).toBe(true);
    expect(block.topUp.projectedRetention).toBeGreaterThan(0.8);
    expect(block.longRegimen).toBe(false);
  });

  it('offers the longer regimen only when asked and when there is time for it', () => {
    const long = planHeatBlock({ daysToRace: 40, raceWbgtC: 28, athleteNormWbgtC: 18, preferLongRegimen: true });
    expect(long.longRegimen).toBe(true);
    expect(long.exposures).toBeGreaterThan(15);

    const noTime = planHeatBlock({ daysToRace: 14, raceWbgtC: 28, athleteNormWbgtC: 18, preferLongRegimen: true });
    expect(noTime.longRegimen).toBe(false);
  });

  it('an unprescribed block reports no top-up rather than an undefined one', () => {
    const none = planHeatBlock({ daysToRace: 30, raceWbgtC: 19, athleteNormWbgtC: 18 });
    expect(none.prescribed).toBe(false);
    expect(none.topUp.needed).toBe(false);
    expect(none.longRegimen).toBe(false);
  });
});
