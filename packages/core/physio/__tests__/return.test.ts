import { describe, expect, it } from 'vitest';
import { illnessRestriction, returnToTraining, type ReturnInput } from '../readiness/return.js';

describe('Illness restriction (§10.4)', () => {
  it('does nothing when the athlete is not symptomatic', () => {
    const r = illnessRestriction({ symptomatic: false, aboveNeckOnly: false, fever: false });
    expect(r.active).toBe(false);
    expect(r.ceiling).toBe('S3');
    expect(r.mutation).toBeUndefined();
  });

  it('permits gentle S1 at ~60% for above-the-neck symptoms without fever', () => {
    const r = illnessRestriction({ symptomatic: true, aboveNeckOnly: true, fever: false });
    expect(r.active).toBe(true);
    expect(r.ceiling).toBe('S1');
    expect(r.volumeFraction).toBe(0.6);
    expect(r.seekAdvice).toBe(false);
    expect(r.mutation!.reasonCode).toBe('ILLNESS_ABOVE_NECK');
    expect(r.mutation!.reasonText.length).toBeGreaterThan(0);
  });

  it('prescribes rest and a professional-opinion nudge with a fever', () => {
    const r = illnessRestriction({ symptomatic: true, aboveNeckOnly: true, fever: true });
    expect(r.ceiling).toBe('rest');
    expect(r.volumeFraction).toBe(0);
    expect(r.seekAdvice).toBe(true);
    expect(r.mutation!.reasonCode).toBe('ILLNESS_SYSTEMIC');
  });

  it('prescribes rest for systemic (below-the-neck) symptoms even without fever', () => {
    const r = illnessRestriction({ symptomatic: true, aboveNeckOnly: false, fever: false });
    expect(r.ceiling).toBe('rest');
    expect(r.seekAdvice).toBe(true);
  });
});

describe('Return-to-training ladder (§10.4)', () => {
  const input = (over: Partial<ReturnInput>): ReturnInput => ({
    daysMissed: 5,
    dayInReturn: 1,
    recentReadinessInBand: [],
    ...over,
  });

  it('does not restrict a short (<3 day) gap', () => {
    expect(returnToTraining(input({ daysMissed: 2, dayInReturn: 1 })).active).toBe(false);
  });

  it('ends once the athlete climbs past the last rung', () => {
    // 5 days missed → a 5-day ladder; day 6 is back to normal.
    expect(returnToTraining(input({ daysMissed: 5, dayInReturn: 6 })).active).toBe(false);
  });

  it('caps the ladder at 10 days however long the layoff', () => {
    const r = returnToTraining(input({ daysMissed: 30, dayInReturn: 10, recentReadinessInBand: [true, true] }));
    expect(r.active).toBe(true);
    expect(r.message).toMatch(/\/10:/); // ladderDays capped at 10
  });

  it('holds days 1–2 to S1 only', () => {
    expect(returnToTraining(input({ dayInReturn: 1 })).ceiling).toBe('S1');
    const d2 = returnToTraining(input({ dayInReturn: 2 }));
    expect(d2.ceiling).toBe('S1');
    expect(d2.volumeFraction).toBe(1);
    expect(d2.mutation!.reasonCode).toBe('RETURN_LADDER_S1');
  });

  it('reintroduces S2 at 50% before readiness has held for two days', () => {
    // Not enough in-band history yet (length < 2) → still S2.
    const short = returnToTraining(input({ dayInReturn: 3, recentReadinessInBand: [true] }));
    expect(short.ceiling).toBe('S2');
    expect(short.volumeFraction).toBe(0.5);
    expect(short.mutation!.reasonCode).toBe('RETURN_LADDER_S2');

    // Two days of history but the latest is out of band → still S2.
    const broken = returnToTraining(input({ dayInReturn: 4, recentReadinessInBand: [true, false] }));
    expect(broken.ceiling).toBe('S2');
  });

  it('clears S3 only after two consecutive in-band readiness days', () => {
    const r = returnToTraining(input({ dayInReturn: 4, recentReadinessInBand: [false, true, true] }));
    expect(r.ceiling).toBe('S3');
    expect(r.volumeFraction).toBe(1);
    expect(r.mutation!.reasonCode).toBe('RETURN_LADDER_S3_CLEARED');
  });
});
