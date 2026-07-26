/**
 * plan/completion.ts — deciding which planned session an activity actually completed.
 *
 * This is the join that turns "a file was uploaded" into "you did Tuesday's threshold run",
 * and it matters well beyond the activity list: completion rate is what §10.3 reasons over
 * (`REPLAN_UNDERCOMPLETION` / `REPLAN_FULL_RAMP`), so a wrong match quietly distorts the
 * plan's view of how training is going.
 *
 * Pure scheduling logic, not physiology — no constants here need a REFERENCES.md citation,
 * but the window below is a deliberate choice rather than an arbitrary one.
 */

import { daysBetweenISO } from './generate.js';
import type { PlanSport } from './types.js';

/**
 * How far from its scheduled day a session may still be considered completed. One day, in
 * either direction: athletes ride Saturday's long ride on Sunday, and a late-evening session
 * can land on the next calendar day once timezones are applied. Wider than this and a
 * mid-week session starts absorbing the weekend's activity.
 */
export const COMPLETION_MATCH_WINDOW_DAYS = 1;

export interface CompletableWorkout {
  id: string;
  /** ISO calendar date it was scheduled for. */
  scheduledDate: string;
  sport: PlanSport;
  plannedDurationMin: number;
  /** Already linked to an activity — never matched twice. */
  completed: boolean;
}

export interface CompletedActivity {
  /** The athlete's *local* calendar date, not the UTC instant (hard rule #8). */
  localDate: string;
  sport: PlanSport;
  durationMin: number;
}

export interface ActivityMatch {
  workoutId: string;
  /** Days between activity and planned session; 0 = same day. */
  dayOffset: number;
  /** Actual minus planned duration, minutes. Negative = shorter than planned. */
  durationDeltaMin: number;
}

/**
 * A brick is a bike→run session, so either sport can complete it. Nothing else crosses:
 * matching a swim to a run because the day lines up would be worse than not matching at all,
 * since the athlete can always link it by hand but cannot easily discover a silent mismatch.
 */
function sportMatches(activity: PlanSport, planned: PlanSport): boolean {
  if (activity === planned) return true;
  return planned === 'brick' && (activity === 'bike' || activity === 'run');
}

/**
 * The planned session this activity most likely completed, or null if none is plausible.
 *
 * Ranking, in order: same day beats a neighbouring day; then the closest planned duration.
 * Duration only breaks ties — it never overrides the day, because an athlete who did 40
 * minutes of a planned 90 still did *that* session, and the shortfall is exactly the signal
 * §10.3 needs to see rather than something to hide by matching elsewhere.
 */
export function matchActivityToWorkout(
  activity: CompletedActivity,
  candidates: readonly CompletableWorkout[],
): ActivityMatch | null {
  const viable = candidates
    .filter((w) => !w.completed && sportMatches(activity.sport, w.sport))
    .map((w) => ({
      workoutId: w.id,
      dayOffset: Math.abs(daysBetweenISO(w.scheduledDate, activity.localDate)),
      durationDeltaMin: activity.durationMin - w.plannedDurationMin,
    }))
    .filter((m) => m.dayOffset <= COMPLETION_MATCH_WINDOW_DAYS);

  if (viable.length === 0) return null;

  return viable.reduce((best, m) => {
    if (m.dayOffset !== best.dayOffset) return m.dayOffset < best.dayOffset ? m : best;
    return Math.abs(m.durationDeltaMin) < Math.abs(best.durationDeltaMin) ? m : best;
  });
}
