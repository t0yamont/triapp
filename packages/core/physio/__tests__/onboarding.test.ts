import { describe, expect, it } from 'vitest';
import {
  assessPlanWindow,
  assessStartReadiness,
  baselineLongestBySport,
  baselineWeeklyLoad,
  weeksToRace,
  type BaselineAbility,
} from '../plan/onboarding.js';

const base = (over: Partial<BaselineAbility> = {}): BaselineAbility => ({
  sessionsPerWeek: 4,
  typicalWeeklyHours: 6,
  ...over,
});

describe('Baseline → planner inputs', () => {
  it('derives a starting load from hours the athlete can actually state', () => {
    expect(baselineWeeklyLoad(base({ typicalWeeklyHours: 6 }))).toBe(360); // 6 h × 60 × S1 weight
    expect(baselineWeeklyLoad(base({ typicalWeeklyHours: 0 }))).toBe(0);
    expect(baselineWeeklyLoad(base({ typicalWeeklyHours: -3 }))).toBe(0); // nonsense input floors at 0
  });

  it('seeds G2 with the longest session the athlete has actually done', () => {
    expect(baselineLongestBySport(base({ longestRunMin: 45, longestRideMin: 120 }))).toEqual({ run: 45, bike: 120 });
  });

  it('leaves swim out of the G2 seed — a distance cannot become minutes without a known pace', () => {
    expect(baselineLongestBySport(base({ longestSwimM: 1500 }))).toEqual({});
    expect(baselineLongestBySport(base())).toEqual({});
  });
});

describe('Plan window from the race date', () => {
  it('counts whole weeks to race day', () => {
    expect(weeksToRace('2026-08-03', '2026-11-27')).toBe(16);
    expect(weeksToRace('2026-08-03', '2026-08-09')).toBe(0); // less than a week
  });

  it('never returns a negative window for a race in the past', () => {
    expect(weeksToRace('2026-11-27', '2026-08-03')).toBe(0);
  });

  it('accepts a full run-up', () => {
    const w = assessPlanWindow('ironman', 24);
    expect(w.adequacy).toBe('recommended');
    expect(w.recommendedWeeks).toBe(24);
    expect(w.reasonText).toMatch(/full run-up/);
  });

  it('allows a compressed plan but says what it costs', () => {
    const w = assessPlanWindow('70.3', 14); // recommended 20, minimum 12
    expect(w.adequacy).toBe('compressed');
    expect(w.reasonText).toMatch(/workable but tight/);
    expect(w.reasonText).toContain('20');
  });

  it('advises a later race below the minimum', () => {
    const w = assessPlanWindow('ironman', 9);
    expect(w.adequacy).toBe('too_short');
    expect(w.reasonText).toMatch(/not enough/);
    expect(w.minimumWeeks).toBe(16);
  });

  it('scales the window to the event — 8 weeks is plenty for a sprint, not for an Ironman', () => {
    expect(assessPlanWindow('sprint_tri', 8).adequacy).toBe('recommended');
    expect(assessPlanWindow('ironman', 8).adequacy).toBe('too_short');
  });
});

describe('Readiness to start', () => {
  it('clears an athlete who can already cover every leg', () => {
    const r = assessStartReadiness('olympic_tri', base({ longestSwimM: 1000, longestRideMin: 75, longestRunMin: 35 }));
    expect(r.ready).toBe(true);
    expect(r.shortfalls).toEqual([]);
  });

  it('names each shortfall with the gap, and frames it as the plan working', () => {
    const r = assessStartReadiness('olympic_tri', base({ longestSwimM: 400, longestRideMin: 30, longestRunMin: 35 }));
    expect(r.ready).toBe(false);
    expect(r.shortfalls.map((s) => s.sport)).toEqual(['bike', 'swim']);
    expect(r.shortfalls[0]).toEqual({ sport: 'bike', current: 30, required: 60, unit: 'min' });
    expect(r.reasonText).toMatch(/not you being behind/);
  });

  it('treats an unanswered baseline as unknown, never as a deficit', () => {
    expect(assessStartReadiness('ironman', base()).ready).toBe(true);
  });

  it('only checks the legs an event actually has', () => {
    // A marathon has no swim requirement, so a non-swimmer is not held back.
    const r = assessStartReadiness('marathon', base({ longestSwimM: 0, longestRunMin: 80 }));
    expect(r.ready).toBe(true);
  });

  it('flags a run shortfall for a running event', () => {
    const r = assessStartReadiness('marathon', base({ longestRunMin: 40 }));
    expect(r.shortfalls).toEqual([{ sport: 'run', current: 40, required: 75, unit: 'min' }]);
  });
});
