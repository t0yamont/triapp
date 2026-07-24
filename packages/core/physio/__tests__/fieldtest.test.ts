import { describe, expect, it } from 'vitest';
import {
  cadenceWeeks,
  nextFieldTest,
  placeFieldTest,
  testDayBlockers,
  type CandidateDay,
  type FieldTestTrigger,
  type TestSchedulingContext,
} from '../plan/fieldtest.js';

const ctx = (over: Partial<TestSchedulingContext> = {}): TestSchedulingContext => ({
  confidence: 0.8,
  weeksSinceLastTest: 0,
  primarySport: 'run',
  ...over,
});

const day = (over: Partial<CandidateDay> = {}): CandidateDay => ({
  dayIndex: 0,
  inRecoveryWeekFirst3Days: false,
  hoursSinceLastHard: 72,
  daysToNextRace: Infinity,
  readinessBand: 'within',
  ...over,
});

describe('Field-test cadence (§12)', () => {
  it('is 8 weeks at high confidence and 6 weeks below it', () => {
    expect(cadenceWeeks(0.75)).toBe(8);
    expect(cadenceWeeks(0.9)).toBe(8);
    expect(cadenceWeeks(0.74)).toBe(6);
    expect(cadenceWeeks(0.4)).toBe(6);
  });
});

describe('Field-test triggers (§12 table, priority order)', () => {
  it('schedules a full battery ~6 weeks before an A race', () => {
    const t = nextFieldTest(ctx({ daysToARace: 40 }));
    expect(t?.test).toBe('full_battery');
    expect(t?.deadlineDayIndex).toBe(30); // 40 − 10-day race blackout
    expect(t?.reasonCode).toBe('FIELD_TEST_PRE_RACE');
  });

  it('does not treat the final 10 days, or races beyond 6 weeks, as a pre-race trigger', () => {
    expect(nextFieldTest(ctx({ daysToARace: 8 }))?.reasonCode).not.toBe('FIELD_TEST_PRE_RACE');
    expect(nextFieldTest(ctx({ daysToARace: 60 }))?.reasonCode).not.toBe('FIELD_TEST_PRE_RACE');
  });

  it('re-anchors within the tier deadline when confidence has dropped', () => {
    const t = nextFieldTest(ctx({ tierTestWithinDays: 5 }));
    expect(t?.test).toBe('lt2');
    expect(t?.sport).toBe('run');
    expect(t?.deadlineDayIndex).toBe(5);
    expect(t?.reasonCode).toBe('FIELD_TEST_CONFIDENCE_TIER');
  });

  it('confirms an apparent fitness change within 10 days rather than upgrading silently (§10.3)', () => {
    const t = nextFieldTest(ctx({ apparentFitnessChange: true }));
    expect(t?.test).toBe('confirmatory');
    expect(t?.deadlineDayIndex).toBe(10);
    expect(t?.reasonCode).toBe('FIELD_TEST_FITNESS_CHANGE');
  });

  it('schedules an LT2 test at a phase transition', () => {
    const t = nextFieldTest(ctx({ phaseTransition: true }));
    expect(t?.test).toBe('lt2');
    expect(t?.deadlineDayIndex).toBe(7);
    expect(t?.reasonCode).toBe('FIELD_TEST_PHASE_TRANSITION');
  });

  it('falls back to routine cadence when nothing else fires', () => {
    expect(nextFieldTest(ctx({ weeksSinceLastTest: 8 }))?.reasonCode).toBe('FIELD_TEST_CADENCE');
    expect(nextFieldTest(ctx({ confidence: 0.6, weeksSinceLastTest: 6 }))?.reasonCode).toBe('FIELD_TEST_CADENCE');
  });

  it('returns nothing when no trigger applies', () => {
    expect(nextFieldTest(ctx({ weeksSinceLastTest: 3 }))).toBeUndefined();
  });

  it('prioritises the pre-race battery over a due cadence test', () => {
    const t = nextFieldTest(ctx({ daysToARace: 35, weeksSinceLastTest: 20 }));
    expect(t?.reasonCode).toBe('FIELD_TEST_PRE_RACE');
  });
});

describe('Field-test placement rules (§12) — the Phase-6 gate', () => {
  it('accepts a clean day and rejects each rule violation', () => {
    expect(testDayBlockers(day())).toEqual([]);
    expect(testDayBlockers(day({ readinessBand: 'above' }))).toEqual([]); // fresh is fine
    expect(testDayBlockers(day({ inRecoveryWeekFirst3Days: true }))).toContain('RECOVERY_WEEK_FIRST_3_DAYS');
    expect(testDayBlockers(day({ hoursSinceLastHard: 24 }))).toContain('WITHIN_48H_OF_HARD');
    expect(testDayBlockers(day({ daysToNextRace: 5 }))).toContain('WITHIN_10_DAYS_OF_RACE');
    expect(testDayBlockers(day({ readinessBand: 'below' }))).toContain('READINESS_NOT_CLEARED');
    expect(testDayBlockers(day({ readinessBand: 'unknown' }))).toContain('READINESS_NOT_CLEARED');
  });

  const trigger: FieldTestTrigger = {
    test: 'lt2',
    sport: 'run',
    deadlineDayIndex: 10,
    reasonCode: 'FIELD_TEST_CADENCE',
    reasonText: 'due',
  };

  it('places the test on the earliest legal day, skipping days that fail a rule', () => {
    const candidates = [
      day({ dayIndex: 1, hoursSinceLastHard: 12 }), // too soon after a hard session
      day({ dayIndex: 2, inRecoveryWeekFirst3Days: true }), // early recovery week
      day({ dayIndex: 3 }), // clean → chosen
      day({ dayIndex: 4 }),
    ];
    const p = placeFieldTest(trigger, candidates);
    expect(p.scheduled).toBe(true);
    expect(p.day?.dayIndex).toBe(3);
    expect(p.reasonCode).toBe('FIELD_TEST_CADENCE');
    expect(p.blockers).toEqual([]);
  });

  it('ignores days after the deadline', () => {
    const p = placeFieldTest({ ...trigger, deadlineDayIndex: 2 }, [day({ dayIndex: 5 })]);
    expect(p.scheduled).toBe(false);
    expect(p.blockers).toEqual(['NO_SLOT_BEFORE_DEADLINE']);
  });

  it('postpones rather than testing on a bad day, and says why the nearest day failed', () => {
    const candidates = [
      day({ dayIndex: 1, readinessBand: 'below', hoursSinceLastHard: 10 }),
      day({ dayIndex: 2, daysToNextRace: 3 }),
    ];
    const p = placeFieldTest(trigger, candidates);
    expect(p.scheduled).toBe(false);
    expect(p.reasonCode).toBe('FIELD_TEST_POSTPONED');
    expect(p.blockers).toEqual(['WITHIN_48H_OF_HARD', 'READINESS_NOT_CLEARED']); // nearest day (dayIndex 1)
    expect(p.reasonText.length).toBeGreaterThan(0);
  });
});
