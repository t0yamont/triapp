/**
 * plan/races.ts — race calendar resolution (§9). The nearest A race owns the phase structure;
 * B races insert a local peak and a mandatory recovery block; C races are trained through and
 * annotate the plan as a race-pace session with the surrounding two days reduced.
 *
 * Two A races closer than 12 weeks apart cannot both be peaked for, so the engine says so and
 * plans the second as a B race rather than quietly failing to prepare the athlete for either.
 */

import {
  A_RACE_MIN_SEPARATION_WEEKS,
  C_RACE_REDUCED_SURROUNDING_DAYS,
  POST_RACE_MIN_RECOVERY_DAYS,
  TAPER_TABLE,
} from '../constants.js';
import { daysBetweenISO } from './generate.js';
import type { EventType } from './types.js';

export type RacePriority = 'A' | 'B' | 'C';

export interface RaceEntry {
  id: string;
  /** ISO calendar date. */
  date: string;
  eventType: EventType;
  priority: RacePriority;
  /** The athlete's expected finish time, hours — sets the G9 recovery block. */
  expectedDurationH?: number;
}

export type RaceTreatment = 'drives_macrocycle' | 'local_peak' | 'trained_through';

export interface ResolvedRace extends RaceEntry {
  /** Priority the plan actually uses — a demoted A race is planned as a B race. */
  effectivePriority: RacePriority;
  treatment: RaceTreatment;
  /** Taper length in days; 0 for a C race, which is trained through. */
  taperDays: number;
  /** Mandatory post-race recovery days (G9); undefined until an expected duration is known. */
  recoveryDays?: number;
  /** Days either side reduced around a trained-through C race. */
  reducedSurroundingDays: number;
  note: string;
}

export interface RaceCalendar {
  /** The A race that owns phase structure, if there is one. */
  primary?: ResolvedRace;
  races: ResolvedRace[];
  /** Athlete-readable warnings — currently A races too close together to both be peaked. */
  warnings: { code: string; message: string }[];
}

const g9RecoveryDays = (race: RaceEntry): number | undefined =>
  race.expectedDurationH === undefined
    ? undefined
    : Math.max(POST_RACE_MIN_RECOVERY_DAYS, Math.ceil(race.expectedDurationH));

function resolveOne(race: RaceEntry, effectivePriority: RacePriority, demoted: boolean): ResolvedRace {
  const recoveryDays = g9RecoveryDays(race);
  const base = { ...race, effectivePriority, reducedSurroundingDays: 0, ...(recoveryDays !== undefined ? { recoveryDays } : {}) };

  if (effectivePriority === 'A') {
    return {
      ...base,
      treatment: 'drives_macrocycle',
      taperDays: TAPER_TABLE[race.eventType].days,
      note: 'Your A race — the whole plan is built backwards from this date.',
    };
  }

  if (effectivePriority === 'B') {
    return {
      ...base,
      treatment: 'local_peak',
      taperDays: TAPER_TABLE[race.eventType].days,
      note: demoted
        ? 'Too close to your A race to peak for both, so this one is planned as a B race: a short taper, race, recover, then straight back into the plan.'
        : 'A B race — a short taper into it, then a recovery block, then you rejoin the plan. Your peak fitness target is unchanged.',
    };
  }

  return {
    ...base,
    treatment: 'trained_through',
    taperDays: 0,
    reducedSurroundingDays: C_RACE_REDUCED_SURROUNDING_DAYS,
    note: 'A C race — trained through as a race-pace session, with the two days either side eased.',
  };
}

/**
 * Resolve a race calendar into what the planner should actually do with each race, sorted by
 * date. A second A race inside the 12-week window is demoted to B, with a warning.
 */
export function resolveRaceCalendar(races: RaceEntry[]): RaceCalendar {
  const sorted = [...races].sort((a, b) => a.date.localeCompare(b.date));
  const warnings: { code: string; message: string }[] = [];

  let lastADate: string | undefined;
  const resolved = sorted.map((race) => {
    if (race.priority !== 'A') return resolveOne(race, race.priority, false);

    const gapWeeks = lastADate === undefined ? Infinity : daysBetweenISO(lastADate, race.date) / 7;
    if (gapWeeks < A_RACE_MIN_SEPARATION_WEEKS) {
      warnings.push({
        code: 'A_RACES_TOO_CLOSE',
        message: `Two A races ${Math.round(gapWeeks)} weeks apart — you can't peak for both, so the second is planned as a B race.`,
      });
      return resolveOne(race, 'B', true);
    }

    lastADate = race.date;
    return resolveOne(race, 'A', false);
  });

  const primary = resolved.find((r) => r.effectivePriority === 'A');
  return { ...(primary ? { primary } : {}), races: resolved, warnings };
}
