/**
 * lib/today-demo.ts — presentation glue for the Today screen (06-UX.md §5). This is *not*
 * physiology: every number the athlete sees is computed by the pure engine in
 * `@ironflow/core/physio` (readiness scoring §10.1, the daily response §10.2, field-test
 * scheduling §12). This module only supplies a representative athlete and maps the engine's
 * output into view props, so the screen is verifiable now and swaps to live Supabase reads
 * once a plan is generated and a device is connected (the app runs with or without env).
 */

import {
  adaptToday,
  nextFieldTest,
  readinessScore,
  type AdaptationResult,
  type DailyReadiness,
  type Distribution,
  type Readiness,
  type SZone,
} from '@ironflow/core/physio';
import { readinessClimate, type Climate } from './climate';
import { WEEKDAYS } from './days';

export type ViewSport = 'run' | 'bike' | 'swim' | 'strength';

/** One block of a session's shape, in engine-block order — renders as the interval bar (§7.1). */
export interface SessionInterval {
  minutes: number;
  zone: SZone;
}

export interface PlannedSession {
  name: string;
  sport: ViewSport;
  durationMin: number;
  plannedZone: SZone;
  why: string;
  targetRows: TargetRow[];
  /** Confidence of the anchor the targets are derived from (§2.4). */
  targetsConfidence: number;
  /** What the targets are anchored to, in the athlete's words — pairs with `targetsConfidence`
   *  so the confidence dot never floats without an explanation (§2.4, P2). */
  targetsNote: string;
  intervals: SessionInterval[];
}

export interface TargetRow {
  label: string;
  value: string;
  zone: SZone;
}

export interface UpcomingSession {
  dayShort: string;
  load: number;
  isKey: boolean;
  sport: ViewSport;
  zone: SZone;
  name: string;
  detail: string;
}

export interface WeekDayLoad {
  index: number;
  short: string;
  plannedLoad: number;
  doneLoad: number;
  isToday: boolean;
}

export interface WeekStripView {
  days: WeekDayLoad[];
  plannedTotal: number;
  doneTotal: number;
  distributionActual: Distribution;
  distributionTarget: Distribution;
}

export interface AttentionItem {
  kind: 'test' | 'gate' | 'plan_change';
  title: string;
  detail: string;
  tone: 'accent' | 'warn' | 'risk';
}

export interface TodayView {
  /** True while the screen is driven by a representative athlete, not live data. */
  isSample: boolean;
  athleteName: string;
  dateLabel: string;
  climate: Climate;
  readiness: Readiness;
  /** One sentence explaining today's readiness state — the adaptation reason when adapted,
   *  else a band-appropriate reassurance. Never the score alone (§16, P2). */
  readinessLine: string;
  session: PlannedSession;
  effectiveZone: SZone;
  adaptation: AdaptationResult;
  week: WeekStripView;
  comingUp: UpcomingSession[];
  attention: AttentionItem[];
}

// ── Representative athlete (preview seed) ─────────────────────────────────────
// A long-course triathlete mid-Build, waking a little flat: HRV and resting HR are down,
// so the engine eases today's planned VO₂ session. Sleep/wellness are fine — the nuance the
// "never the score alone" rule (§16, P2) exists to surface.

const READINESS_INPUTS = {
  hrv: { rolling: 48, baseline: 52, sd: 5 }, // ↓ ~0.8 SD
  restingHr: { rolling: 44, baseline: 42, sd: 3 }, // ↑ 2 bpm (worse)
  sleep: { rolling: 7.2, baseline: 7.5, sd: 0.6 },
  wellness: { rolling: 3.4, baseline: 3.6, sd: 0.5 },
  completionRate: 0.9,
} as const;

const READINESS_HISTORY: DailyReadiness[] = [{ band: 'within' }, { band: 'within' }, { band: 'below' }];

const PLANNED_SESSION: PlannedSession = {
  name: 'VO₂ intervals',
  sport: 'bike',
  durationMin: 75,
  plannedZone: 'S3',
  why: 'Peak aerobic power — the top-end stimulus your Build phase is short on.',
  targetRows: [
    { label: 'Warm-up', value: '12m · 180–200 W', zone: 'S1' },
    { label: 'Main 3×', value: '5m · 300–330 W', zone: 'S3' },
    { label: 'Recovery 3×', value: '3m · 160–180 W', zone: 'S1' },
    { label: 'Cool-down', value: '12m · 150–170 W', zone: 'S1' },
  ],
  targetsConfidence: 0.72,
  targetsNote: 'Watts from your ramp test, 34 days ago',
  // 3 × 13 × (30s hard / 15s easy) rolled up to block level for the shape bar (§7.1).
  intervals: [
    { minutes: 12, zone: 'S1' },
    { minutes: 15, zone: 'S3' },
    { minutes: 3, zone: 'S1' },
    { minutes: 15, zone: 'S3' },
    { minutes: 3, zone: 'S1' },
    { minutes: 15, zone: 'S3' },
    { minutes: 12, zone: 'S1' },
  ],
};

// Planned vs completed daily load across the training week (Mon-first). Today is Thursday.
const WEEK_PLANNED: Record<number, number> = { 1: 60, 2: 180, 3: 60, 4: 225, 5: 90, 6: 240, 0: 55 };
const WEEK_DONE: Record<number, number> = { 1: 58, 2: 180, 3: 66, 4: 0, 5: 0, 6: 0, 0: 0 };
const TODAY_INDEX = 4;

const COMING_UP: UpcomingSession[] = [
  { dayShort: 'Fri', load: WEEK_PLANNED[5]!, isKey: false, sport: 'swim', zone: 'S1', name: 'Swim Technique', detail: '45m · S1 · easy by design' },
  { dayShort: 'Sat', load: WEEK_PLANNED[6]!, isKey: true, sport: 'bike', zone: 'S2', name: 'Long Ride + Brick Run', detail: '3h 30m · S1/S2 · race simulation' },
  { dayShort: 'Sun', load: WEEK_PLANNED[0]!, isKey: false, sport: 'run', zone: 'S1', name: 'Aerobic Run', detail: "50m · S1 · off yesterday's ride" },
];

const DISTRIBUTION_ACTUAL: Distribution = { S1: 82, S2: 9, S3: 9 };
const DISTRIBUTION_TARGET: Distribution = { S1: 80, S2: 15, S3: 5 };

function buildWeek(): WeekStripView {
  const days: WeekDayLoad[] = WEEKDAYS.map((d) => ({
    index: d.index,
    short: d.short,
    plannedLoad: WEEK_PLANNED[d.index] ?? 0,
    doneLoad: WEEK_DONE[d.index] ?? 0,
    isToday: d.index === TODAY_INDEX,
  }));
  return {
    days,
    plannedTotal: days.reduce((a, d) => a + d.plannedLoad, 0),
    doneTotal: days.reduce((a, d) => a + d.doneLoad, 0),
    distributionActual: DISTRIBUTION_ACTUAL,
    distributionTarget: DISTRIBUTION_TARGET,
  };
}

function buildAttention(adaptation: AdaptationResult): AttentionItem[] {
  const items: AttentionItem[] = [];

  // A plan change awaiting acknowledgement (only when today was adapted).
  if (adaptation.action !== 'none' && adaptation.mutation) {
    items.push({
      kind: 'plan_change',
      title: 'Today was adjusted',
      detail: adaptation.mutation.reasonText,
      tone: 'warn',
    });
  }

  // A scheduled field test, straight from the §12 scheduler.
  const test = nextFieldTest({
    confidence: 0.72,
    weeksSinceLastTest: 8,
    primarySport: 'bike',
  });
  if (test) {
    items.push({ kind: 'test', title: 'Test scheduled', detail: test.reasonText, tone: 'accent' });
  }

  return items;
}

// The sample athlete is mid-Build (not peaking) — the climate follows their readiness.
const PEAKING = false;

/**
 * One sentence for "why this readiness". Reuses the engine's own adaptation reason when
 * today was adapted (P1 — the athlete-readable text is never re-authored, only surfaced),
 * else a band-appropriate reassurance. Never the score alone (§16, P2).
 */
function readinessNarrative(band: Readiness['band'], adaptation: AdaptationResult): string {
  if (adaptation.action !== 'none' && adaptation.mutation) return adaptation.mutation.reasonText;
  if (band === 'below') return "Readiness dipped below your normal range, but not enough yet to change today's plan.";
  if (band === 'unknown') return 'Not enough signal yet — connect a wearable or log daily wellness to sharpen this.';
  return 'Every signal is inside your normal range. The plan stands as written.';
}

export function buildTodayView(): TodayView {
  const readiness = readinessScore(READINESS_INPUTS);
  const adaptation = adaptToday(READINESS_HISTORY, PLANNED_SESSION.plannedZone);
  const effectiveZone: SZone = adaptation.action === 'downgrade_s3_to_s2' ? 'S2' : PLANNED_SESSION.plannedZone;

  return {
    isSample: true,
    athleteName: 'Sample athlete',
    dateLabel: 'Thursday, Build week 3',
    climate: readinessClimate({ band: readiness.band, action: adaptation.action, peaking: PEAKING }),
    readiness,
    readinessLine: readinessNarrative(readiness.band, adaptation),
    session: PLANNED_SESSION,
    effectiveZone,
    adaptation,
    week: buildWeek(),
    comingUp: COMING_UP,
    attention: buildAttention(adaptation),
  };
}

/** The athlete's ambient readiness climate — drives the background tint app-wide (layout). */
export function currentClimate(): Climate {
  const readiness = readinessScore(READINESS_INPUTS);
  const adaptation = adaptToday(READINESS_HISTORY, PLANNED_SESSION.plannedZone);
  return readinessClimate({ band: readiness.band, action: adaptation.action, peaking: PEAKING });
}
