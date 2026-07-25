/**
 * lib/races-demo.ts — the sample athlete's race calendar (06-UX.md §5; §9 race handling),
 * shown when there is nothing live to read.
 *
 * These are only the raw races. Everything the page shows about them — which one drives the
 * macrocycle, each race's treatment, taper and recovery — is resolved by the engine in
 * `race-calendar.ts`, so the sample and a real athlete's calendar go through exactly the same
 * code path.
 */

import type { RaceSource } from './race-calendar';

export const DEMO_RACES: RaceSource[] = [
  {
    id: 'a',
    name: 'Outlaw Full',
    date: '2026-11-27',
    eventType: 'ironman',
    priority: 'A',
    detail: 'Cool, likely wet · flat bike',
    expectedDurationH: 12,
  },
  {
    id: 'b',
    name: 'Nottingham Olympic',
    date: '2026-09-11',
    eventType: 'olympic_tri',
    priority: 'B',
    detail: 'Mild · rolling',
  },
  {
    id: 'c',
    name: 'Parkrun 10k',
    date: '2026-08-14',
    eventType: '10k',
    priority: 'C',
    detail: 'Local, flat',
  },
];
