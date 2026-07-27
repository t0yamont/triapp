import { describe, expect, it } from 'vitest';
import {
  COMPLETION_MATCH_WINDOW_DAYS,
  matchActivityToWorkout,
  type CompletableWorkout,
  type CompletedActivity,
} from '../plan/completion.js';

const TUE = '2026-07-21';
const WED = '2026-07-22';
const THU = '2026-07-23';
const SAT = '2026-07-25';

const workout = (over: Partial<CompletableWorkout> = {}): CompletableWorkout => ({
  id: 'w1',
  scheduledDate: WED,
  sport: 'run',
  plannedDurationMin: 60,
  completed: false,
  ...over,
});

const activity = (over: Partial<CompletedActivity> = {}): CompletedActivity => ({
  localDate: WED,
  sport: 'run',
  durationMin: 60,
  ...over,
});

describe('matchActivityToWorkout', () => {
  it('matches the same sport on the same day', () => {
    expect(matchActivityToWorkout(activity(), [workout()])).toEqual({
      workoutId: 'w1',
      dayOffset: 0,
      durationDeltaMin: 0,
    });
  });

  it('returns null when nothing is scheduled', () => {
    expect(matchActivityToWorkout(activity(), [])).toBeNull();
  });

  it('never matches across sports — a silent mismatch is worse than no match', () => {
    expect(matchActivityToWorkout(activity({ sport: 'swim' }), [workout({ sport: 'run' })])).toBeNull();
  });

  it('lets either leg complete a brick, but nothing else', () => {
    const brick = [workout({ sport: 'brick' })];
    expect(matchActivityToWorkout(activity({ sport: 'bike' }), brick)?.workoutId).toBe('w1');
    expect(matchActivityToWorkout(activity({ sport: 'run' }), brick)?.workoutId).toBe('w1');
    expect(matchActivityToWorkout(activity({ sport: 'swim' }), brick)).toBeNull();
  });

  it('never re-matches a session already linked to an activity', () => {
    expect(matchActivityToWorkout(activity(), [workout({ completed: true })])).toBeNull();
  });

  it('reaches one day either side, but no further', () => {
    expect(matchActivityToWorkout(activity({ localDate: THU }), [workout({ scheduledDate: WED })])).not.toBeNull();
    expect(matchActivityToWorkout(activity({ localDate: TUE }), [workout({ scheduledDate: WED })])).not.toBeNull();
    // Saturday's ride must not absorb Wednesday's run.
    expect(matchActivityToWorkout(activity({ localDate: SAT }), [workout({ scheduledDate: WED })])).toBeNull();
  });

  it('prefers the same day over a closer duration on a neighbouring day', () => {
    const match = matchActivityToWorkout(activity({ durationMin: 60 }), [
      workout({ id: 'same-day', scheduledDate: WED, plannedDurationMin: 120 }),
      workout({ id: 'next-day', scheduledDate: THU, plannedDurationMin: 60 }),
    ]);
    expect(match?.workoutId).toBe('same-day');
  });

  it('uses duration only to break a tie within the same day', () => {
    const match = matchActivityToWorkout(activity({ durationMin: 45 }), [
      workout({ id: 'long', plannedDurationMin: 120 }),
      workout({ id: 'short', plannedDurationMin: 50 }),
    ]);
    expect(match?.workoutId).toBe('short');
  });

  it('still matches a badly under-done session, and reports the shortfall', () => {
    // 40 of a planned 90 is exactly the signal §10.3 needs — not a reason to match elsewhere.
    const match = matchActivityToWorkout(activity({ durationMin: 40 }), [workout({ plannedDurationMin: 90 })]);
    expect(match?.workoutId).toBe('w1');
    expect(match?.durationDeltaMin).toBe(-50);
  });

  it('reports overshoot as a positive delta', () => {
    const match = matchActivityToWorkout(activity({ durationMin: 75 }), [workout({ plannedDurationMin: 60 })]);
    expect(match?.durationDeltaMin).toBe(15);
  });

  it('keeps dayOffset unsigned regardless of direction', () => {
    for (const date of [TUE, THU]) {
      const match = matchActivityToWorkout(activity({ localDate: date }), [workout({ scheduledDate: WED })]);
      expect(match?.dayOffset).toBe(COMPLETION_MATCH_WINDOW_DAYS);
    }
  });
});

describe('matchActivityToWorkout — ranking between candidates', () => {
  const activity = (over: Partial<CompletedActivity> = {}): CompletedActivity => ({
    localDate: WED,
    sport: 'run',
    durationMin: 60,
    ...over,
  });

  it('prefers the nearer day even when a further one matches the duration better', () => {
    const m = matchActivityToWorkout(activity({ durationMin: 90 }), [
      workout({ id: 'same-day', scheduledDate: WED, plannedDurationMin: 45 }),
      workout({ id: 'next-day', scheduledDate: THU, plannedDurationMin: 90 }),
    ]);
    // The athlete did that session short/long — the shortfall is signal §10.3 needs, not
    // something to hide by matching a different day.
    expect(m!.workoutId).toBe('same-day');
    expect(m!.dayOffset).toBe(0);
  });

  it('falls back to the closest planned duration when two candidates share a day', () => {
    const m = matchActivityToWorkout(activity({ durationMin: 60 }), [
      workout({ id: 'far', scheduledDate: WED, plannedDurationMin: 120 }),
      workout({ id: 'near', scheduledDate: WED, plannedDurationMin: 55 }),
    ]);
    expect(m!.workoutId).toBe('near');
    expect(m!.durationDeltaMin).toBe(5);
  });

  it('ranks a duration tie-break symmetrically, over or under', () => {
    const m = matchActivityToWorkout(activity({ durationMin: 60 }), [
      workout({ id: 'under-by-30', scheduledDate: WED, plannedDurationMin: 30 }),
      workout({ id: 'over-by-5', scheduledDate: WED, plannedDurationMin: 65 }),
    ]);
    expect(m!.workoutId).toBe('over-by-5');
  });
});

describe('matchActivityToWorkout — ranking is order-independent', () => {
  const act: CompletedActivity = { localDate: WED, sport: 'run', durationMin: 60 };

  it('picks the same-day session whichever order the candidates arrive in', () => {
    const near = workout({ id: 'same-day', scheduledDate: WED, plannedDurationMin: 45 });
    const far = workout({ id: 'next-day', scheduledDate: THU, plannedDurationMin: 60 });
    expect(matchActivityToWorkout(act, [far, near])!.workoutId).toBe('same-day');
    expect(matchActivityToWorkout(act, [near, far])!.workoutId).toBe('same-day');
  });

  it('picks the closest duration whichever order same-day candidates arrive in', () => {
    const near = workout({ id: 'near', scheduledDate: WED, plannedDurationMin: 55 });
    const far = workout({ id: 'far', scheduledDate: WED, plannedDurationMin: 120 });
    expect(matchActivityToWorkout(act, [near, far])!.workoutId).toBe('near');
    expect(matchActivityToWorkout(act, [far, near])!.workoutId).toBe('near');
  });
});
