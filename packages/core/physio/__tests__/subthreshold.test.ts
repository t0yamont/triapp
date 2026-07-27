import { describe, expect, it } from 'vitest';
import {
  planSubThresholdSplit,
  splitSessions,
  SPLIT_HALF_MAX_SZONE,
  type SplitContext,
} from '../sessions/subthreshold.js';
import { constructMicrocycle } from '../plan/micro.js';

/** An athlete who clears every §7.2b gate. Individual tests break one at a time. */
const ELIGIBLE: SplitContext = {
  weeklyS2Min: 120,
  doublesDeclared: true,
  maxSameDayGapHours: 6.5,
  confidence: 0.8,
  trainingAgeYears: 5,
  weeklyHours: 14,
  phase: 'build',
  isLongCourse: false,
};

describe('planSubThresholdSplit — the §7.2b gates', () => {
  it('permits a split for an athlete who clears every gate', () => {
    const d = planSubThresholdSplit(ELIGIBLE);
    expect(d.permitted).toBe(true);
    expect(d.refusals).toEqual([]);
  });

  // The finding this whole rule rests on: the single long session produced the LARGER stimulus;
  // the split only bought a lower cost. Splitting the same volume is strictly worse, so the
  // volume increase is part of the permission rather than advice.
  it('requires a volume increase, and splits the increased total — never the original halved', () => {
    const d = planSubThresholdSplit(ELIGIBLE);
    expect(d.requiredVolumeIncreasePct).toBeCloseTo(0.15);
    // 120 → 138 total, so 69 per half — each half is MORE than a naive 60.
    expect(d.halfDurationMin).toBe(69);
    expect(d.halfDurationMin * 2).toBeGreaterThan(ELIGIBLE.weeklyS2Min);
  });

  it.each([
    ['WEEKLY_S2_TOO_LOW', { weeklyS2Min: 45 }],
    ['DOUBLES_NOT_AVAILABLE', { doublesDeclared: false }],
    ['NO_DOUBLE_SLOT', { maxSameDayGapHours: 3 }],
    ['CONFIDENCE_TOO_LOW', { confidence: 0.4 }],
    ['TRAINING_AGE_TOO_LOW', { trainingAgeYears: 1 }],
    ['WEEKLY_VOLUME_TOO_LOW', { weeklyHours: 6 }],
  ] as const)('refuses with %s', (code, override) => {
    const d = planSubThresholdSplit({ ...ELIGIBLE, ...override });
    expect(d.permitted).toBe(false);
    expect(d.refusals).toContain(code);
    expect(d.halfDurationMin).toBe(0);
    expect(d.requiredVolumeIncreasePct).toBe(0);
  });

  // A preference, not a safety limit: the drift a split day avoids is exactly the race-day
  // durability stimulus a long-course athlete is peaking for (§11).
  it('prefers the single long session for a long-course athlete in Peak', () => {
    const d = planSubThresholdSplit({ ...ELIGIBLE, isLongCourse: true, phase: 'peak' });
    expect(d.refusals).toContain('LONG_COURSE_PEAK');
  });

  it('allows the same long-course athlete to split in Build', () => {
    expect(planSubThresholdSplit({ ...ELIGIBLE, isLongCourse: true, phase: 'build' }).permitted).toBe(true);
  });

  it('reports every failing gate, not just the first', () => {
    const d = planSubThresholdSplit({ ...ELIGIBLE, confidence: 0.2, trainingAgeYears: 0, weeklyHours: 4 });
    expect(d.refusals).toEqual(
      expect.arrayContaining(['CONFIDENCE_TOO_LOW', 'TRAINING_AGE_TOO_LOW', 'WEEKLY_VOLUME_TOO_LOW']),
    );
    // An athlete one condition away from doubling should be able to see which one.
    expect(d.reasonText.length).toBeGreaterThan(0);
  });

  it('treats exactly the boundary values as not yet qualifying', () => {
    expect(planSubThresholdSplit({ ...ELIGIBLE, weeklyS2Min: 60 }).permitted).toBe(false);
    expect(planSubThresholdSplit({ ...ELIGIBLE, maxSameDayGapHours: 5 }).permitted).toBe(true);
    expect(planSubThresholdSplit({ ...ELIGIBLE, confidence: 0.6 }).permitted).toBe(true);
  });
});

describe('splitSessions', () => {
  it('materialises two halves on the same day', () => {
    const halves = splitSessions(planSubThresholdSplit(ELIGIBLE), 'run', 3);
    expect(halves).toHaveLength(2);
    expect(halves.map((h) => h.half)).toEqual([1, 2]);
    expect(halves.every((h) => h.dayOfWeek === 3 && h.sport === 'run')).toBe(true);
  });

  it('materialises nothing when the split was refused', () => {
    expect(splitSessions(planSubThresholdSplit({ ...ELIGIBLE, confidence: 0.1 }), 'run', 3)).toEqual([]);
  });
});

describe('§7.2b in the planner', () => {
  const availability = {
    dayMinutes: { 0: 240, 1: 60, 2: 90, 3: 75, 4: 90, 5: 45, 6: 240 },
    weeklyHoursMax: 14,
    longRideDay: 6,
    longRunDay: 0,
    swimDays: [2],
  };
  const base = {
    phase: 'build' as const,
    isRecoveryWeek: false,
    loadTarget: 900,
    confidence: 0.8,
    trainingAgeYears: 5,
    course: 'short' as const,
  };

  it('leaves a plan untouched for an athlete who has not declared doubles', () => {
    const week = constructMicrocycle({ ...base, availability });
    expect(week.sessions.some((s) => s.sZone === 'S2')).toBe(false);
  });

  it('places two sub-threshold halves on one day once the athlete opts in', () => {
    const week = constructMicrocycle({
      ...base,
      availability: { ...availability, doublesDeclared: true, maxSameDayGapHours: 6 },
    });
    const s2 = week.sessions.filter((s) => s.sZone === SPLIT_HALF_MAX_SZONE);
    expect(s2).toHaveLength(2);
    expect(s2[0]!.dayOfWeek).toBe(s2[1]!.dayOfWeek);
    // Capped at the sub-threshold target, never at LT2 — the documented dominant error.
    expect(s2.every((s) => s.sZone === 'S2' && !s.isHard)).toBe(true);
    expect(s2.every((s) => s.purpose === 'threshold')).toBe(true);
  });

  it('never splits the long session or the quality session', () => {
    const week = constructMicrocycle({
      ...base,
      availability: { ...availability, doublesDeclared: true, maxSameDayGapHours: 6 },
    });
    const s2Day = week.sessions.find((s) => s.sZone === 'S2')!.dayOfWeek;
    expect(s2Day).not.toBe(availability.longRideDay);
    expect(week.sessions.find((s) => s.sZone === 'S3')?.dayOfWeek).not.toBe(s2Day);
  });

  it('does not split in a recovery week — that is what makes it recovery', () => {
    const week = constructMicrocycle({
      ...base,
      isRecoveryWeek: true,
      availability: { ...availability, doublesDeclared: true, maxSameDayGapHours: 6 },
    });
    expect(week.sessions.some((s) => s.sZone === 'S2')).toBe(false);
  });

  it('does not split for a novice, however available they are', () => {
    const week = constructMicrocycle({
      ...base,
      trainingAgeYears: 0,
      availability: { ...availability, doublesDeclared: true, maxSameDayGapHours: 8 },
    });
    expect(week.sessions.some((s) => s.sZone === 'S2')).toBe(false);
  });
});
