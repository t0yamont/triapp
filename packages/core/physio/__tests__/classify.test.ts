import { describe, expect, it } from 'vitest';
import f11 from '../../../../supabase/seed/fixtures/F11-distribution-divergence.json' with { type: 'json' };
import {
  sessionGoalDistribution,
  timeInZoneDistribution,
  weekDistribution,
  type ClassifiedSession,
} from '../distribution/classify.js';

const sessions = f11.input.sessions as ClassifiedSession[];

describe('Session classification — both methods (§3.4, F11)', () => {
  it('F11 — the same week reads polarised by goal and pyramidal by time-in-zone', () => {
    const r = weekDistribution(sessions);
    expect(r.sessionGoal).toEqual(f11.expected.sessionGoal); // 80/0/20
    expect(r.timeInZone).toEqual(f11.expected.timeInZone); // 68/24/8
  });

  it('F11 — S2 time-in-zone at 24% does not warn', () => {
    const r = weekDistribution(sessions);
    expect(r.timeInZone.S2).toBe(24);
    expect(r.moderateDrift).toBe(f11.expected.moderateDrift); // false
    expect(r.reasonCode).toBeUndefined();
    expect(r.reasonText).toBeUndefined();
  });

  it('F11 — at 26% it warns with a machine-readable reason and an athlete-readable sentence', () => {
    const r = weekDistribution(f11.warnAt26.sessions as ClassifiedSession[]);
    expect(r.timeInZone.S2).toBe(f11.warnAt26.expected.timeInZoneS2); // 26
    expect(r.moderateDrift).toBe(true);
    expect(r.reasonCode).toBe(f11.warnAt26.expected.reasonCode); // MODERATE_DRIFT
    expect(r.reasonText!.trim().length).toBeGreaterThan(0);
    // The goal view still says polarised — that divergence is the whole point of the check.
    expect(r.sessionGoal).toEqual({ S1: 80, S2: 0, S3: 20 });
  });

  it('percentages always sum to 100 (largest remainder, not naive rounding)', () => {
    // 3 equal sessions → 33.33% each; naive rounding gives 99.
    const thirds: ClassifiedSession[] = [
      { durationMin: 60, goalZone: 'S1' },
      { durationMin: 60, goalZone: 'S2' },
      { durationMin: 60, goalZone: 'S3' },
    ];
    const d = sessionGoalDistribution(thirds);
    expect(d.S1 + d.S2 + d.S3).toBe(100);
    expect([d.S1, d.S2, d.S3].filter((v) => v === 34)).toHaveLength(1); // one zone takes the odd point
  });

  it('ignores sessions without a stream in the time-in-zone view', () => {
    const mixed: ClassifiedSession[] = [
      { durationMin: 60, goalZone: 'S1', timeInZoneS: { S1: 3600, S2: 0, S3: 0 } },
      { durationMin: 60, goalZone: 'S3' }, // no stream — counts for goal, not for time-in-zone
    ];
    expect(sessionGoalDistribution(mixed)).toEqual({ S1: 50, S2: 0, S3: 50 });
    expect(timeInZoneDistribution(mixed)).toEqual({ S1: 100, S2: 0, S3: 0 });
  });

  it('returns zeros for an empty week rather than dividing by zero', () => {
    const r = weekDistribution([]);
    expect(r.sessionGoal).toEqual({ S1: 0, S2: 0, S3: 0 });
    expect(r.timeInZone).toEqual({ S1: 0, S2: 0, S3: 0 });
    expect(r.moderateDrift).toBe(false);
  });
});
