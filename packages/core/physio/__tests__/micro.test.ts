import { describe, expect, it } from 'vitest';
import { validateWeek } from '../plan/invariants.js';
import { constructMicrocycle, type Availability } from '../plan/micro.js';

const avail: Availability = {
  dayMinutes: { 1: 60, 2: 60, 3: 90, 4: 60, 5: 60, 6: 180 },
  weeklyHoursMax: 14,
  longRideDay: 6,
  swimDays: [4],
};

/** These cases are about placement, not §2.4 — a fully-anchored athlete keeps S3 on the table. */
const WELL_ANCHORED = 0.8;

const restDaysOf = (a: Availability, sessionDays: number[]) =>
  Object.keys(a.dayMinutes).map(Number).filter((d) => !sessionDays.includes(d));

describe('Microcycle construction (§8.4)', () => {
  it('builds a guardrail-valid week that respects availability (I17, I18)', () => {
    const wk = constructMicrocycle({ confidence: WELL_ANCHORED, phase: 'build', isRecoveryWeek: false, loadTarget: 600, availability: avail });
    expect(validateWeek(wk)).toEqual([]);
    // exactly one quality (S3) session
    expect(wk.sessions.filter((s) => s.isHard)).toHaveLength(1);
    // I18 — never a session on an unavailable day
    expect(wk.sessions.every((s) => (avail.dayMinutes[s.dayOfWeek] ?? 0) > 0)).toBe(true);
    // I17 — at least one rest day
    const sessionDays = wk.sessions.map((s) => s.dayOfWeek);
    expect(restDaysOf(avail, sessionDays).length).toBeGreaterThanOrEqual(1);
    // long ride placed on day 6 as bike; swim placed on day 4
    expect(wk.sessions.find((s) => s.dayOfWeek === 6)?.sport).toBe('bike');
    expect(wk.sessions.find((s) => s.dayOfWeek === 4)?.sport).toBe('swim');
  });

  it('a recovery week has no S3, two rest days, and lands in the 55–70% band', () => {
    const wk = constructMicrocycle({
      confidence: WELL_ANCHORED,
      phase: 'recovery',
      isRecoveryWeek: true,
      loadTarget: 300,
      availability: avail,
      priorWeekLoad: 450,
    });
    expect(validateWeek(wk)).toEqual([]); // includes the G4 recovery-range check
    expect(wk.sessions.some((s) => s.isHard)).toBe(false);
    const sessionDays = wk.sessions.map((s) => s.dayOfWeek);
    expect(restDaysOf(avail, sessionDays).length).toBeGreaterThanOrEqual(2);
  });

  it('trims S3 under the stricter Base cap (8%)', () => {
    const wk = constructMicrocycle({ confidence: WELL_ANCHORED, phase: 'base', isRecoveryWeek: false, loadTarget: 600, availability: avail });
    expect(validateWeek(wk)).toEqual([]);
    const total = wk.sessions.reduce((a, s) => a + s.durationMin, 0);
    const s3 = wk.sessions.filter((s) => s.sZone === 'S3').reduce((a, s) => a + s.durationMin, 0);
    expect(s3 / total).toBeLessThanOrEqual(0.08);
  });

  it('never exceeds the weekly hour ceiling, dropping sessions if it must (G10)', () => {
    const wk = constructMicrocycle({
      confidence: WELL_ANCHORED,
      phase: 'build',
      isRecoveryWeek: false,
      loadTarget: 600,
      availability: { ...avail, weeklyHoursMax: 3 },
    });
    expect(validateWeek(wk)).toEqual([]);
    expect(wk.sessions.reduce((a, s) => a + s.durationMin, 0) / 60).toBeLessThanOrEqual(3);
  });

  it('works with no declared long day and no swim days', () => {
    const wk = constructMicrocycle({
      confidence: WELL_ANCHORED,
      phase: 'build',
      isRecoveryWeek: false,
      loadTarget: 600,
      availability: { dayMinutes: { 1: 60, 2: 90, 3: 60 }, weeklyHoursMax: 10 },
    });
    expect(validateWeek(wk)).toEqual([]);
    expect(wk.sessions.every((s) => s.sport === 'run')).toBe(true);
  });

  it('handles a minimal week where the only session day is the long day', () => {
    const wk = constructMicrocycle({
      confidence: WELL_ANCHORED,
      phase: 'build',
      isRecoveryWeek: false,
      loadTarget: 300,
      availability: { dayMinutes: { 5: 60, 6: 180 }, weeklyHoursMax: 10, longRideDay: 6 },
    });
    expect(validateWeek(wk)).toEqual([]);
    expect(wk.sessions.some((s) => s.isHard)).toBe(false); // no room for a separate quality day
  });
});
