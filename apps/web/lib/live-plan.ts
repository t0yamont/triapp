'use client';

/**
 * lib/live-plan.ts — reads the athlete's persisted plan (training_plans → plan_weeks →
 * workouts) for the current week and maps it into the shapes the UI already speaks:
 * a `GuardrailWeek` for the Calendar and the Today week/coming-up views.
 *
 * Returns null whenever there is nothing live to show (no Supabase env, not signed in, no
 * active plan, or an empty week) so every caller falls back to the sample athlete.
 *
 * Dates are the athlete's *local* calendar days (hard rule #8): stored as plain dates, and
 * parsed/compared as local parts so a UTC boundary never shifts a session to the wrong day.
 */

import {
  fromWorkoutRow,
  getActivePlan,
  getCurrentZones,
  getPlanWeeks,
  getWorkoutsInRange,
  zoneSetSchema,
  type Tables,
} from '@ironflow/api-client';
import {
  addDaysISO,
  dayOfWeekISO,
  distributionTarget,
  weekStartISO,
  type Distribution,
  type GuardrailWeek,
  type PlanPhase,
  sessionTargets,
  type AthleteCapabilities,
  type SessionTarget,
  type SZone,
  type TargetModality,
  type WeekSession,
  type ZoneId,
  type ZoneSet,
} from '@ironflow/core/physio';
import { useEffect, useState } from 'react';
import { WEEKDAYS } from './days';
import { useSupabase } from './supabase';
import type { PlannedSession, SessionInterval, UpcomingSession, ViewSport, WeekStripView } from './today-demo';

export { dayOfWeekISO };

const DEFAULT_HOURS_CEILING = 12;

/** The athlete's own "today" — a local calendar day, so their evening isn't tomorrow. */
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

// ── Row → view mappers ───────────────────────────────────────────────────────

type WorkoutRow = Tables<'workouts'>;

const zoneMinutes = (rows: WorkoutRow[], zone: 'S1' | 'S2' | 'S3'): number =>
  rows.filter((w) => w.goal_zone === zone).reduce((a, w) => a + w.planned_duration_min, 0);

function liveDistribution(rows: WorkoutRow[]): Distribution {
  const total = rows.reduce((a, w) => a + w.planned_duration_min, 0);
  if (total === 0) return { S1: 0, S2: 0, S3: 0 };
  const pct = (z: 'S1' | 'S2' | 'S3') => Math.round((zoneMinutes(rows, z) / total) * 100);
  return { S1: pct('S1'), S2: pct('S2'), S3: pct('S3') };
}

export function toWeekStrip(rows: WorkoutRow[], phase: PlanPhase, today: string): WeekStripView {
  const days = WEEKDAYS.map((d) => {
    const forDay = rows.filter((w) => dayOfWeekISO(w.scheduled_date) === d.index);
    return {
      index: d.index,
      short: d.short,
      plannedLoad: forDay.reduce((a, w) => a + w.planned_load, 0),
      // ponytail: completed ⇒ its planned load. Actual load needs the linked activity's
      // computed load — swap when activities are ingested and joined.
      doneLoad: forDay.filter((w) => w.status === 'completed').reduce((a, w) => a + w.planned_load, 0),
      isToday: d.index === dayOfWeekISO(today),
    };
  });
  return {
    days,
    plannedTotal: days.reduce((a, d) => a + d.plannedLoad, 0),
    doneTotal: days.reduce((a, d) => a + d.doneLoad, 0),
    distributionActual: liveDistribution(rows),
    distributionTarget: distributionTarget(phase, 'long'),
  };
}

// ── Today's actual session ───────────────────────────────────────────────────

/**
 * Why the athlete is being asked to do this, per `workouts.purpose` (§7.2).
 *
 * One sentence each, and none of them invent a physiological claim the row doesn't support.
 * The planner now assigns real purposes (§7.2 — `vo2max`, `durability`, `technique`, `recovery`,
 * `aerobic_volume`), and the map covers the whole enum so a purpose the planner starts emitting
 * later can never surface as an empty headline.
 *
 * `description` wins when the row has one; this is the fallback.
 */
const PURPOSE_WHY: Record<Tables<'workouts'>['purpose'], string> = {
  aerobic_volume: 'Aerobic volume — the base everything else is built on. Keep it genuinely easy.',
  threshold: 'Threshold work — time spent at the edge of what you can sustain.',
  vo2max: 'Peak aerobic power — the top-end stimulus, and the hardest to recover from.',
  race_specific: 'Race-specific — rehearsing the intensity and terrain of your A race.',
  durability: 'Durability — holding form and heart-rate control deep into a long session.',
  technique: 'Technique — quality of movement, not load. Stop when form goes.',
  recovery: 'Recovery — deliberately easy. The adaptation happens now, not in the session.',
  brick: 'Brick — the bike-to-run transition your body has to rehearse.',
  strength: 'Strength — the injury-resilience work that keeps the endurance training possible.',
  heat_adaptation: 'Heat adaptation — training the cooling response your race day will demand.',
  field_test: 'Field test — this one sets the numbers every other session is prescribed from.',
  rest: 'Rest. Nothing to do, and that is the session.',
};

/**
 * Flatten a stored `WorkoutStructure` into the shape bar's blocks (§7.1).
 *
 * `repeat` elements are expanded, then adjacent blocks in the same zone are merged — a bike
 * VO₂ session is 3×13×(30/15), and 78 alternating slivers render as visual noise rather than
 * a silhouette. Merging keeps the *shape* (hard/easy alternation at set level) while staying
 * faithful to the real prescription.
 *
 * Returns null for anything that isn't a recognisable structure, so an older row written by
 * the pre-§7 placeholder (`{ kind: 'steady', ... }`) falls back rather than rendering nothing.
 */
export function toSessionIntervals(structure: unknown): SessionInterval[] | null {
  const steps = (structure as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return null;

  const flat: { minutes: number; zone: SZone }[] = [];
  const push = (minutes: number, zone: SZone): void => {
    const last = flat[flat.length - 1];
    if (last && last.zone === zone) last.minutes += minutes;
    else flat.push({ minutes, zone });
  };

  const walk = (elements: unknown[], multiplier: number): void => {
    for (const el of elements) {
      const e = el as { kind?: string; durationSec?: number; targetZone?: SZone; count?: number; steps?: unknown[] };
      if (e.kind === 'step' && typeof e.durationSec === 'number' && e.targetZone) {
        push((e.durationSec * multiplier) / 60, e.targetZone);
      } else if (e.kind === 'repeat' && Array.isArray(e.steps) && typeof e.count === 'number') {
        // A bike VO₂ set is 13 × (30 s / 15 s): expanding it gives 26 alternating slivers that
        // no bar 16 pixels tall can show. Past a readable budget the repetitions are summed
        // instead — one work block, one recovery block, same totals and the same alternation
        // at set level. Under the budget (a run's 5 × 3 min) every repetition is drawn.
        if (e.count * e.steps.length <= MAX_EXPANDED_BLOCKS) {
          for (let i = 0; i < e.count; i++) walk(e.steps, multiplier);
        } else {
          walk(e.steps, multiplier * e.count);
        }
      }
    }
  };
  walk(steps, 1);
  if (flat.length === 0) return null;

  return roundPreservingTotal(flat);
}

/** Above this many blocks, a repeat is summed rather than drawn out. */
const MAX_EXPANDED_BLOCKS = 12;

/**
 * Round block minutes so they still sum to the session's true total (largest remainder).
 *
 * Rounding each block independently drifts — a 40-minute session of 3.5-minute reps renders as
 * 43 — and the panel prints the session duration right beside the bar, so the two would
 * visibly disagree. Same technique `distribution/classify.ts` uses to keep percentages at 100.
 */
function roundPreservingTotal(blocks: { minutes: number; zone: SZone }[]): SessionInterval[] {
  const total = Math.round(blocks.reduce((a, b) => a + b.minutes, 0));
  const out = blocks.map((b) => ({ minutes: Math.floor(b.minutes), zone: b.zone }));
  const order = blocks
    .map((b, i) => ({ i, frac: b.minutes - Math.floor(b.minutes) }))
    .sort((a, b) => b.frac - a.frac);

  let remainder = total - out.reduce((a, b) => a + b.minutes, 0);
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i]!.minutes += 1;
    remainder -= 1;
  }
  return out;
}

/** The 5-zone bands that roll up into each 3-zone bucket (§3.3). */
const ZONES_IN: Record<SZone, ZoneId[]> = { S1: ['Z1', 'Z2'], S2: ['Z3', 'Z4'], S3: ['Z5'] };

/** The bpm span of an S-zone: the floor of its lowest band to the ceiling of its highest. */
function bpmRange(zoneSet: ZoneSet, sZone: SZone): { lo: number; hi: number } | null {
  const bands = zoneSet.zones.filter((z) => ZONES_IN[sZone].includes(z.id));
  if (bands.length === 0) return null;
  return {
    lo: Math.round(Math.min(...bands.map((b) => b.lower.bpm))),
    hi: Math.round(Math.max(...bands.map((b) => b.upper.bpm))),
  };
}

/**
 * The athlete's real session for a day, from the persisted workout row.
 *
 * **This is the screen's headline, and it used to be the sample athlete's session — always.**
 * `VerdictHero` and `SessionShapePanel` both rendered `buildTodayView().session`, so every
 * athlete was shown "VO₂ intervals · 75m · 3×5m @ 300–330 W" no matter what their own plan
 * said, while §10.2 quietly adapted the *real* row underneath. Wrong-but-plausible output is
 * the failure mode this domain punishes hardest.
 *
 * The interval silhouette is now the **real** §7.2 render (`D-SESSION-LIBRARY-WIRED`): a bike
 * VO₂ session shows its 30/15 sets, a run shows its 3–4 min reps, a long Build ride shows its
 * race-pace final third. A plan written before that change stored a `{ kind: 'steady' }`
 * placeholder with no steps, so `toSessionIntervals` returns null for those and the session
 * falls back to a single block rather than inventing one.
 *
 * Still deliberately **not** invented: targets without zones. With no `ZoneSet` the row carries
 * duration only and `targetsConfidence: 0` — an honest "we cannot anchor this yet" rather than
 * a number with no evidence behind it.
 */
export function toPlannedSession(row: WorkoutRow, zoneSet: ZoneSet | null): PlannedSession | null {
  // `other` has no view sport and no zone system; it is stored, never prescribed.
  if (row.sport === 'other') return null;

  const sZone = row.goal_zone;
  const sport = row.sport;

  // §14's targets, in whatever modalities this athlete's data supports. RPE always appears
  // because it needs no sensor — which is exactly why §14 falls back to it, and why a session
  // is never left with a null target (F15).
  const targets = sessionTargets(sport, sZone, capabilitiesOf(zoneSet), zoneSet ?? undefined);

  return {
    name: row.name,
    sport: (sport === 'brick' ? 'run' : sport) as ViewSport,
    durationMin: row.planned_duration_min,
    plannedZone: sZone,
    why: row.description ?? PURPOSE_WHY[row.purpose],
    targetRows: targets.map((t) => ({ ...TARGET_ROW[t.modality](t), zone: sZone })),
    targetsConfidence: zoneSet?.anchorConfidence ?? 0,
    targetsNote: zoneSet
      ? `Heart-rate targets from your ${zoneSet.mode === 'threshold_anchored' ? 'measured thresholds' : 'heart-rate reserve'}; effort is the CR10 scale`
      : 'No heart-rate zones yet — go by effort, and check in a few mornings to unlock HR targets',
    intervals: toSessionIntervals(row.structure) ?? [{ minutes: row.planned_duration_min, zone: sZone }],
  };
}

/**
 * What the app can currently attest to about an athlete's data (§14).
 *
 * Deliberately conservative: §14's safest answer is the degraded one, so anything not positively
 * known is `false`, which yields an RPE prescription rather than a fabricated number.
 *
 * - `hasHr` is real — a zone set exists only when HR anchors were derived.
 * - The rest are honestly `false` today: **no athlete has a CP/CS/CSS anchor**, so no power or
 *   pace target is expressible for anyone, and nothing yet inspects activity history for a power
 *   meter or swim data. Wire those to real detection alongside the field-test capture screen.
 */
export function capabilitiesOf(zoneSet: ZoneSet | null): AthleteCapabilities {
  return {
    hasHr: zoneSet !== null,
    hasHrv: false,
    hasPowerMeter: false,
    hasRunningGps: false,
    hasSwimData: false,
    hasSleepDevice: false,
  };
}

/** How each §14 modality reads on the session card. */
const TARGET_ROW: Record<TargetModality, (t: SessionTarget) => { label: string; value: string }> = {
  hr: (t) => ({ label: 'Heart rate', value: `${t.band!.lo}–${t.band!.hi} bpm` }),
  rpe: (t) => ({ label: 'Effort', value: `RPE ${t.band!.lo}–${t.band!.hi} of 10` }),
  power: () => ({ label: 'Power', value: 'needs a threshold test' }),
  pace: () => ({ label: 'Pace', value: 'needs a threshold test' }),
  stroke_count: () => ({ label: 'Stroke count', value: 'hold it steady across lengths' }),
};

const SHORT_OF = new Map(WEEKDAYS.map((d) => [d.index, d.short]));

export function toComingUp(rows: WorkoutRow[], today: string): UpcomingSession[] {
  return rows
    .filter((w) => w.scheduled_date > today && fromWorkoutRow(w) !== null)
    .slice(0, 3)
    .map((w) => ({
      dayShort: SHORT_OF.get(dayOfWeekISO(w.scheduled_date)) ?? '',
      load: w.planned_load,
      isKey: w.is_key_session,
      sport: (w.sport === 'brick' ? 'run' : w.sport) as ViewSport,
      zone: w.goal_zone,
      name: w.name,
      detail: `${w.planned_duration_min}m · ${w.goal_zone}`,
    }));
}

// ── The hook ─────────────────────────────────────────────────────────────────

export interface LiveWeek {
  week: GuardrailWeek;
  strip: WeekStripView;
  comingUp: UpcomingSession[];
  /**
   * Today's real session, ready to render — null when nothing is scheduled today (a rest day),
   * or when the sport has no view representation.
   */
  todaySession: PlannedSession | null;
  /** Everything a write-back needs: which plan, which week, and the rows behind the sessions. */
  athleteId: string;
  planId: string;
  weekStart: string;
  rows: WorkoutRow[];
}

/** This week's persisted plan, or null when there is nothing live (⇒ caller uses the sample). */
export function useLiveWeek(): { live: LiveWeek | null; loading: boolean } {
  const supabase = useSupabase();
  const [live, setLive] = useState<LiveWeek | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const done = (value: LiveWeek | null) => {
      if (!alive) return;
      setLive(value);
      setLoading(false);
    };

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const athleteId = auth.user?.id;
        if (!athleteId) return done(null);

        const plan = await getActivePlan(supabase, athleteId);
        if (!plan) return done(null);

        const today = todayISO();
        const start = weekStartISO(today);
        const rows = await getWorkoutsInRange(supabase, athleteId, start, addDaysISO(start, 6));
        const sessions = rows.map(fromWorkoutRow).filter((s): s is WeekSession => s !== null);
        if (sessions.length === 0) return done(null);

        const planWeek = (await getPlanWeeks(supabase, plan.id)).find((w) => w.week_start_date === start);
        const phase: PlanPhase = planWeek?.phase ?? 'build';
        const availability = plan.availability_snapshot as { weeklyHoursMax?: number } | null;

        // Today's session is prescribed in the athlete's own zones, so the zone sets come along.
        // Validated rather than cast: these bpm numbers are shown as targets to train at.
        const todayRow = rows.find((w) => w.scheduled_date === today) ?? null;
        let todaySession: PlannedSession | null = null;
        if (todayRow) {
          const zoneRow = (await getCurrentZones(supabase, athleteId)).find((z) => z.sport === todayRow.sport);
          const parsed = zoneRow ? zoneSetSchema.safeParse(zoneRow.zones) : null;
          todaySession = toPlannedSession(todayRow, parsed?.success ? parsed.data : null);
        }

        done({
          todaySession,
          week: {
            phase,
            isRecoveryWeek: planWeek?.is_recovery_week ?? false,
            hoursCeiling: availability?.weeklyHoursMax ?? DEFAULT_HOURS_CEILING,
            sessions,
          },
          strip: toWeekStrip(rows, phase, today),
          comingUp: toComingUp(rows, today),
          athleteId,
          planId: plan.id,
          weekStart: start,
          rows,
        });
      } catch {
        done(null); // a read failure falls back to the sample rather than blanking the screen
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  return { live, loading };
}
