/**
 * lib/activities-demo.ts — presentation seed for the Activities list. These are stored activity
 * *summaries* (the three load figures are computed server-side from streams and persisted). The
 * list never loads streams — that's the whole point of the summary (hard rule #6); streams load
 * only when an activity is opened. Swaps to a live, paginated read later.
 */

export type ActivitySport = 'run' | 'bike' | 'swim';

export interface ActivitySummary {
  id: string;
  dateLabel: string;
  dayLabel: string;
  sport: ActivitySport;
  title: string;
  durationMin: number;
  distanceKm: number;
  /** The three §5.1 load models, stored per activity. They can legitimately disagree. */
  tss: number;
  trimp: number;
  srpe: number;
  status: 'completed' | 'partial';
}

export const SPORT_META: Record<ActivitySport, { label: string; dot: string; text: string }> = {
  run: { label: 'Run', dot: 'bg-sport-run', text: 'text-sport-run' },
  bike: { label: 'Bike', dot: 'bg-sport-bike', text: 'text-sport-bike' },
  swim: { label: 'Swim', dot: 'bg-sport-swim', text: 'text-sport-swim' },
};

/** Load models disagree enough to flag when the spread exceeds ~20% of the largest (§5.1, F11). */
export function loadsDisagree(a: ActivitySummary): boolean {
  const max = Math.max(a.tss, a.trimp, a.srpe);
  const min = Math.min(a.tss, a.trimp, a.srpe);
  return max > 0 && (max - min) / max > 0.2;
}

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

export function weekTotals(items: ActivitySummary[]): { hours: number; loadTss: number; count: number } {
  const minutes = items.reduce((a, x) => a + x.durationMin, 0);
  return { hours: Math.round((minutes / 60) * 10) / 10, loadTss: items.reduce((a, x) => a + x.tss, 0), count: items.length };
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}
