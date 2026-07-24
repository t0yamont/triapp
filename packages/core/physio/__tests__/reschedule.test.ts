import { describe, expect, it } from 'vitest';
import f10 from '../../../../supabase/seed/fixtures/F10-athlete-move.json' with { type: 'json' };
import { isValidWeek, validateWeek } from '../plan/invariants.js';
import { moveSession, type MoveRequest, RESCHEDULE_REASON } from '../plan/reschedule.js';
import type { GuardrailWeek, WeekSession } from '../plan/types.js';

const f10Week = f10.input.week as GuardrailWeek;
const f10Move = f10.input.move as MoveRequest;

/** A hard threshold session on `day`; overridable for building test weeks. */
function hard(day: number, sport: WeekSession['sport'] = 'run', p: Partial<WeekSession> = {}): WeekSession {
  return { dayOfWeek: day, sport, sZone: 'S2', purpose: 'threshold', durationMin: 60, load: 120, isHard: true, ...p };
}
function easy(day: number, sport: WeekSession['sport'] = 'swim'): WeekSession {
  return { dayOfWeek: day, sport, sZone: 'S1', purpose: 'aerobic_volume', durationMin: 45, load: 45, isHard: false };
}
const week = (sessions: WeekSession[], over: Partial<GuardrailWeek> = {}): GuardrailWeek => ({
  phase: 'build',
  isRecoveryWeek: false,
  hoursCeiling: 12,
  sessions,
  ...over,
});

const dayOf = (r: { week: GuardrailWeek }, sport: string): number | undefined =>
  r.week.sessions.find((s) => s.sport === sport)?.dayOfWeek;
const dayOfPurpose = (r: { week: GuardrailWeek }, purpose: string): number | undefined =>
  r.week.sessions.find((s) => s.purpose === purpose)?.dayOfWeek;

describe('Athlete move + week repair (§8.4, F10)', () => {
  it('starts from a guardrail-valid week (sanity)', () => {
    expect(isValidWeek(f10Week)).toBe(true);
  });

  it('F10 — moving the threshold run onto the long-ride day relocates the long ride and says so', () => {
    const r = moveSession(f10Week, f10Move);

    expect(r.changed).toBe(f10.expected.changed);
    expect(r.mutation!.reasonCode).toBe(f10.expected.reasonCode); // ATHLETE_MOVE_REPAIRED
    expect(dayOfPurpose(r, 'threshold')).toBe(f10.expected.runOnDay); // athlete's intent honoured — run on Friday
    expect(dayOfPurpose(r, 'durability')).toBe(f10.expected.longRideMovedToDay); // long ride shifted to Thursday
    expect(r.remainingViolations).toHaveLength(f10.expected.remainingViolations); // 0
    expect(isValidWeek(r.week)).toBe(true);

    // Two edits: the athlete's own drag, then the engine's repair — reported explicitly (06-UX).
    expect(r.edits).toEqual([
      { sport: 'run', fromDay: 4, toDay: 5, byEngine: false },
      { sport: 'bike', fromDay: 5, toDay: 4, byEngine: true },
    ]);
    // I13 — one audited, athlete-readable mutation naming what moved.
    expect(r.mutation!.actor).toBe('athlete');
    expect(r.mutation!.ruleId).toBe('G5');
    expect(r.message).toMatch(/Thursday/);
    expect(r.mutation!.reasonText.trim().length).toBeGreaterThan(0);
  });

  it('is pure — repeated calls are deep-equal and the input week is untouched (I16)', () => {
    const a = moveSession(f10Week, f10Move);
    const b = moveSession(f10Week, f10Move);
    expect(a).toEqual(b);
    expect(f10Week.sessions.find((s) => s.purpose === 'threshold')!.dayOfWeek).toBe(4); // input unmutated
  });

  it('applies a clean move untouched when it breaks nothing (easy session to an empty day)', () => {
    const r = moveSession(f10Week, { fromDay: 6, toDay: 0 }); // swim Sat → Sun, no sport filter
    expect(r.changed).toBe(true);
    expect(r.mutation!.reasonCode).toBe(RESCHEDULE_REASON.APPLIED);
    expect(r.edits).toEqual([{ sport: 'swim', fromDay: 6, toDay: 0, byEngine: false }]);
    expect(r.remainingViolations).toHaveLength(0);
    expect(dayOf(r, 'swim')).toBe(0);
  });

  it('relocates the moved session itself when the move alone breaks G5 (no stacked partner)', () => {
    // Mon+Tue hard, Sat hard; drag Sat hard → Wed makes Mon-Tue-Wed three in a row.
    const w = week([hard(1, 'run'), hard(2, 'bike'), easy(3, 'swim'), hard(6, 'run', { sport: 'run' })]);
    const r = moveSession(w, { fromDay: 6, toDay: 3, sport: 'run' });
    expect(r.mutation!.reasonCode).toBe(RESCHEDULE_REASON.REPAIRED);
    expect(isValidWeek(r.week)).toBe(true);
    expect(r.remainingViolations).toHaveLength(0);
    // Only Saturday is a valid home, so the engine keeps it there and tells the athlete.
    expect(r.week.sessions.filter((s) => s.dayOfWeek === 3 && s.isHard)).toHaveLength(0);
    expect(r.edits[1]).toEqual({ sport: 'run', fromDay: 3, toDay: 6, byEngine: true });
  });

  it('rejects a nearer landing day that would stack three hard days and picks a valid one', () => {
    // src hard Thu, long-ride hard Fri, extra hard Sun. Thursday is not offered, so the
    // search tries Saturday first (Fri-Sat-Sun = 3 hard → G5) and must fall back to Monday.
    const w = week([
      hard(4, 'run'),
      hard(5, 'bike', { sport: 'bike', purpose: 'durability', durationMin: 240, load: 240 }),
      hard(0, 'run', { load: 90, durationMin: 45 }),
    ]);
    const r = moveSession(w, { fromDay: 4, toDay: 5, sport: 'run' }, { weekStartDay: 1, availableDays: [1, 5, 6, 0] });
    expect(r.mutation!.reasonCode).toBe(RESCHEDULE_REASON.REPAIRED);
    expect(dayOf(r, 'bike')).toBe(1); // Monday, not Saturday
    expect(isValidWeek(r.week)).toBe(true);

    // Prove the rejected day really was invalid: Saturday would breach G5.
    const wouldStack = week([hard(5, 'run'), hard(6, 'bike'), hard(0, 'run')]);
    expect(validateWeek(wouldStack).some((v) => v.code === 'G5_CONSECUTIVE_HARD_DAYS')).toBe(true);
  });

  it('leaves the move applied but flags the breach when nothing can be rebalanced', () => {
    // Only Friday is available, so the stacked long ride has nowhere legal to go.
    const r = moveSession(f10Week, { fromDay: 4, toDay: 5, sport: 'run' }, { availableDays: [5] });
    expect(r.changed).toBe(true);
    expect(r.mutation!.reasonCode).toBe(RESCHEDULE_REASON.UNRESOLVED);
    expect(r.remainingViolations.map((v) => v.code)).toContain('G5_STACKED_HARD');
    expect(r.message).toMatch(/couldn't rebalance/);
  });

  it('is a no-op when there is nothing to move or the target equals the source', () => {
    const noSuch = moveSession(f10Week, { fromDay: 4, toDay: 2, sport: 'swim' }); // no swim on Thursday
    expect(noSuch.changed).toBe(false);
    expect(noSuch.mutation).toBeUndefined();
    expect(noSuch.message).toMatch(/No swim scheduled/);

    const emptyDay = moveSession(f10Week, { fromDay: 2, toDay: 5 }); // Tuesday is a rest day
    expect(emptyDay.changed).toBe(false);
    expect(emptyDay.message).toMatch(/No session scheduled on Tuesday/);

    const samize = moveSession(f10Week, { fromDay: 1, toDay: 1 });
    expect(samize.changed).toBe(false);
    expect(samize.message).toMatch(/already on Monday/);
  });
});
