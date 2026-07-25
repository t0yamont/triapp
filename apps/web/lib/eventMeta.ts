import type { CourseType, EventType } from '@ironflow/core/physio';

/**
 * Display metadata for each race distance the planner supports, plus the short/long course
 * split `generatePlan` needs. Presentation-only — the actual week counts and entry
 * requirements live in the engine (`constants.ts` PLAN_WEEKS_BY_EVENT / EVENT_ENTRY_REQUIREMENTS).
 */
export const EVENT_META: Record<EventType, { label: string; course: CourseType; isRun: boolean }> = {
  sprint_tri: { label: 'Sprint triathlon', course: 'short', isRun: false },
  olympic_tri: { label: 'Olympic triathlon', course: 'short', isRun: false },
  '70.3': { label: 'Half-distance (70.3)', course: 'long', isRun: false },
  ironman: { label: 'Full-distance (Ironman)', course: 'long', isRun: false },
  '5k': { label: '5K', course: 'short', isRun: true },
  '10k': { label: '10K', course: 'short', isRun: true },
  half_marathon: { label: 'Half marathon', course: 'short', isRun: true },
  marathon: { label: 'Marathon', course: 'long', isRun: true },
};

export const EVENT_TYPES = Object.keys(EVENT_META) as EventType[];
