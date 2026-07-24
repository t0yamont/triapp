/**
 * lib/calendar-demo.ts — a representative training week for the Calendar (06-UX.md §5), plus
 * the display vocabulary. Presentation glue only: the week is a plain `GuardrailWeek` that the
 * pure engine (`moveSession`, `isValidWeek`) operates on when the athlete drags a session.
 * Swaps to a live plan_weeks read once plans are persisted.
 */

import { TRIMP_ZONE_WEIGHTS, type GuardrailWeek, type PlanSport, type SessionPurpose, type SZone, type WeekSession } from '@ironflow/core/physio';

const s = (
  dayOfWeek: number,
  sport: PlanSport,
  sZone: SZone,
  purpose: SessionPurpose,
  durationMin: number,
  isHard: boolean,
): WeekSession => ({
  dayOfWeek,
  sport,
  sZone,
  purpose,
  durationMin,
  load: durationMin * TRIMP_ZONE_WEIGHTS[sZone],
  isHard,
});

/** Mon-anchored build week: two long key days, two quality days, a rest day, guardrail-valid. */
export const SAMPLE_WEEK: GuardrailWeek = {
  phase: 'build',
  isRecoveryWeek: false,
  hoursCeiling: 12,
  priorWeekLoad: 720,
  sessions: [
    s(1, 'run', 'S1', 'aerobic_volume', 45, false),
    s(2, 'bike', 'S3', 'vo2max', 45, true),
    s(3, 'swim', 'S1', 'technique', 40, false),
    s(4, 'run', 'S2', 'threshold', 60, true),
    s(6, 'bike', 'S1', 'durability', 210, true),
    s(0, 'run', 'S2', 'durability', 95, true),
  ],
};

/** The sample athlete can train any day (gives the repair search room). */
export const AVAILABLE_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Today, for the "current day" accent. */
export const TODAY_INDEX = 4;

export const SPORT_META: Record<PlanSport, { label: string; dot: string; tint: string; text: string }> = {
  run: { label: 'Run', dot: 'bg-sport-run', tint: 'border-sport-run/30 bg-sport-run/[0.08]', text: 'text-sport-run' },
  bike: { label: 'Bike', dot: 'bg-sport-bike', tint: 'border-sport-bike/30 bg-sport-bike/[0.08]', text: 'text-sport-bike' },
  swim: { label: 'Swim', dot: 'bg-sport-swim', tint: 'border-sport-swim/30 bg-sport-swim/[0.08]', text: 'text-sport-swim' },
  strength: { label: 'Strength', dot: 'bg-sport-strength', tint: 'border-sport-strength/30 bg-sport-strength/[0.08]', text: 'text-sport-strength' },
  brick: { label: 'Brick', dot: 'bg-sport-run', tint: 'border-sport-run/30 bg-sport-run/[0.08]', text: 'text-sport-run' },
};

const ZONE_LABEL: Record<SZone, string> = { S1: 'Easy', S2: 'Threshold', S3: 'VO₂' };
export const zoneLabel = (z: SZone): string => ZONE_LABEL[z];

const PURPOSE_TITLE: Partial<Record<SessionPurpose, string>> = {
  aerobic_volume: 'Easy',
  threshold: 'Threshold',
  vo2max: 'VO₂',
  race_specific: 'Race-pace',
  durability: 'Long',
  technique: 'Technique',
  recovery: 'Recovery',
  heat_adaptation: 'Heat',
  field_test: 'Test',
};

export function sessionTitle(session: WeekSession): string {
  const lead = session.purpose ? PURPOSE_TITLE[session.purpose] : undefined;
  return `${lead ?? ''} ${SPORT_META[session.sport].label}`.trim();
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}
