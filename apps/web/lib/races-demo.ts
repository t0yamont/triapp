/**
 * lib/races-demo.ts — presentation glue for Races (06-UX.md §5; §9 race handling). The A race
 * drives the macrocycle, so its periodisation is computed by the engine's `layoutMacrocycle`.
 * Representative races; swaps to a live races read later.
 */

import { layoutMacrocycle, type CourseType, type EventType, type MacroWeek } from '@ironflow/core/physio';

export type Priority = 'A' | 'B' | 'C';

export interface RaceView {
  id: string;
  name: string;
  dateLabel: string;
  weeksOut: number;
  eventLabel: string;
  eventType: EventType;
  course: CourseType;
  priority: Priority;
  conditions: string;
}

export const RACES: RaceView[] = [
  {
    id: 'a',
    name: 'Outlaw Full',
    dateLabel: '27 Nov 2026',
    weeksOut: 18,
    eventLabel: 'Ironman · 3.8k / 180k / 42.2k',
    eventType: 'ironman',
    course: 'long',
    priority: 'A',
    conditions: 'Cool, likely wet · flat bike',
  },
  {
    id: 'b',
    name: 'Nottingham Olympic',
    dateLabel: '11 Sep 2026',
    weeksOut: 7,
    eventLabel: 'Olympic · 1.5k / 40k / 10k',
    eventType: 'olympic_tri',
    course: 'short',
    priority: 'B',
    conditions: 'Mild · rolling',
  },
  {
    id: 'c',
    name: 'Parkrun 10k',
    dateLabel: '14 Aug 2026',
    weeksOut: 3,
    eventLabel: '10k road',
    eventType: '10k',
    course: 'short',
    priority: 'C',
    conditions: 'Trained through',
  },
];

/** The A race owns the plan structure — its full macrocycle, from now to race day. */
export function aRaceMacro(race: RaceView): MacroWeek[] {
  return layoutMacrocycle({ totalWeeks: race.weeksOut, eventType: race.eventType, course: race.course });
}
