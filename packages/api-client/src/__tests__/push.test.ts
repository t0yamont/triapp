import { describe, expect, it } from 'vitest';
import { isPushPlanEmpty, planDevicePush, PUSH_WINDOW_DAYS, type PushableWorkout } from '../devices/push.js';

const TODAY = '2026-08-03';
const EARLIER = '2026-08-01T06:00:00.000Z';
const LATER = '2026-08-02T09:30:00.000Z';

const w = (over: Partial<PushableWorkout> & Pick<PushableWorkout, 'id' | 'scheduledDate'>): PushableWorkout => ({
  updatedAt: EARLIER,
  ...over,
});

describe('planDevicePush — the 10-day rolling window', () => {
  it('pushes what is imminent and leaves the rest of the season alone', () => {
    const plan = planDevicePush(
      [
        w({ id: 'today', scheduledDate: TODAY }),
        w({ id: 'in-window', scheduledDate: '2026-08-10' }),
        w({ id: 'edge', scheduledDate: '2026-08-13' }), // exactly +10 days
        w({ id: 'beyond', scheduledDate: '2026-08-14' }),
      ],
      TODAY,
    );
    expect(plan.toPush.map((x) => x.id)).toEqual(['today', 'in-window', 'edge']);
    expect(plan.windowEnd).toBe('2026-08-13');
    expect(PUSH_WINDOW_DAYS).toBe(10);
  });

  it('ignores past sessions — the window looks forward', () => {
    const plan = planDevicePush([w({ id: 'yesterday', scheduledDate: '2026-08-02' })], TODAY);
    expect(plan.toPush).toEqual([]);
    expect(plan.toWithdraw).toEqual([]);
  });
});

describe('planDevicePush — republish on mutation', () => {
  it('republishes a session the engine changed after it was sent', () => {
    const plan = planDevicePush(
      [w({ id: 'adapted', scheduledDate: '2026-08-05', pushedAt: EARLIER, updatedAt: LATER, deviceWorkoutId: 'g1' })],
      TODAY,
    );
    // The athlete must never train a session the engine has since eased or moved.
    expect(plan.toRepublish.map((x) => x.id)).toEqual(['adapted']);
    expect(plan.toPush).toEqual([]);
  });

  it('leaves an unchanged session on the device alone', () => {
    const plan = planDevicePush(
      [w({ id: 'stable', scheduledDate: '2026-08-05', pushedAt: LATER, updatedAt: EARLIER, deviceWorkoutId: 'g1' })],
      TODAY,
    );
    expect(isPushPlanEmpty(plan)).toBe(true);
  });
});

describe('planDevicePush — withdrawing', () => {
  it('withdraws a future session that has fallen out of the window', () => {
    // e.g. the plan was rebuilt and this session moved months out.
    const plan = planDevicePush(
      [w({ id: 'drifted', scheduledDate: '2026-09-20', pushedAt: EARLIER, deviceWorkoutId: 'g2' })],
      TODAY,
    );
    expect(plan.toWithdraw.map((x) => x.id)).toEqual(['drifted']);
  });

  it('withdraws a session the plan no longer contains at all', () => {
    // Removed by a week repair; without this it would still fire on the watch.
    const plan = planDevicePush(
      [w({ id: 'kept', scheduledDate: '2026-08-05' })],
      TODAY,
      [w({ id: 'deleted', scheduledDate: '2026-08-06', pushedAt: EARLIER, deviceWorkoutId: 'g3' })],
    );
    expect(plan.toWithdraw.map((x) => x.id)).toEqual(['deleted']);
    expect(plan.toPush.map((x) => x.id)).toEqual(['kept']);
  });

  it('does not withdraw a past session still on the device', () => {
    // The athlete may yet complete yesterday's session; pulling it would be rude.
    const plan = planDevicePush(
      [w({ id: 'yesterday', scheduledDate: '2026-08-02', pushedAt: EARLIER, deviceWorkoutId: 'g4' })],
      TODAY,
    );
    expect(plan.toWithdraw).toEqual([]);
  });

  it('does not withdraw something that was never sent', () => {
    const plan = planDevicePush([], TODAY, [w({ id: 'never-sent', scheduledDate: '2026-08-06' })]);
    expect(plan.toWithdraw).toEqual([]);
  });
});

describe('isPushPlanEmpty', () => {
  it('is true only when there is nothing to do', () => {
    expect(isPushPlanEmpty(planDevicePush([], TODAY))).toBe(true);
    expect(isPushPlanEmpty(planDevicePush([w({ id: 'a', scheduledDate: TODAY })], TODAY))).toBe(false);
  });
});
