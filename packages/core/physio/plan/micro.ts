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

import { confidenceBehaviour } from '../confidence.js';
import { MAX_WEEKLY_S3_TIME_PCT, MAX_WEEKLY_S3_TIME_PCT_BASE, TRIMP_ZONE_WEIGHTS } from '../constants.js';
import type { SZone } from '../types.js';
import type { GuardrailWeek, PlanPhase, PlanSport, SessionPurpose, WeekSession } from './types.js';

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
  /**
   * Combined anchor confidence (§2.4). **Required**, because it decides how hard this week is
   * allowed to be — not just how fast load may grow.
   *
   * Below 0.30 the athlete's thresholds are too poorly known to prescribe against, so no S3 is
   * scheduled at all (invariant I15); between 0.30 and 0.49 the S3 volume cap is halved
   * (`z5VolumeFraction`). Both values come from `confidenceBehaviour` and were previously
   * computed and ==never consulted by the planner==.
   */
  confidence: number;
}

const LONG_CAP_MIN = 240;
const AEROBIC_CAP_MIN = 90;
const S3_CAP_MIN = 40;

/** Phases in which a long session carries a race-intensity block in its final third (§7.2). */
const DURABILITY_PHASES: ReadonlySet<PlanPhase> = new Set<PlanPhase>(['build', 'peak']);

/**
 * What a session is *for* (§7.2) — the input `sessions/library.ts` renders a structure from.
 *
 * Decided here rather than at persistence time because it is a planning decision: it depends
 * on the phase, the week type, and which slot the session landed in. `WeekSession.purpose` has
 * existed as an optional field since the first commit with nothing ever setting it, which is
 * why every persisted workout was called "Run — aerobic" or "Bike intervals".
 *
 * Only the purposes this placer can actually produce are assigned. It emits no threshold
 * (S2-only) work, no bricks and no strength — `weeklyReplan`'s `adjust_distribution` and §7.3
 * scheduling are what would introduce those, and neither calls into plan generation yet.
 */
function sessionPurpose(args: {
  isS3: boolean;
  isLong: boolean;
  sport: PlanSport;
  phase: PlanPhase;
  isRecoveryWeek: boolean;
}): SessionPurpose {
  if (args.isS3) return 'vo2max';
  if (args.isRecoveryWeek || args.phase === 'recovery') return 'recovery';
  if (args.isLong) return DURABILITY_PHASES.has(args.phase) ? 'durability' : 'aerobic_volume';
  // A swim that isn't the quality session is technique work (§7.2's swim default).
  return args.sport === 'swim' ? 'technique' : 'aerobic_volume';
}

export function constructMicrocycle(input: MicroInput): GuardrailWeek {
  const { phase, isRecoveryWeek, loadTarget, availability } = input;
  const ceilingMin = availability.weeklyHoursMax * 60;
  const longDay = availability.longRideDay ?? availability.longRunDay;

  // §2.4's intensity ceiling. `maxSZone` is 'S1' below 0.30 confidence — "aerobic and technique
  // work only" — which is what invariant I15 asserts. Prescribing VO₂ work against thresholds
  // this poorly known is the case the confidence system exists to prevent, so it is enforced
  // here at placement rather than trusted to a later check.
  const behaviour = confidenceBehaviour(input.confidence);
  const allowS3 = !isRecoveryWeek && phase !== 'recovery' && behaviour.maxSZone === 'S3';

  const avail = Object.entries(availability.dayMinutes)
    .map(([d, m]) => ({ day: Number(d), minutes: m }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => a.day - b.day);

  // Reserve rest days (2 in recovery, else 1) by dropping the lightest available days.
  const restCount = isRecoveryWeek ? 2 : 1;
  const restDays = new Set([...avail].sort((a, b) => a.minutes - b.minutes).slice(0, restCount).map((x) => x.day));
  const sessionDays = avail.filter((x) => !restDays.has(x.day));

  // Place the quality session away from the long day, and away from swim days: the S3 slot
  // carries a much tighter duration cap, so putting it on a swim day makes that sport's
  // longest session swing between weeks purely because the slot moved (a G2 false positive),
  // and the §7.2 library renders VO₂ work for bike/run, not the technique swim.
  const nonLongDays = sessionDays.filter((x) => x.day !== longDay);
  const s3Day = allowS3
    ? (nonLongDays.find((x) => !availability.swimDays?.includes(x.day)) ?? nonLongDays[0])?.day
    : undefined;

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
    sessions.push({
      dayOfWeek: day,
      sport,
      sZone,
      purpose: sessionPurpose({ isS3, isLong, sport, phase, isRecoveryWeek }),
      durationMin,
      load: durationMin * TRIMP_ZONE_WEIGHTS[sZone],
      isHard: isS3,
    });
  }

  // Scale down if we overshoot the ramp-capped target — never up (I5).
  const rawLoad = sessions.reduce((a, s) => a + s.load, 0);
  if (rawLoad > loadTarget) {
    const f = loadTarget / rawLoad;
    for (const s of sessions) {
      // floor, not round: the week must never exceed its ramp-capped target (I5).
      s.durationMin = Math.floor(s.durationMin * f);
      s.load = s.durationMin * TRIMP_ZONE_WEIGHTS[s.sZone];
    }
  }

  // Keep S3 time under the phase cap (G6). Cap is computed against the non-S3 minutes so the
  // post-trim fraction s3/(nonS3+s3) stays ≤ cap even though trimming shrinks the total.
  const s3Min = sessions.filter((s) => s.sZone === 'S3').reduce((a, s) => a + s.durationMin, 0);
  const nonS3Min = sessions.reduce((a, s) => a + s.durationMin, 0) - s3Min;
  // G6's phase cap, then §2.4's confidence multiplier on top: a moderately-known athlete
  // (0.30–0.49) gets half the nominal Z5 volume. The two are multiplicative because they
  // constrain different things — the phase caps intensity *distribution*, confidence caps how
  // much of it we are willing to prescribe on the evidence available.
  const cap = phase === 'base' ? MAX_WEEKLY_S3_TIME_PCT_BASE : MAX_WEEKLY_S3_TIME_PCT;
  const maxS3Min = Math.floor(((cap * nonS3Min) / (1 - cap)) * behaviour.z5VolumeFraction);
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
