/**
 * readiness/history.ts — turn a series of daily wellness observations into the rolling
 * means and baselines `readinessScore` expects (§10.1).
 *
 * This is the piece that makes readiness computable from stored data. §10.1 is emphatic that
 * readiness uses "rolling means against a rolling baseline with an SWC band, **never
 * single-day values**", so a morning check-in on its own can never produce a score — it only
 * becomes one once there is enough history behind it. Everything here is pure and
 * deterministic: same rows in, same inputs out, no clock.
 *
 * A metric with too little history is returned as `undefined` rather than approximated, and
 * `readinessScore` reweights over whatever survives. That is the honest failure mode: a
 * confident-looking score built from two days of data is worse than no score.
 */

import {
  HRV_BASELINE_DAYS,
  HRV_ROLLING_DAYS,
  READINESS_MIN_BASELINE_SAMPLES,
  READINESS_MIN_ROLLING_SAMPLES,
  RHR_BASELINE_DAYS,
  RHR_ROLLING_DAYS,
  SLEEP_BASELINE_DAYS,
  SLEEP_ROLLING_DAYS,
  WELLNESS_BASELINE_DAYS,
  WELLNESS_ROLLING_DAYS,
} from '../constants.js';
import { addDaysISO, daysBetweenISO } from '../plan/generate.js';
import type { DailyReadiness } from './response.js';
import { readinessScore, type MetricInput, type ReadinessInputs } from './score.js';

/**
 * One day's observations. Every field is optional: athletes skip days, and a wearable may
 * supply HRV without the athlete ever filling in a subjective score.
 *
 * The four wellness sub-scores are all **higher-is-better on a 1–5 scale** — 5 means fresh,
 * loose, calm, good mood. §10.1 lists them as "fatigue, soreness, stress, mood" without
 * fixing a direction; a mixed-direction scale would silently invert two of the four inside
 * the mean, so one direction is enforced here and the UI labels must match
 * (`D-WELLNESS-NORM`).
 */
export interface DailyWellness {
  /** ISO calendar date. */
  date: string;
  hrvRmssd?: number;
  restingHr?: number;
  sleepDurationMin?: number;
  wellnessFatigue?: number;
  wellnessSoreness?: number;
  wellnessStress?: number;
  wellnessMood?: number;
}

const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;

/** Sample standard deviation (n−1) — these are samples of an athlete's days, not a population. */
function sampleSd(xs: number[]): number {
  // Defensive: the only caller passes a baseline already checked to hold at least
  // READINESS_MIN_BASELINE_SAMPLES (7) values, so a series this short cannot reach here.
  /* v8 ignore next */
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** The mean of whichever wellness sub-scores were answered; undefined if none were. */
export function wellnessMean(day: DailyWellness): number | undefined {
  const parts = [day.wellnessFatigue, day.wellnessSoreness, day.wellnessStress, day.wellnessMood].filter(
    (v): v is number => v !== undefined,
  );
  return parts.length === 0 ? undefined : mean(parts);
}

/** Values inside a window of `days` ending on `today` (inclusive), newest first. */
function windowValues(
  history: readonly DailyWellness[],
  today: string,
  days: number,
  pick: (d: DailyWellness) => number | undefined,
): number[] {
  const values: number[] = [];
  for (const day of history) {
    const age = daysBetweenISO(day.date, today);
    if (age < 0 || age >= days) continue; // future rows and anything older than the window
    const value = pick(day);
    if (value !== undefined) values.push(value);
  }
  return values;
}

/**
 * Build one metric's `{ rolling, baseline, sd }`, or undefined when either window is too
 * thin to be meaningful. The SD comes from the *baseline* window — it's the spread the SWC
 * band is derived from (SWC = 0.5 × baseline SD).
 */
function buildMetric(
  history: readonly DailyWellness[],
  today: string,
  rollingDays: number,
  baselineDays: number,
  pick: (d: DailyWellness) => number | undefined,
): MetricInput | undefined {
  const rollingValues = windowValues(history, today, rollingDays, pick);
  if (rollingValues.length < READINESS_MIN_ROLLING_SAMPLES) return undefined;

  const baselineValues = windowValues(history, today, baselineDays, pick);
  if (baselineValues.length < READINESS_MIN_BASELINE_SAMPLES) return undefined;

  const sd = sampleSd(baselineValues);
  if (sd <= 0) return undefined; // a flat baseline gives z = 0 for every value — no signal

  return { rolling: mean(rollingValues), baseline: mean(baselineValues), sd };
}

/**
 * Assemble `ReadinessInputs` for `today` from the athlete's stored daily rows.
 *
 * `history` may be in any order and may contain gaps or days after `today` (both ignored).
 * `completionRate` is the share of planned sessions completed over the last 7 days, which
 * is a plan fact rather than a wellness observation, so callers pass it in.
 */
export function buildReadinessInputs(
  history: readonly DailyWellness[],
  today: string,
  completionRate?: number,
): ReadinessInputs {
  const hrv = buildMetric(history, today, HRV_ROLLING_DAYS, HRV_BASELINE_DAYS, (d) => d.hrvRmssd);
  const restingHr = buildMetric(history, today, RHR_ROLLING_DAYS, RHR_BASELINE_DAYS, (d) => d.restingHr);
  const sleep = buildMetric(history, today, SLEEP_ROLLING_DAYS, SLEEP_BASELINE_DAYS, (d) => d.sleepDurationMin);
  const wellness = buildMetric(history, today, WELLNESS_ROLLING_DAYS, WELLNESS_BASELINE_DAYS, wellnessMean);

  return {
    ...(hrv ? { hrv } : {}),
    ...(restingHr ? { restingHr } : {}),
    ...(sleep ? { sleep } : {}),
    ...(wellness ? { wellness } : {}),
    ...(completionRate !== undefined ? { completionRate } : {}),
  };
}

/**
 * Readiness for each of the trailing `days` days, oldest first — the shape `adaptToday`
 * (§10.2) needs, since its rules count *consecutive* below-band days and elevated-RHR days.
 *
 * Each day is scored using only the data available **as of that day**: `buildReadinessInputs`
 * ignores rows dated after the day it is asked about, so a later check-in can never
 * retroactively change what yesterday's readiness was. Without that, a rule like "below band
 * for 2 consecutive days" would silently mean something different every time it ran.
 */
export function buildReadinessSeries(
  history: readonly DailyWellness[],
  today: string,
  days: number,
): DailyReadiness[] {
  const series: DailyReadiness[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = addDaysISO(today, -offset);
    const inputs = buildReadinessInputs(history, date);
    const { band, components } = readinessScore(inputs);
    const hrvZ = components.find((c) => c.key === 'hrv')?.z;
    // Positive = above baseline, which for resting HR is the bad direction (§10.2's >7 bpm rule).
    const restingHrDeltaBpm = inputs.restingHr ? inputs.restingHr.rolling - inputs.restingHr.baseline : undefined;
    series.push({
      band,
      ...(hrvZ !== undefined ? { hrvZ } : {}),
      ...(restingHrDeltaBpm !== undefined ? { restingHrDeltaBpm } : {}),
    });
  }
  return series;
}

/**
 * How much of the readiness picture the stored history can actually support — so the UI can
 * say "3 more days of check-ins" instead of showing a score built on nothing (§2.4, P2).
 */
export interface ReadinessCoverage {
  /** Metrics that cleared both windows. */
  available: ('hrv' | 'restingHr' | 'sleep' | 'wellness')[];
  /** Distinct days with at least one observation, inside the longest baseline window. */
  daysLogged: number;
  /** Days still needed before any metric can produce a baseline. */
  daysUntilFirstScore: number;
}

export function readinessCoverage(history: readonly DailyWellness[], today: string): ReadinessCoverage {
  const inputs = buildReadinessInputs(history, today);
  const available = (['hrv', 'restingHr', 'sleep', 'wellness'] as const).filter((k) => inputs[k] !== undefined);

  const longestBaseline = Math.max(HRV_BASELINE_DAYS, RHR_BASELINE_DAYS, SLEEP_BASELINE_DAYS, WELLNESS_BASELINE_DAYS);
  const daysLogged = new Set(
    history
      .filter((d) => {
        const age = daysBetweenISO(d.date, today);
        return age >= 0 && age < longestBaseline;
      })
      .map((d) => d.date),
  ).size;

  return {
    available,
    daysLogged,
    daysUntilFirstScore: Math.max(0, READINESS_MIN_BASELINE_SAMPLES - daysLogged),
  };
}
