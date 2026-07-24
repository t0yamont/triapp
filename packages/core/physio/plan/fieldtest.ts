/**
 * plan/fieldtest.ts — field-test scheduling (§12). "Tests are prescriptions, not
 * suggestions." Two concerns, kept separate:
 *
 *   1. nextFieldTest — which test the athlete is *due*, and by when (the §12 trigger table).
 *   2. placeFieldTest — where it may actually go (the §12 placement rules). A test run on the
 *      wrong day produces a wrong number that poisons the plan for weeks, so a day that fails
 *      any rule is never used; if none qualifies before the deadline, the test is postponed.
 *
 * Both are pure. Time is passed in as day offsets from "today" (day 0); the engine never
 * reads the clock.
 */

import {
  FIELD_TEST_CADENCE_CONF_HIGH,
  FIELD_TEST_CADENCE_CONF_MID,
  FIELD_TEST_CADENCE_WEEKS_HIGH_CONF,
  FIELD_TEST_CADENCE_WEEKS_MID_CONF,
  FIELD_TEST_FITNESS_CONFIRM_DAYS,
  FIELD_TEST_MIN_HOURS_AFTER_HARD,
  FIELD_TEST_PHASE_TRANSITION_DEADLINE_DAYS,
  FIELD_TEST_PRE_RACE_WEEKS,
  FIELD_TEST_RACE_EXCLUSION_DAYS,
  FIELD_TEST_RECOVERY_LOCKOUT_DAYS,
} from '../constants.js';
import type { Sport } from '../types.js';

export type FieldTestType = 'lt2' | 'full_battery' | 'confirmatory';

export interface FieldTestTrigger {
  test: FieldTestType;
  /** Primary sport for a single-sport test; full_battery covers all sports. */
  sport?: Sport;
  /** Latest day offset (from today) by which the test must be placed. */
  deadlineDayIndex: number;
  reasonCode: string;
  reasonText: string;
}

export interface TestSchedulingContext {
  confidence: number;
  weeksSinceLastTest: number;
  primarySport: Sport;
  phaseTransition?: boolean;
  /** §10.3 apparent-fitness-change flag (HR at a fixed pace dropped ≥3% over 3+ weeks). */
  apparentFitnessChange?: boolean;
  /** Days until the next A race; omit/Infinity if none scheduled. */
  daysToARace?: number;
  /** Confidence tier deadline from §2.4 when confidence has fallen below a boundary. */
  tierTestWithinDays?: number;
}

/** The §12 cadence deadline (weeks) for the athlete's current confidence. */
export function cadenceWeeks(confidence: number): number {
  return confidence >= FIELD_TEST_CADENCE_CONF_HIGH
    ? FIELD_TEST_CADENCE_WEEKS_HIGH_CONF
    : FIELD_TEST_CADENCE_WEEKS_MID_CONF;
}

/**
 * The most urgent field test the athlete is due, or `undefined` if none. Checked in §12
 * priority order: a pre-race battery and a dropped-confidence re-anchor are the most
 * consequential, then a confirmatory test, a phase-transition LT2, and finally routine cadence.
 */
export function nextFieldTest(ctx: TestSchedulingContext): FieldTestTrigger | undefined {
  const daysToRace = ctx.daysToARace ?? Infinity;

  // 6 weeks before an A race: full battery, all sports — but never inside the 10-day blackout.
  if (daysToRace <= FIELD_TEST_PRE_RACE_WEEKS * 7 && daysToRace > FIELD_TEST_RACE_EXCLUSION_DAYS) {
    return {
      test: 'full_battery',
      deadlineDayIndex: daysToRace - FIELD_TEST_RACE_EXCLUSION_DAYS,
      reasonCode: 'FIELD_TEST_PRE_RACE',
      reasonText: 'Scheduled your pre-race test battery — your A race is about six weeks out.',
    };
  }

  // Anchor confidence fell below a §2.4 tier: re-anchor within that tier's deadline.
  if (ctx.tierTestWithinDays !== undefined) {
    return {
      test: 'lt2',
      sport: ctx.primarySport,
      deadlineDayIndex: ctx.tierTestWithinDays,
      reasonCode: 'FIELD_TEST_CONFIDENCE_TIER',
      reasonText: "Scheduled a threshold test — we're overdue confirmation of your training zones.",
    };
  }

  // Apparent fitness change (§10.3): confirm, don't silently upgrade thresholds.
  if (ctx.apparentFitnessChange) {
    return {
      test: 'confirmatory',
      sport: ctx.primarySport,
      deadlineDayIndex: FIELD_TEST_FITNESS_CONFIRM_DAYS,
      reasonCode: 'FIELD_TEST_FITNESS_CHANGE',
      reasonText: 'Your paces suggest a fitness change — scheduled a test to confirm it before adjusting your zones.',
    };
  }

  // Phase transition: an LT2 test in the primary sport.
  if (ctx.phaseTransition) {
    return {
      test: 'lt2',
      sport: ctx.primarySport,
      deadlineDayIndex: FIELD_TEST_PHASE_TRANSITION_DEADLINE_DAYS,
      reasonCode: 'FIELD_TEST_PHASE_TRANSITION',
      reasonText: "You're moving into a new training phase — scheduled a threshold test to reset your targets.",
    };
  }

  // Routine cadence: no test in 8 weeks (≥0.75 confidence) or 6 weeks (0.50–0.74).
  if (ctx.weeksSinceLastTest >= cadenceWeeks(ctx.confidence)) {
    return {
      test: 'lt2',
      sport: ctx.primarySport,
      deadlineDayIndex: 14,
      reasonCode: 'FIELD_TEST_CADENCE',
      reasonText: "It's been a while since your last test — scheduled one for the next suitable day.",
    };
  }

  return undefined;
}

export interface CandidateDay {
  /** Offset from today; 0 = today. */
  dayIndex: number;
  inRecoveryWeekFirst3Days: boolean;
  hoursSinceLastHard: number;
  /** Days until the next race from this day; Infinity if none. */
  daysToNextRace: number;
  readinessBand: 'below' | 'within' | 'above' | 'unknown';
}

export interface FieldTestPlacement {
  scheduled: boolean;
  test: FieldTestType;
  day?: CandidateDay;
  reasonCode: string;
  reasonText: string;
  /** When postponed: why every eligible day was rejected (most-recent first blocker per day). */
  blockers: string[];
}

/**
 * Why `day` cannot host a test, per §12 placement rules. Empty ⇒ the day is usable.
 * "Inside the SWC band" is read as *not fatigued and not unknown* — the rule's stated
 * rationale is avoiding a test on a fatigued day; an unusually fresh day is fine, an
 * unknown-readiness day cannot be cleared. (See DECISIONS.md D-FIELDTEST-READINESS.)
 */
export function testDayBlockers(day: CandidateDay): string[] {
  const blockers: string[] = [];
  if (day.inRecoveryWeekFirst3Days) blockers.push('RECOVERY_WEEK_FIRST_3_DAYS');
  if (day.hoursSinceLastHard < FIELD_TEST_MIN_HOURS_AFTER_HARD) blockers.push('WITHIN_48H_OF_HARD');
  if (day.daysToNextRace < FIELD_TEST_RACE_EXCLUSION_DAYS) blockers.push('WITHIN_10_DAYS_OF_RACE');
  if (day.readinessBand === 'below' || day.readinessBand === 'unknown') blockers.push('READINESS_NOT_CLEARED');
  return blockers;
}

/**
 * Place a triggered test on the earliest day (up to its deadline) that satisfies every §12
 * placement rule. If none qualifies, the test is postponed rather than run on a bad day.
 */
export function placeFieldTest(trigger: FieldTestTrigger, candidates: CandidateDay[]): FieldTestPlacement {
  const eligible = candidates
    .filter((d) => d.dayIndex <= trigger.deadlineDayIndex)
    .sort((a, b) => a.dayIndex - b.dayIndex);

  for (const day of eligible) {
    if (testDayBlockers(day).length === 0) {
      return {
        scheduled: true,
        test: trigger.test,
        day,
        reasonCode: trigger.reasonCode,
        reasonText: trigger.reasonText,
        blockers: [],
      };
    }
  }

  // Nothing legal before the deadline — postpone, surfacing why the nearest day failed.
  const nearest = eligible[0];
  const blockers = nearest ? testDayBlockers(nearest) : ['NO_SLOT_BEFORE_DEADLINE'];
  return {
    scheduled: false,
    test: trigger.test,
    reasonCode: 'FIELD_TEST_POSTPONED',
    reasonText:
      'Held off on your test — no suitable day came up before the deadline (a test run while ' +
      'fatigued, too close to a race, or in early recovery gives a number we can’t trust).',
    blockers,
  };
}
