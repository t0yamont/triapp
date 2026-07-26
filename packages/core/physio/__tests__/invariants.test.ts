import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import f8 from '../../../../supabase/seed/fixtures/F8-ramp-guardrail.json' with { type: 'json' };
import {
  applyRampCap,
  consecutiveHardDays,
  dailyLoads,
  isValidWeek,
  longestBySport,
  monotony,
  rampCap,
  strain,
  s3TimeFraction,
  validateWeek,
  weekLoad,
  weeklyHours,
} from '../plan/invariants.js';
import type { GuardrailWeek, WeekSession } from '../plan/types.js';

function session(p: Partial<WeekSession> & Pick<WeekSession, 'dayOfWeek'>): WeekSession {
  return { sport: 'run', sZone: 'S1', purpose: 'aerobic_volume', durationMin: 60, load: 50, isHard: false, ...p };
}

describe('Ramp guardrail G1 (§5.3, F8)', () => {
  it('F8 — a +18% request is capped to +8% with a reason code', () => {
    const r = applyRampCap(f8.input.requestedLoad, f8.input.rolling3wkMean, f8.input.confidence, f8.input.trainingAgeYears);
    expect(r.load).toBeCloseTo(f8.expected.cappedLoad, 6); // 108
    expect(r.capped).toBe(true);
    expect(r.capPct).toBe(f8.expected.capPct); // 0.08
    expect(r.reasonCode).toBe(f8.expected.reasonCode); // RAMP_CAP_APPLIED
  });

  it('F8 — low confidence caps at +5%', () => {
    const r = applyRampCap(118, 100, f8.lowConfidence.confidence, 3);
    expect(r.load).toBeCloseTo(f8.lowConfidence.cappedLoad, 6); // 105
    expect(r.capPct).toBe(f8.lowConfidence.capPct); // 0.05
  });

  it('F8 — a novice caps at +4%', () => {
    const r = applyRampCap(118, 100, 0.8, f8.novice.trainingAgeYears);
    expect(r.load).toBeCloseTo(f8.novice.cappedLoad, 6); // 104
    expect(r.capPct).toBe(f8.novice.capPct); // 0.04
  });

  it('leaves a within-cap request unchanged', () => {
    const r = applyRampCap(105, 100, 0.8, 3);
    expect(r.capped).toBe(false);
    expect(r.load).toBe(105);
    expect(r.reasonCode).toBeUndefined();
  });

  it('rampCap orders novice below low-confidence below default', () => {
    expect(rampCap(0.8, 3)).toBe(0.08);
    expect(rampCap(0.4, 3)).toBe(0.05);
    expect(rampCap(0.4, 0.5)).toBe(0.04); // novice wins even at low confidence
  });

  it('I5 — the ramped load never exceeds the applicable cap over the rolling mean', () => {
    fc.assert(
      fc.property(
        fc.record({
          requested: fc.double({ min: 0, max: 500, noNaN: true }),
          rolling: fc.double({ min: 1, max: 300, noNaN: true }),
          confidence: fc.double({ min: 0, max: 1, noNaN: true }),
          age: fc.double({ min: 0, max: 10, noNaN: true }),
        }),
        ({ requested, rolling, confidence, age }) => {
          const r = applyRampCap(requested, rolling, confidence, age);
          expect(r.load).toBeLessThanOrEqual(rolling * (1 + rampCap(confidence, age)) + 1e-9);
        },
      ),
    );
  });
});

describe('Week measures', () => {
  it('dailyLoads / weekLoad / weeklyHours', () => {
    const sessions = [session({ dayOfWeek: 1, load: 40, durationMin: 60 }), session({ dayOfWeek: 1, load: 30, durationMin: 30 })];
    expect(dailyLoads(sessions)[1]).toBe(70);
    expect(weekLoad(sessions)).toBe(70);
    expect(weeklyHours(sessions)).toBeCloseTo(1.5, 6);
  });

  it('s3TimeFraction handles empty and mixed weeks', () => {
    expect(s3TimeFraction([])).toBe(0);
    const mixed = [session({ dayOfWeek: 2, sZone: 'S1', durationMin: 90 }), session({ dayOfWeek: 4, sZone: 'S3', durationMin: 10 })];
    expect(s3TimeFraction(mixed)).toBeCloseTo(0.1, 6);
  });

  it('consecutiveHardDays counts Saturday→Sunday as consecutive (Monday-start week)', () => {
    const week = [session({ dayOfWeek: 6, isHard: true }), session({ dayOfWeek: 0, isHard: true })];
    expect(consecutiveHardDays(week)).toBe(2);
    const three = [
      session({ dayOfWeek: 3, isHard: true }),
      session({ dayOfWeek: 4, isHard: true }),
      session({ dayOfWeek: 5, isHard: true }),
    ];
    expect(consecutiveHardDays(three)).toBe(3);
    expect(consecutiveHardDays([session({ dayOfWeek: 2 })])).toBe(0);
  });

  it('monotony returns Infinity for a perfectly flat week', () => {
    expect(monotony([50, 50, 50, 50, 50, 50, 50])).toBe(Infinity);
    expect(monotony([100, 0, 80, 0, 60, 0, 0])).toBeGreaterThan(0);
  });
});

describe('validateWeek — guardrails G4/G5/G6/G7/G10', () => {
  const base = (over: Partial<GuardrailWeek> = {}): GuardrailWeek => ({
    phase: 'build',
    isRecoveryWeek: false,
    hoursCeiling: 12,
    sessions: [
      session({ dayOfWeek: 1, durationMin: 60, load: 50 }),
      session({ dayOfWeek: 3, durationMin: 20, load: 50, isHard: true, sZone: 'S3' }), // ~7% S3
      session({ dayOfWeek: 5, durationMin: 120, load: 80 }),
      session({ dayOfWeek: 6, durationMin: 90, load: 60 }),
    ],
    ...over,
  });

  it('a well-formed week has no violations', () => {
    expect(validateWeek(base())).toEqual([]);
    expect(isValidWeek(base())).toBe(true);
  });

  it('I6/G5 — flags 3 consecutive hard days', () => {
    const week = base({
      sessions: [
        session({ dayOfWeek: 2, isHard: true }),
        session({ dayOfWeek: 3, isHard: true }),
        session({ dayOfWeek: 4, isHard: true }),
      ],
    });
    expect(validateWeek(week).map((v) => v.code)).toContain('G5_CONSECUTIVE_HARD_DAYS');
  });

  it('I11/G6 — flags excess S3 time, stricter in Base', () => {
    // 20/100 = 20% S3 time > 10% build cap → flagged
    const s3heavy = base({
      sessions: [session({ dayOfWeek: 1, sZone: 'S1', durationMin: 80 }), session({ dayOfWeek: 3, sZone: 'S3', durationMin: 20 })],
    });
    expect(validateWeek(s3heavy).some((v) => v.code === 'G6_S3_VOLUME')).toBe(true);
    // 9% is fine in build but not in Base (8% cap)
    const nine = base({
      phase: 'base',
      sessions: [session({ dayOfWeek: 1, sZone: 'S1', durationMin: 91 }), session({ dayOfWeek: 3, sZone: 'S3', durationMin: 9 })],
    });
    expect(validateWeek(nine).some((v) => v.code === 'G6_S3_VOLUME')).toBe(true);
  });

  it('I7/G10 — flags exceeding the weekly hour ceiling', () => {
    const week = base({ hoursCeiling: 2 });
    expect(validateWeek(week).some((v) => v.code === 'G10_HOURS_CEILING')).toBe(true);
  });

  it('I10/G4 — flags a recovery week outside 55–70% of the prior week', () => {
    // recovery load 200; prior 300 → 66.7% (ok); prior 500 → 40% (too low)
    const recSessions = [session({ dayOfWeek: 1, load: 100, durationMin: 60 }), session({ dayOfWeek: 4, load: 100, durationMin: 60 })];
    expect(validateWeek(base({ isRecoveryWeek: true, priorWeekLoad: 300, sessions: recSessions }))).toEqual([]);
    expect(
      validateWeek(base({ isRecoveryWeek: true, priorWeekLoad: 500, sessions: recSessions })).some((v) => v.code === 'G4_RECOVERY_LOAD'),
    ).toBe(true);
    // too high: prior 250 → 80%
    expect(
      validateWeek(base({ isRecoveryWeek: true, priorWeekLoad: 250, sessions: recSessions })).some((v) => v.code === 'G4_RECOVERY_LOAD'),
    ).toBe(true);
    // recovery flag but no prior load supplied → not checked
    expect(validateWeek(base({ isRecoveryWeek: true, sessions: recSessions }))).toEqual([]);
  });

  it('G7 — flags an over-monotonous week', () => {
    const flat = base({
      hoursCeiling: 100,
      sessions: [0, 1, 2, 3, 4, 5, 6].map((d) => session({ dayOfWeek: d, load: 50, durationMin: 30 })),
    });
    expect(validateWeek(flat).some((v) => v.code === 'G7_MONOTONY')).toBe(true);
  });

  const hasCode = (w: GuardrailWeek, code: string) => validateWeek(w).some((v) => v.code === code);

  it('G2 — caps longest-session growth at +10% or +15 min, whichever is smaller', () => {
    const w = (min: number) => base({ sessions: [session({ dayOfWeek: 6, sport: 'run', durationMin: min, load: 100 })] });
    // prior 100 min → cap is +10 min (10% < 15 min)
    expect(hasCode(w(110), 'G2_LONG_SESSION_GROWTH')).toBe(false);
    expect(hasCode({ ...w(111), priorLongestBySport: { run: 100 } }, 'G2_LONG_SESSION_GROWTH')).toBe(true);
    expect(hasCode({ ...w(110), priorLongestBySport: { run: 100 } }, 'G2_LONG_SESSION_GROWTH')).toBe(false);
    // prior 300 min → 10% is 30, so the +15 min cap binds instead
    expect(hasCode({ ...w(316), priorLongestBySport: { run: 300 } }, 'G2_LONG_SESSION_GROWTH')).toBe(true);
    expect(hasCode({ ...w(315), priorLongestBySport: { run: 300 } }, 'G2_LONG_SESSION_GROWTH')).toBe(false);
    // a sport with no prior longest is not checked
    expect(hasCode({ ...w(400), priorLongestBySport: { bike: 60 } }, 'G2_LONG_SESSION_GROWTH')).toBe(false);
  });

  it('G8 — flags strain above 1.5× the athlete\'s 12-week mean', () => {
    const w = base({ sessions: [session({ dayOfWeek: 1, load: 100, durationMin: 60 })] });
    const s = strain(dailyLoads(w.sessions));
    expect(hasCode({ ...w, strainRollingMean: s / 2 }, 'G8_STRAIN')).toBe(true); // 2× the mean
    expect(hasCode({ ...w, strainRollingMean: s }, 'G8_STRAIN')).toBe(false); // at the mean
    expect(hasCode({ ...w, strainRollingMean: 0 }, 'G8_STRAIN')).toBe(false); // no history yet
    expect(hasCode(w, 'G8_STRAIN')).toBe(false); // not supplied
  });

  it('G9 — no S3 inside the post-race recovery window (race hours, min 2 days)', () => {
    const s3On = (day: number) => base({ sessions: [session({ dayOfWeek: day, sZone: 'S3', durationMin: 20, load: 60, isHard: true })] });
    // A 10-hour race → 10 recovery days. Monday (offset 0) is day 1 after the race.
    expect(hasCode({ ...s3On(1), daysSinceRace: 1, raceDurationH: 10 }, 'G9_POST_RACE_RECOVERY')).toBe(true);
    expect(hasCode({ ...s3On(1), daysSinceRace: 10, raceDurationH: 10 }, 'G9_POST_RACE_RECOVERY')).toBe(false);
    // A short race still earns the 2-day floor.
    expect(hasCode({ ...s3On(1), daysSinceRace: 1, raceDurationH: 0.5 }, 'G9_POST_RACE_RECOVERY')).toBe(true);
    expect(hasCode({ ...s3On(3), daysSinceRace: 1, raceDurationH: 0.5 }, 'G9_POST_RACE_RECOVERY')).toBe(false); // Wed → 3 days
    // Easy sessions inside the window are fine, and the check is skipped without race context.
    const easy = base({ sessions: [session({ dayOfWeek: 1, sZone: 'S1', durationMin: 40, load: 40 })] });
    expect(hasCode({ ...easy, daysSinceRace: 1, raceDurationH: 10 }, 'G9_POST_RACE_RECOVERY')).toBe(false);
    expect(hasCode(s3On(1), 'G9_POST_RACE_RECOVERY')).toBe(false);
  });
});

describe('Strain and longest-session helpers (§5.3)', () => {
  it('strain is weekly load × monotony', () => {
    const daily = [0, 100, 0, 50, 0, 0, 0];
    expect(strain(daily)).toBeCloseTo(150 * monotony(daily), 6);
  });

  it('longestBySport takes the longest session per sport', () => {
    expect(
      longestBySport([
        session({ dayOfWeek: 1, sport: 'run', durationMin: 45 }),
        session({ dayOfWeek: 2, sport: 'run', durationMin: 90 }),
        session({ dayOfWeek: 3, sport: 'bike', durationMin: 200 }),
      ]),
    ).toEqual({ run: 90, bike: 200 });
  });
});
