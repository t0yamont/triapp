/**
 * plan/types.ts — types for periodisation, weeks, and the guardrail system (§4, §5.3, §8).
 */

import type { TAPER_TABLE } from '../constants.js';
import type { SZone } from '../types.js';

export type PlanPhase = 'base' | 'build' | 'peak' | 'taper' | 'recovery' | 'race_week' | 'transition';

/** Short course (sprint/Olympic/5–10 k) vs long course (70.3/IM/marathon) — drives §4.2. */
export type CourseType = 'short' | 'long';

/** A-race events with a defined taper (§8.3). */
export type EventType = keyof typeof TAPER_TABLE;

export type PlanSport = 'run' | 'bike' | 'swim' | 'brick' | 'strength';

export type SessionPurpose =
  | 'aerobic_volume'
  | 'threshold'
  | 'vo2max'
  | 'race_specific'
  | 'durability'
  | 'technique'
  | 'recovery'
  | 'brick'
  | 'strength'
  | 'heat_adaptation'
  | 'field_test'
  | 'rest';

/** A distribution target/measurement across the 3-zone accounting frame. */
export type Distribution = Record<SZone, number>;

export interface WeekSession {
  /** 0 = Sun .. 6 = Sat. */
  dayOfWeek: number;
  sport: PlanSport;
  sZone: SZone;
  purpose?: SessionPurpose;
  durationMin: number;
  /** Planned load for this session (any of the §5 load metrics; used for guardrails). */
  load: number;
  /** A key hard session. A brick counts as one hard day (G5). */
  isHard: boolean;
}

/** A week presented to the guardrail validator. */
export interface GuardrailWeek {
  phase: PlanPhase;
  isRecoveryWeek: boolean;
  /** Athlete-declared weekly hour ceiling (G10). */
  hoursCeiling: number;
  sessions: WeekSession[];
  /** Preceding week's total load — required to check the recovery-week range (G4). */
  priorWeekLoad?: number;
  /** Preceding week's longest session per sport, in minutes — required for G2. */
  priorLongestBySport?: Partial<Record<PlanSport, number>>;
  /** The athlete's 12-week rolling mean strain — required for G8. */
  strainRollingMean?: number;
  /** Days since the athlete's last race as of this week's first day — required for G9. */
  daysSinceRace?: number;
  /** That race's duration in hours — sets the G9 recovery window. */
  raceDurationH?: number;
}

export interface Violation {
  /** Machine-readable reason code (P1, §10). */
  code: string;
  message: string;
}

export interface TaperWeek {
  /** 1 = first taper week .. N = race week. */
  weekNumber: number;
  load: number;
  sessionCount: number;
  hasS3Session: boolean;
  hasRacePaceSession: boolean;
  isRaceWeek: boolean;
  /** Final 48 h short activation session (§8.3). */
  hasActivationSession: boolean;
}
