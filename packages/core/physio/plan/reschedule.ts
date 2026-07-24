/**
 * plan/reschedule.ts — athlete edits and week repair (§8.4 step 7; 06-UX.md "Calendar":
 * "Drag to move a session — on drop, the engine validates, repairs the week if needed, and
 * shows what it changed before committing"). The athlete's intent is honoured; the engine
 * fixes any guardrail breach the move causes and reports *exactly* what else it moved. It
 * never silently drops load and never returns an invalid week as if it were fine.
 *
 * ponytail: a nearest-valid-day search, not a re-optimiser. It relocates the one session
 * that has to move and stops; it does not rebuild the week. F10 is a two-move repair.
 */

import type { GuardrailWeek, PlanSport, Violation, WeekSession } from './types.js';
import type { PlanMutation } from '../types.js';
import { validateWeek } from './invariants.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Machine-readable reason codes for the audit row (rule #10, I13). */
export const RESCHEDULE_REASON = {
  APPLIED: 'ATHLETE_MOVE_APPLIED',
  REPAIRED: 'ATHLETE_MOVE_REPAIRED',
  UNRESOLVED: 'ATHLETE_MOVE_UNRESOLVED',
} as const;

/** Two hard sessions on one day is not one of the coded weekly guardrails, but it is the
 * thing G5's "≤2 consecutive hard days / brick = one hard day" exists to prevent, so the
 * repair treats it as a breach to clear. */
const STACKED_HARD_CODE = 'G5_STACKED_HARD';

export interface MoveRequest {
  fromDay: number;
  toDay: number;
  /** Disambiguates when the source day holds more than one session. */
  sport?: PlanSport;
}

export interface WeekEdit {
  sport: PlanSport;
  fromDay: number;
  toDay: number;
  /** false = the athlete's own drag; true = an engine repair. */
  byEngine: boolean;
}

export interface MoveOptions {
  weekStartDay?: number;
  /** Days the athlete can train (0..6). Defaults to the days the week already uses. */
  availableDays?: number[];
}

export interface RescheduleResult {
  week: GuardrailWeek;
  changed: boolean;
  /** The athlete's move first, then any engine repair. */
  edits: WeekEdit[];
  /** Present iff the week changed — one audit row per write (I13). */
  mutation?: PlanMutation;
  /** Athlete-readable summary of the whole operation (P1). */
  message: string;
  /** Guardrails still breached after the repair attempt (empty ⇒ safe to commit). */
  remainingViolations: Violation[];
}

/** Minimal cyclic distance between two weekdays (Sat→Sun is 1). */
const dayDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
};

const clone = (week: GuardrailWeek): GuardrailWeek => ({ ...week, sessions: week.sessions.map((s) => ({ ...s })) });

function noChange(week: GuardrailWeek, weekStartDay: number, message: string): RescheduleResult {
  return { week, changed: false, edits: [], message, remainingViolations: validateWeek(week, weekStartDay) };
}

/**
 * Move a session to another day, repairing the week if the move collides with a key session
 * or trips a guardrail. Pure: the input week is never mutated.
 */
export function moveSession(week: GuardrailWeek, req: MoveRequest, opts: MoveOptions = {}): RescheduleResult {
  const weekStartDay = opts.weekStartDay ?? 1;
  const working = clone(week);
  const { sessions } = working;
  const trainingDays = opts.availableDays ?? [...new Set(week.sessions.map((s) => s.dayOfWeek))];

  const src = sessions.find((s) => s.dayOfWeek === req.fromDay && (req.sport === undefined || s.sport === req.sport));
  if (!src || req.fromDay === req.toDay) {
    return noChange(
      working,
      weekStartDay,
      src
        ? `That session is already on ${DAY_NAMES[req.toDay]}.`
        : `No ${req.sport ?? 'session'} scheduled on ${DAY_NAMES[req.fromDay]}.`,
    );
  }

  // 1) Apply the athlete's move.
  src.dayOfWeek = req.toDay;
  const edits: WeekEdit[] = [{ sport: src.sport, fromDay: req.fromDay, toDay: req.toDay, byEngine: false }];

  // 2) Detect what the move broke: a stacked key session on the target, and/or a guardrail.
  const occupant = src.isHard
    ? sessions.find((s) => s !== src && s.dayOfWeek === req.toDay && s.isHard)
    : undefined;
  const violations = validateWeek(working, weekStartDay);
  const problems: Violation[] = [...violations];
  if (occupant) {
    problems.push({ code: STACKED_HARD_CODE, message: `two hard sessions stacked on ${DAY_NAMES[req.toDay]}` });
  }

  if (problems.length === 0) {
    return {
      week: working,
      changed: true,
      edits,
      mutation: {
        actor: 'athlete',
        reasonCode: RESCHEDULE_REASON.APPLIED,
        reasonText: `Moved your ${src.sport} to ${DAY_NAMES[req.toDay]}.`,
      },
      message: `Moved your ${src.sport} to ${DAY_NAMES[req.toDay]}.`,
      remainingViolations: [],
    };
  }

  // 3) Relocate the one session that has to move — the stacked occupant, else the moved
  //    session itself — to the nearest available day that leaves the week fully valid.
  const relocatable = occupant ?? src;
  const hardElsewhere = new Set(
    sessions.filter((s) => s !== relocatable && s.isHard).map((s) => s.dayOfWeek),
  );
  const candidates = trainingDays
    .filter((d) => d !== req.toDay && !hardElsewhere.has(d))
    .sort((a, b) => dayDistance(a, req.toDay) - dayDistance(b, req.toDay) || a - b);

  for (const day of candidates) {
    relocatable.dayOfWeek = day;
    if (validateWeek(working, weekStartDay).length === 0) {
      edits.push({ sport: relocatable.sport, fromDay: req.toDay, toDay: day, byEngine: true });
      const message =
        `Moved your ${src.sport} to ${DAY_NAMES[req.toDay]}. To keep your hard days spaced out, ` +
        `I moved your ${relocatable.sport} from ${DAY_NAMES[req.toDay]} to ${DAY_NAMES[day]}.`;
      return {
        week: working,
        changed: true,
        edits,
        mutation: { actor: 'athlete', reasonCode: RESCHEDULE_REASON.REPAIRED, reasonText: message, ruleId: 'G5' },
        message,
        remainingViolations: [],
      };
    }
  }

  // 4) No valid home — leave the athlete's move applied and hand back the open breaches.
  relocatable.dayOfWeek = req.toDay;
  const message =
    `Moved your ${src.sport} to ${DAY_NAMES[req.toDay]}, but I couldn't rebalance the rest of the ` +
    `week automatically — ${problems.length} guardrail check(s) still breached. Review before committing.`;
  return {
    week: working,
    changed: true,
    edits,
    mutation: { actor: 'athlete', reasonCode: RESCHEDULE_REASON.UNRESOLVED, reasonText: message, ruleId: 'G5' },
    message,
    remainingViolations: problems,
  };
}
