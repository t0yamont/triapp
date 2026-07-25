/**
 * plan/actions.ts — the athlete's other edits: shorten, skip, swap, and block a day (§10;
 * `move` lives in reschedule.ts, which owns the day-relocation search these reuse).
 *
 * Every action honours the athlete's intent, then reports what it cost: a shortened or skipped
 * session states the load given up, a blocked day relocates what it can and names what it
 * couldn't. Each returns one audited mutation with an athlete-readable sentence (I13, P1), and
 * none of them silently drops load without saying so (§10.4).
 */

import type { PlanMutation } from '../types.js';
import { moveSession, type MoveOptions, type RescheduleResult } from './reschedule.js';
import { validateWeek, weekLoad } from './invariants.js';
import type { GuardrailWeek, PlanSport, Violation, WeekSession } from './types.js';

/** Machine-readable reason codes for the audit row (rule #10, I13). */
export const ACTION_REASON = {
  SHORTENED: 'ATHLETE_SHORTENED',
  SKIPPED: 'ATHLETE_SKIPPED',
  SWAPPED: 'ATHLETE_SWAPPED',
  DAY_BLOCKED: 'ATHLETE_DAY_BLOCKED',
  DAY_BLOCKED_PARTIAL: 'ATHLETE_DAY_BLOCKED_PARTIAL',
} as const;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface ActionResult {
  week: GuardrailWeek;
  changed: boolean;
  /** Change in the week's total planned load. Negative = load given up. */
  loadDeltaPct: number;
  mutation?: PlanMutation;
  message: string;
  /** Guardrails still breached after the edit (empty ⇒ safe to commit). */
  remainingViolations: Violation[];
}

const clone = (week: GuardrailWeek): GuardrailWeek => ({ ...week, sessions: week.sessions.map((s) => ({ ...s })) });

const findSession = (week: GuardrailWeek, day: number, sport?: PlanSport): WeekSession | undefined =>
  week.sessions.find((s) => s.dayOfWeek === day && (sport === undefined || s.sport === sport));

const pctDelta = (before: number, after: number): number =>
  before === 0 ? 0 : Math.round(((after - before) / before) * 100);

function noChange(week: GuardrailWeek, message: string, weekStartDay: number): ActionResult {
  return { week, changed: false, loadDeltaPct: 0, message, remainingViolations: validateWeek(week, weekStartDay) };
}

const mutation = (reasonCode: string, reasonText: string): PlanMutation => ({ actor: 'athlete', reasonCode, reasonText });

/**
 * Cut a session to `toMinutes`, scaling its load with the duration. Lengthening is not an
 * athlete action — growth is the planner's job, under G1/G2 (§5.3).
 */
export function shortenSession(
  week: GuardrailWeek,
  req: { day: number; sport?: PlanSport; toMinutes: number },
  opts: MoveOptions = {},
): ActionResult {
  const weekStartDay = opts.weekStartDay ?? 1;
  const working = clone(week);
  const s = findSession(working, req.day, req.sport);

  if (!s) return noChange(working, `No ${req.sport ?? 'session'} scheduled on ${DAY_NAMES[req.day]}.`, weekStartDay);
  if (req.toMinutes >= s.durationMin) {
    return noChange(working, `That would make the session longer — the plan grows it for you, safely.`, weekStartDay);
  }

  const before = weekLoad(working.sessions);
  const minutes = Math.max(0, req.toMinutes);
  const loadPerMin = s.load / s.durationMin;
  s.load = Math.round(minutes * loadPerMin);
  s.durationMin = minutes;
  const after = weekLoad(working.sessions);

  const message = `Shortened your ${s.sport} to ${minutes} min. That's ${Math.abs(pctDelta(before, after))}% less load this week.`;
  return {
    week: working,
    changed: true,
    loadDeltaPct: pctDelta(before, after),
    mutation: mutation(ACTION_REASON.SHORTENED, message),
    message,
    remainingViolations: validateWeek(working, weekStartDay),
  };
}

/** Drop a session entirely. The load it carried is stated, never quietly absorbed. */
export function skipSession(
  week: GuardrailWeek,
  req: { day: number; sport?: PlanSport },
  opts: MoveOptions = {},
): ActionResult {
  const weekStartDay = opts.weekStartDay ?? 1;
  const working = clone(week);
  const s = findSession(working, req.day, req.sport);
  if (!s) return noChange(working, `No ${req.sport ?? 'session'} scheduled on ${DAY_NAMES[req.day]}.`, weekStartDay);

  const before = weekLoad(working.sessions);
  working.sessions = working.sessions.filter((x) => x !== s);
  const after = weekLoad(working.sessions);

  const message =
    `Skipped your ${s.sport} on ${DAY_NAMES[req.day]} — ${Math.abs(pctDelta(before, after))}% of this week's load. ` +
    `${s.isHard ? "It was a key session, so the week's quality drops with it." : 'Aerobic volume, so the cost is mostly time.'}`;
  return {
    week: working,
    changed: true,
    loadDeltaPct: pctDelta(before, after),
    mutation: mutation(ACTION_REASON.SKIPPED, message),
    message,
    remainingViolations: validateWeek(working, weekStartDay),
  };
}

/** Exchange two days' sessions. Guardrails are re-checked; a breach is reported, not hidden. */
export function swapDays(week: GuardrailWeek, req: { dayA: number; dayB: number }, opts: MoveOptions = {}): ActionResult {
  const weekStartDay = opts.weekStartDay ?? 1;
  const working = clone(week);
  if (req.dayA === req.dayB) return noChange(working, 'Those are the same day.', weekStartDay);

  const onA = working.sessions.filter((s) => s.dayOfWeek === req.dayA);
  const onB = working.sessions.filter((s) => s.dayOfWeek === req.dayB);
  if (onA.length === 0 && onB.length === 0) {
    return noChange(working, `Nothing scheduled on ${DAY_NAMES[req.dayA]} or ${DAY_NAMES[req.dayB]}.`, weekStartDay);
  }

  for (const s of onA) s.dayOfWeek = req.dayB;
  for (const s of onB) s.dayOfWeek = req.dayA;

  const remainingViolations = validateWeek(working, weekStartDay);
  const message =
    remainingViolations.length === 0
      ? `Swapped ${DAY_NAMES[req.dayA]} and ${DAY_NAMES[req.dayB]}.`
      : `Swapped ${DAY_NAMES[req.dayA]} and ${DAY_NAMES[req.dayB]}, but it breaks ${remainingViolations.length} of your safety limits. Review before committing.`;

  return {
    week: working,
    changed: true,
    loadDeltaPct: 0, // a swap moves load, it doesn't change it
    mutation: mutation(ACTION_REASON.SWAPPED, message),
    message,
    remainingViolations,
  };
}

export interface BlockDayResult extends ActionResult {
  /** Sessions relocated to another day, in the order they were moved. */
  relocated: { sport: PlanSport; toDay: number }[];
  /** Sessions that had nowhere legal to go and were dropped. */
  dropped: PlanSport[];
}

/**
 * The athlete can't train on a day: relocate each of its sessions to the nearest day that keeps
 * the week valid (reusing the `move` repair), and drop only what genuinely won't fit — saying so.
 */
export function blockDay(week: GuardrailWeek, day: number, opts: MoveOptions = {}): BlockDayResult {
  const weekStartDay = opts.weekStartDay ?? 1;
  const available = (opts.availableDays ?? [...new Set(week.sessions.map((s) => s.dayOfWeek))]).filter((d) => d !== day);
  const before = weekLoad(week.sessions);
  // Accept a landing that doesn't make the week worse than it already is — demanding a
  // perfectly clean week would drop sessions just because the week started imperfect.
  const baseline = validateWeek(week, weekStartDay).length;

  let working = clone(week);
  const relocated: { sport: PlanSport; toDay: number }[] = [];
  const dropped: PlanSport[] = [];

  for (const session of week.sessions.filter((s) => s.dayOfWeek === day)) {
    const landed = available
      .map((to) => moveSession(working, { fromDay: day, toDay: to, sport: session.sport }, { ...opts, availableDays: available }))
      .find((r: RescheduleResult) => r.changed && r.remainingViolations.length <= baseline);

    if (landed) {
      working = landed.week;
      const moved = landed.edits[0]!;
      relocated.push({ sport: session.sport, toDay: moved.toDay });
    } else {
      working = { ...working, sessions: working.sessions.filter((s) => !(s.dayOfWeek === day && s.sport === session.sport)) };
      dropped.push(session.sport);
    }
  }

  if (relocated.length === 0 && dropped.length === 0) {
    return { ...noChange(working, `Nothing was scheduled on ${DAY_NAMES[day]}.`, weekStartDay), relocated, dropped };
  }

  const parts = [`${DAY_NAMES[day]} is blocked out.`];
  if (relocated.length > 0) parts.push(`Moved your ${relocated.map((r) => `${r.sport} to ${DAY_NAMES[r.toDay]}`).join(', ')}.`);
  if (dropped.length > 0) parts.push(`Your ${dropped.join(' and ')} had nowhere safe to go this week, so it comes out of the plan.`);
  const message = parts.join(' ');

  return {
    week: working,
    changed: true,
    loadDeltaPct: pctDelta(before, weekLoad(working.sessions)),
    mutation: mutation(dropped.length > 0 ? ACTION_REASON.DAY_BLOCKED_PARTIAL : ACTION_REASON.DAY_BLOCKED, message),
    message,
    remainingViolations: validateWeek(working, weekStartDay),
    relocated,
    dropped,
  };
}
