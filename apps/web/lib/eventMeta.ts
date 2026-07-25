import type { CourseType, EventType } from '@ironflow/core/physio';

/**
 * Display metadata for each race distance the planner supports, plus the short/long course
 * split `generatePlan` needs. Presentation-only — the actual week counts and entry
 * requirements live in the engine (`constants.ts` PLAN_WEEKS_BY_EVENT / EVENT_ENTRY_REQUIREMENTS).
 */
export const EVENT_META: Record<
  EventType,
  { label: string; course: CourseType; isRun: boolean; distances: string }
> = {
  sprint_tri: { label: 'Sprint triathlon', course: 'short', isRun: false, distances: '750m / 20k / 5k' },
  olympic_tri: { label: 'Olympic triathlon', course: 'short', isRun: false, distances: '1.5k / 40k / 10k' },
  '70.3': { label: 'Half-distance (70.3)', course: 'long', isRun: false, distances: '1.9k / 90k / 21.1k' },
  ironman: { label: 'Full-distance (Ironman)', course: 'long', isRun: false, distances: '3.8k / 180k / 42.2k' },
  '5k': { label: '5K', course: 'short', isRun: true, distances: '5k road' },
  '10k': { label: '10K', course: 'short', isRun: true, distances: '10k road' },
  half_marathon: { label: 'Half marathon', course: 'short', isRun: true, distances: '21.1k road' },
  marathon: { label: 'Marathon', course: 'long', isRun: true, distances: '42.2k road' },
};

/** "Olympic triathlon · 1.5k / 40k / 10k" — the one-line event description used on cards. */
export const eventLabel = (eventType: EventType): string =>
  `${EVENT_META[eventType].label} · ${EVENT_META[eventType].distances}`;

export const EVENT_TYPES = Object.keys(EVENT_META) as EventType[];
