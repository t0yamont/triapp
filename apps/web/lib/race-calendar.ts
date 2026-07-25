/**
 * lib/race-calendar.ts — turns a set of races (the athlete's real ones, or the sample) into
 * what the Races page renders, by running them through the engine's `resolveRaceCalendar`
 * (§9) rather than having the page decide anything itself.
 *
 * Every planning decision on that page now comes from the engine: which race is primary,
 * whether a second A race had to be demoted because it sits inside the 12-week separation
 * window, each race's treatment, taper length and G9 recovery block. Only presentation —
 * labels, weeks-out — is derived here.
 */

import {
  layoutMacrocycle,
  resolveRaceCalendar,
  weeksToRace,
  type EventType,
  type MacroWeek,
  type RaceEntry,
  type ResolvedRace,
} from '@ironflow/core/physio';
import { EVENT_META, eventLabel } from './eventMeta';
import { formatRaceDate } from './raceCatalog';

export type Priority = 'A' | 'B' | 'C';

/** A race as the app knows it, before the engine decides what to do with it. */
export interface RaceSource {
  id: string;
  name: string;
  /** ISO calendar date. */
  date: string;
  eventType: EventType;
  /** What the athlete asked for — the engine may resolve it to something else. */
  priority: Priority;
  /** Athlete-facing detail: location, or expected conditions. */
  detail?: string;
  /** Expected finish time in hours — sets the G9 recovery block when known. */
  expectedDurationH?: number;
}

export interface RaceView extends RaceSource {
  /** The engine's verdict for this race. */
  resolved: ResolvedRace;
  weeksOut: number;
  dateLabel: string;
  eventLabel: string;
  /** True when the engine planned this race at a lower priority than the athlete asked for. */
  demoted: boolean;
}

export interface RaceCalendarView {
  /** The A race that owns phase structure — null if the athlete has no A race. */
  primary: RaceView | null;
  others: RaceView[];
  warnings: { code: string; message: string }[];
}

const toEntry = (r: RaceSource): RaceEntry => ({
  id: r.id,
  date: r.date,
  eventType: r.eventType,
  priority: r.priority,
  ...(r.expectedDurationH !== undefined ? { expectedDurationH: r.expectedDurationH } : {}),
});

export function buildRaceCalendar(races: RaceSource[], today: string): RaceCalendarView {
  const calendar = resolveRaceCalendar(races.map(toEntry));
  const bySource = new Map(races.map((r) => [r.id, r]));

  const views = calendar.races.flatMap<RaceView>((resolved) => {
    const source = bySource.get(resolved.id);
    if (!source) return []; // resolveRaceCalendar never invents ids; this just keeps the map total
    return [
      {
        ...source,
        resolved,
        weeksOut: Math.max(0, weeksToRace(today, resolved.date)),
        dateLabel: formatRaceDate(resolved.date),
        eventLabel: eventLabel(resolved.eventType),
        demoted: resolved.effectivePriority !== source.priority,
      },
    ];
  });

  const primaryId = calendar.primary?.id;
  const primary = views.find((v) => v.id === primaryId) ?? null;
  return { primary, others: views.filter((v) => v.id !== primary?.id), warnings: calendar.warnings };
}

/** The A race owns the plan structure — its full macrocycle, from today to race day. */
export function primaryMacro(race: RaceView): MacroWeek[] {
  return layoutMacrocycle({
    totalWeeks: Math.max(1, race.weeksOut),
    eventType: race.eventType,
    course: EVENT_META[race.eventType].course,
  });
}
