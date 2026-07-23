/**
 * plan/micro.ts — microcycle (week) construction against availability (§8.4). Place a long
 * session and one quality session, fill the rest with S1 aerobic to approach the week's load
 * target, keep ≥1 rest day (2 in recovery), and stay under the guardrails. Availability is a
 * hard input — a plan that ignores it has excellent physiology and zero adherence.
 *
 * ponytail: single-pass greedy placer, not an optimiser — planning load is the TRIMP-style
 * duration×zone-weight heuristic, and the week is scaled down (never up) to respect the
 * ramp-capped target. Upgrade to a constraint search if adherence needs tighter targeting.
 */

import { MAX_WEEKLY_S3_TIME_PCT, MAX_WEEKLY_S3_TIME_PCT_BASE, TRIMP_ZONE_WEIGHTS } from '../constants.js';
import type { SZone } from '../types.js';
import type { GuardrailWeek, PlanPhase, PlanSport, WeekSession } from './types.js';

export interface Availability {
  /** Minutes available per weekday (0 = Sun .. 6 = Sat). Missing/0 = unavailable. */
  dayMinutes: Record<number, number>;
  /** G10 ceiling. */
  weeklyHoursMax: number;
  longRideDay?: number;
  longRunDay?: number;
  swimDays?: number[];
}

export interface MicroInput {
  phase: PlanPhase;
  isRecoveryWeek: boolean;
  loadTarget: number;
  availability: Availability;
  priorWeekLoad?: number;
}

const LONG_CAP_MIN = 240;
const AEROBIC_CAP_MIN = 90;
const S3_CAP_MIN = 40;

export function constructMicrocycle(input: MicroInput): GuardrailWeek {
  const { phase, isRecoveryWeek, loadTarget, availability } = input;
  const ceilingMin = availability.weeklyHoursMax * 60;
  const longDay = availability.longRideDay ?? availability.longRunDay;
  const allowS3 = !isRecoveryWeek && phase !== 'recovery';

  const avail = Object.entries(availability.dayMinutes)
    .map(([d, m]) => ({ day: Number(d), minutes: m }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => a.day - b.day);

  // Reserve rest days (2 in recovery, else 1) by dropping the lightest available days.
  const restCount = isRecoveryWeek ? 2 : 1;
  const restDays = new Set([...avail].sort((a, b) => a.minutes - b.minutes).slice(0, restCount).map((x) => x.day));
  const sessionDays = avail.filter((x) => !restDays.has(x.day));

  const s3Day = allowS3 ? sessionDays.find((x) => x.day !== longDay)?.day : undefined;

  const sessions: WeekSession[] = [];
  let usedMin = 0;
  for (const { day, minutes } of sessionDays) {
    const isS3 = day === s3Day;
    const isLong = day === longDay;
    const cap = isS3 ? S3_CAP_MIN : isLong ? LONG_CAP_MIN : AEROBIC_CAP_MIN;
    const durationMin = Math.min(minutes, cap, ceilingMin - usedMin);
    if (durationMin <= 0) continue;
    usedMin += durationMin;
    const sZone: SZone = isS3 ? 'S3' : 'S1';
    const sport: PlanSport = availability.swimDays?.includes(day) ? 'swim' : isLong ? 'bike' : 'run';
    sessions.push({ dayOfWeek: day, sport, sZone, durationMin, load: durationMin * TRIMP_ZONE_WEIGHTS[sZone], isHard: isS3 });
  }

  // Scale down if we overshoot the ramp-capped target — never up (I5).
  const rawLoad = sessions.reduce((a, s) => a + s.load, 0);
  if (rawLoad > loadTarget) {
    const f = loadTarget / rawLoad;
    for (const s of sessions) {
      s.durationMin = Math.round(s.durationMin * f);
      s.load = s.durationMin * TRIMP_ZONE_WEIGHTS[s.sZone];
    }
  }

  // Keep S3 time under the phase cap (G6). Cap is computed against the non-S3 minutes so the
  // post-trim fraction s3/(nonS3+s3) stays ≤ cap even though trimming shrinks the total.
  const s3Min = sessions.filter((s) => s.sZone === 'S3').reduce((a, s) => a + s.durationMin, 0);
  const nonS3Min = sessions.reduce((a, s) => a + s.durationMin, 0) - s3Min;
  const cap = phase === 'base' ? MAX_WEEKLY_S3_TIME_PCT_BASE : MAX_WEEKLY_S3_TIME_PCT;
  const maxS3Min = Math.floor((cap * nonS3Min) / (1 - cap));
  for (const s of sessions) {
    if (s.sZone === 'S3' && s.durationMin > maxS3Min) {
      s.durationMin = maxS3Min;
      s.load = maxS3Min * TRIMP_ZONE_WEIGHTS.S3;
    }
  }

  return {
    phase,
    isRecoveryWeek,
    hoursCeiling: availability.weeklyHoursMax,
    sessions,
    ...(input.priorWeekLoad !== undefined ? { priorWeekLoad: input.priorWeekLoad } : {}),
  };
}
