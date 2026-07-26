/**
 * lib/activities-demo.ts — the row shape the Activities list renders, plus a presentation seed
 * used only when there is nothing live to show (see `live-activities.ts`).
 *
 * These are stored activity *summaries*. The list never loads streams — that's the whole point
 * of the summary (hard rule #6); streams load only when an activity is opened.
 *
 * **A load figure is `number | null`, and null is common.** `internal_load` (TRIMP) is measured
 * at ingest, but only for activities uploaded after the athlete's model existed; `external_load`
 * (TSS) needs CP/CS/CSS and is null for everyone today; `perceived_load` needs an RPE, which
 * nothing in the app collects yet. The row renders "—" rather than a zero — a zero is a claim
 * that the session was effortless.
 */

export type ActivitySport = 'run' | 'bike' | 'swim' | 'strength' | 'other';

export interface ActivitySummary {
  id: string;
  dateLabel: string;
  dayLabel: string;
  sport: ActivitySport;
  title: string;
  durationMin: number;
  /** Null for a session with no distance recorded (a turbo session, most strength work). */
  distanceKm: number | null;
  /** The three §5.1 load models, stored per activity. Null where not computable — see above. */
  tss: number | null;
  trimp: number | null;
  srpe: number | null;
  /** `unplanned` = ingested but matched no scheduled session (`planned_workout_id` is null). */
  status: 'completed' | 'partial' | 'unplanned';
}

export const SPORT_META: Record<ActivitySport, { label: string; dot: string; text: string }> = {
  run: { label: 'Run', dot: 'bg-sport-run', text: 'text-sport-run' },
  bike: { label: 'Bike', dot: 'bg-sport-bike', text: 'text-sport-bike' },
  swim: { label: 'Swim', dot: 'bg-sport-swim', text: 'text-sport-swim' },
  strength: { label: 'Strength', dot: 'bg-sport-strength', text: 'text-sport-strength' },
  other: { label: 'Other', dot: 'bg-white/30', text: 'text-muted' },
};

export const ACTIVITIES: ActivitySummary[] = [
  { id: '1', dateLabel: '23 Jul', dayLabel: 'Wed', sport: 'bike', title: 'Easy spin', durationMin: 60, distanceKm: 30.2, tss: 45, trimp: 48, srpe: 42, status: 'completed' },
  { id: '2', dateLabel: '22 Jul', dayLabel: 'Tue', sport: 'bike', title: 'VO₂ intervals', durationMin: 65, distanceKm: 31.8, tss: 92, trimp: 78, srpe: 88, status: 'completed' },
  { id: '3', dateLabel: '21 Jul', dayLabel: 'Mon', sport: 'run', title: 'Easy run', durationMin: 45, distanceKm: 8.2, tss: 40, trimp: 44, srpe: 40, status: 'completed' },
  { id: '4', dateLabel: '20 Jul', dayLabel: 'Sun', sport: 'run', title: 'Long run', durationMin: 95, distanceKm: 17.6, tss: 120, trimp: 130, srpe: 118, status: 'completed' },
  { id: '5', dateLabel: '19 Jul', dayLabel: 'Sat', sport: 'bike', title: 'Long ride', durationMin: 210, distanceKm: 98.4, tss: 210, trimp: 190, srpe: 205, status: 'completed' },
  { id: '6', dateLabel: '17 Jul', dayLabel: 'Thu', sport: 'run', title: 'Threshold run', durationMin: 58, distanceKm: 11.0, tss: 118, trimp: 96, srpe: 132, status: 'partial' },
  { id: '7', dateLabel: '16 Jul', dayLabel: 'Wed', sport: 'swim', title: 'Technique', durationMin: 40, distanceKm: 2.0, tss: 35, trimp: 30, srpe: 38, status: 'completed' },
  { id: '8', dateLabel: '15 Jul', dayLabel: 'Tue', sport: 'run', title: 'Hill repeats', durationMin: 55, distanceKm: 10.4, tss: 98, trimp: 92, srpe: 100, status: 'completed' },
];

/**
 * Totals for the rendered list.
 *
 * The load total is **TRIMP only**, never a sum across metrics: TSS and TRIMP are different
 * scales, and adding them would produce a number that means nothing. Null when no activity in
 * the window carries a TRIMP.
 */
export function listTotals(items: ActivitySummary[]): { hours: number; count: number; trimp: number | null } {
  const minutes = items.reduce((a, x) => a + x.durationMin, 0);
  const measured = items.filter((x) => x.trimp !== null);
  return {
    hours: Math.round((minutes / 60) * 10) / 10,
    count: items.length,
    trimp: measured.length > 0 ? Math.round(measured.reduce((a, x) => a + (x.trimp ?? 0), 0)) : null,
  };
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}
