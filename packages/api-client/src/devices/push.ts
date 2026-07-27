/**
 * devices/push.ts — what to send a watch, and when (08-ROADMAP.md Phase 7).
 *
 * Pure policy, no HTTP: given the plan and what the device already holds, decide what to push,
 * what to republish because it changed, and what to withdraw. The transport (Garmin Training
 * API, or a downloaded FIT file) is a thin shell over this, and keeping the decision separate
 * means it stays testable without partner credentials.
 *
 * Two rules from the roadmap:
 *   - a **10-day rolling window** — push what's imminent, not the whole season, so a plan that
 *     adapts doesn't leave months of stale sessions on the watch;
 *   - **republish on mutation** — the athlete must never train from a session the engine has
 *     since changed, which is the whole point of an adaptive plan.
 */

import { addDaysISO } from '@ironflow/core/physio';

/** How far ahead workouts are published. Beyond this the plan is still likely to change. */
export const PUSH_WINDOW_DAYS = 10;

export interface PushableWorkout {
  id: string;
  /** ISO calendar date. */
  scheduledDate: string;
  /** When the engine last changed this workout (ISO instant). */
  updatedAt: string;
  /** When it was last sent to the device; absent ⇒ never sent. */
  pushedAt?: string;
  /** The device's own id for it, needed to withdraw or replace. */
  deviceWorkoutId?: string;
}

export interface DevicePushPlan {
  /** In window, never sent. */
  toPush: PushableWorkout[];
  /** In window, sent, but changed since — the athlete would otherwise train a stale session. */
  toRepublish: PushableWorkout[];
  /** On the device but no longer in the window, or gone from the plan entirely. */
  toWithdraw: PushableWorkout[];
  windowStart: string;
  windowEnd: string;
}

const isOnDevice = (w: PushableWorkout): boolean => w.pushedAt !== undefined;

/** Changed after it was last sent — string compare is safe on ISO instants. */
const isStale = (w: PushableWorkout): boolean => isOnDevice(w) && w.updatedAt > w.pushedAt!;

/**
 * Decide the next device sync.
 *
 * `planned` is every workout still in the plan; `alreadyOnDevice` covers anything the device
 * holds that the plan no longer contains at all — a session the athlete skipped or that a week
 * repair removed — so it can be withdrawn rather than left to fire on the watch.
 */
export function planDevicePush(
  planned: readonly PushableWorkout[],
  today: string,
  alreadyOnDevice: readonly PushableWorkout[] = [],
): DevicePushPlan {
  const windowStart = today;
  const windowEnd = addDaysISO(today, PUSH_WINDOW_DAYS);
  const inWindow = (w: PushableWorkout) => w.scheduledDate >= windowStart && w.scheduledDate <= windowEnd;

  const toPush: PushableWorkout[] = [];
  const toRepublish: PushableWorkout[] = [];
  const toWithdraw: PushableWorkout[] = [];

  for (const w of planned) {
    if (inWindow(w)) {
      if (!isOnDevice(w)) toPush.push(w);
      else if (isStale(w)) toRepublish.push(w);
      continue;
    }
    // Outside the window but still on the watch: a past session stays (the athlete may still be
    // completing it), a future one is withdrawn because it will very likely change first.
    if (isOnDevice(w) && w.scheduledDate > windowEnd) toWithdraw.push(w);
  }

  const plannedIds = new Set(planned.map((w) => w.id));
  for (const w of alreadyOnDevice) {
    if (!plannedIds.has(w.id) && isOnDevice(w)) toWithdraw.push(w);
  }

  return { toPush, toRepublish, toWithdraw, windowStart, windowEnd };
}

/** Nothing to do — lets a caller skip the transport entirely. */
export function isPushPlanEmpty(plan: DevicePushPlan): boolean {
  return plan.toPush.length === 0 && plan.toRepublish.length === 0 && plan.toWithdraw.length === 0;
}
