/**
 * anchors/dfaAlpha1.ts — LT1/LT2 detection from RR intervals (03-ALGORITHM.md §6.1).
 *
 * The short-term scaling exponent α1 of detrended fluctuation analysis of RR intervals
 * declines monotonically with exercise intensity, crossing 0.75 at LT1/VT1 and 0.50 at
 * LT2/VT2 (Rogers et al. 2021a/b). This is TriFlow's differentiating capability: real
 * thresholds without a lab — and an honest confidence attached.
 *
 * HONESTY REQUIREMENT (§6.1): a single-session DFA-a1 threshold has individual limits of
 * agreement of roughly ±11–13 bpm — a whole zone. Never present one as definitive:
 * `dfa_a1_single` carries confidence 0.50 and must aggregate (≥3 sessions) before it is
 * trusted (`dfa_a1_multi`, 0.75, a ceiling that must never be raised).
 *
 * **r2 (§6.1): the canonical value is power/pace, not HR.** Test–retest reliability is
 * materially better expressed as power (ICC 0.87/0.97) than as heart rate (typical error
 * 8.8/4.1 bpm) — Sempere-Ruiz et al. 2024. The HR value is derived for display, aggregation
 * agreement is judged on power/pace, and the method is presented as a passive prior that
 * *schedules a test*, never as a settled measurement: it is actively disputed in the
 * literature (Cassirame et al. 2025 vs the Gronwald rebuttal).
 *
 * Pure: no clock, no I/O. Time and RR streams are arguments.
 */

import {
  DFA_A1_BOX_MAX,
  DFA_A1_BOX_MIN,
  DFA_A1_LT1,
  DFA_A1_LT2,
  DFA_A1_MAX_ARTEFACT_PCT,
  DFA_A1_MIN_SESSIONS_FOR_MULTI,
  DFA_A1_MULTI_AGREEMENT_FRACTION,
  DFA_A1_MULTI_WINDOW_DAYS,
  DFA_A1_STEP_SECONDS,
  DFA_A1_TYPICAL_ERROR_BPM,
  PROVENANCE_CONFIDENCE,
} from '../constants.js';
import { median } from './hrRest.js';
import type { Estimate, ISODateTime, ThresholdPoint } from '../types.js';

// ── DFA-a1 primitive ─────────────────────────────────────────────────────────

/** Least-squares detrended fluctuation F(n) for one box size over the integrated profile. */
function fluctuation(profile: number[], n: number): number {
  const numBoxes = Math.floor(profile.length / n);
  /* v8 ignore next -- defensive: dfaAlpha1 guarantees n ≤ N/2, so numBoxes ≥ 2 */
  if (numBoxes < 1) return NaN;
  let sumSq = 0;
  for (let b = 0; b < numBoxes; b++) {
    const start = b * n;
    // Least-squares line over t = 0..n-1 within the box.
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let t = 0; t < n; t++) {
      const v = profile[start + t]!;
      sx += t;
      sy += v;
      sxx += t * t;
      sxy += t * v;
    }
    const denom = n * sxx - sx * sx;
    /* v8 ignore next -- defensive: for box size n ≥ 2, n·Σt² − (Σt)² is always > 0 */
    const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    for (let t = 0; t < n; t++) {
      const resid = profile[start + t]! - (intercept + slope * t);
      sumSq += resid * resid;
    }
  }
  return Math.sqrt(sumSq / (numBoxes * n));
}

/**
 * Compute the DFA short-term scaling exponent α1 of an RR-interval series.
 * Box sizes span [boxMin, boxMax] (default 4–16 beats, the standard α1 range).
 */
export function dfaAlpha1(rr: number[], boxMin = DFA_A1_BOX_MIN, boxMax = DFA_A1_BOX_MAX): number {
  const n = rr.length;
  if (n < boxMax * 2) {
    throw new Error(`dfaAlpha1 needs ≥ ${boxMax * 2} beats for boxMax ${boxMax}; got ${n}`);
  }
  const mean = rr.reduce((a, b) => a + b, 0) / n;
  // Integrated profile.
  const profile: number[] = new Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += rr[i]! - mean;
    profile[i] = acc;
  }
  // log10 F(n) vs log10 n across box sizes.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let box = boxMin; box <= boxMax; box++) {
    const f = fluctuation(profile, box);
    if (f > 0 && Number.isFinite(f)) {
      xs.push(Math.log10(box));
      ys.push(Math.log10(f));
    }
  }
  if (xs.length < 2) return NaN;
  // Slope of the log-log fit = α1.
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  /* v8 ignore next -- defensive: xs are distinct log10(box) values, so sxx > 0 here */
  return sxx === 0 ? NaN : sxy / sxx;
}

// ── Artefact correction ──────────────────────────────────────────────────────

/**
 * Signal-processing parameter (NOT a physiological constant): a beat is flagged as an
 * artefact when it deviates from the local median by more than this fraction. 0.20 is a
 * common ectopic-beat criterion. Lives with the algorithm, not in constants.ts.
 */
const ARTEFACT_DEVIATION_FRACTION = 0.2;
const ARTEFACT_MEDIAN_HALFWINDOW = 2;

export interface ArtefactResult {
  corrected: number[];
  /** Fraction of beats corrected, 0..1. Reject the window if this exceeds 5% (§6.1). */
  correctedFraction: number;
}

/** Detect and interpolate artefact beats; report the corrected fraction. */
export function correctArtefacts(rr: number[]): ArtefactResult {
  const corrected = [...rr];
  let count = 0;
  for (let i = 0; i < rr.length; i++) {
    const lo = Math.max(0, i - ARTEFACT_MEDIAN_HALFWINDOW);
    const hi = Math.min(rr.length - 1, i + ARTEFACT_MEDIAN_HALFWINDOW);
    const neighbours = [];
    for (let j = lo; j <= hi; j++) if (j !== i) neighbours.push(rr[j]!);
    const localMedian = median(neighbours);
    if (localMedian > 0 && Math.abs(rr[i]! - localMedian) / localMedian > ARTEFACT_DEVIATION_FRACTION) {
      corrected[i] = localMedian;
      count++;
    }
  }
  return { corrected, correctedFraction: rr.length === 0 ? 0 : count / rr.length };
}

/** Compute α1 for one window, correcting artefacts first and rejecting noisy windows. */
export function computeWindowAlpha(rr: number[]): { alpha1: number; correctedFraction: number; rejected: boolean } {
  const { corrected, correctedFraction } = correctArtefacts(rr);
  const rejected = correctedFraction * 100 > DFA_A1_MAX_ARTEFACT_PCT;
  return {
    alpha1: rejected ? NaN : dfaAlpha1(corrected),
    correctedFraction,
    rejected,
  };
}

// ── Threshold detection from a session's windows ─────────────────────────────

export interface DfaWindow {
  /** Window time (s from session start) — used to check the ≥4-min decline requirement. */
  timeS: number;
  alpha1: number;
  /** Mean HR in the window. */
  hr: number;
  /** Mean external intensity: power (W) for bike, GAP speed (m/s) for run. */
  intensity: number;
  /** True when external-intensity SD < 5% of the window mean (§6.1 step 1). */
  intensitySteady: boolean;
}

const MIN_DECLINE_SECONDS = 240; // ≥4 minutes of continuously declining α1 (§6.1 step 4)

/**
 * Interpolate the HR and external intensity at which α1 crosses `target`, if the crossing
 * is spanned by a declining run of ≥4 minutes. Points must be sorted by intensity ascending.
 */
function crossing(
  points: DfaWindow[],
  target: number,
): { hr: number; intensity: number } | undefined {
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]!;
    const b = points[k + 1]!;
    if (a.alpha1 >= target && b.alpha1 < target) {
      // Extend the declining run through the bracket and measure its time span.
      let lo = k;
      while (lo > 0 && points[lo - 1]!.alpha1 >= points[lo]!.alpha1) lo--;
      let hi = k + 1;
      while (hi < points.length - 1 && points[hi + 1]!.alpha1 <= points[hi]!.alpha1) hi++;
      const times = points.slice(lo, hi + 1).map((p) => p.timeS);
      const span = Math.max(...times) - Math.min(...times);
      if (span < MIN_DECLINE_SECONDS) return undefined;

      const frac = (a.alpha1 - target) / (a.alpha1 - b.alpha1);
      return {
        hr: a.hr + frac * (b.hr - a.hr),
        intensity: a.intensity + frac * (b.intensity - a.intensity),
      };
    }
  }
  return undefined;
}

/**
 * Detect LT1 (α1 = 0.75) and LT2 (α1 = 0.50) from a single session's windows, emitting
 * `dfa_a1_single` estimates (confidence 0.50). `modality` decides whether the external
 * intensity is stored as pace (m/s) or power (W).
 */
export function detectThresholdsFromWindows(
  windows: DfaWindow[],
  modality: 'speed' | 'power',
  measuredAt: ISODateTime,
): { lt1?: Estimate<ThresholdPoint>; lt2?: Estimate<ThresholdPoint> } {
  const steady = windows
    .filter((w) => w.intensitySteady && Number.isFinite(w.alpha1))
    .sort((x, y) => x.intensity - y.intensity);

  const toEstimate = (c: { hr: number; intensity: number }): Estimate<ThresholdPoint> => ({
    value: {
      hr: c.hr,
      ...(modality === 'speed' ? { pace: c.intensity } : { power: c.intensity }),
    },
    confidence: PROVENANCE_CONFIDENCE.dfa_a1_single,
    provenance: 'dfa_a1_single',
    measuredAt,
    sampleSize: steady.length,
  });

  const out: { lt1?: Estimate<ThresholdPoint>; lt2?: Estimate<ThresholdPoint> } = {};
  const lt1 = crossing(steady, DFA_A1_LT1);
  if (lt1) out.lt1 = toEstimate(lt1);
  const lt2 = crossing(steady, DFA_A1_LT2);
  if (lt2) out.lt2 = toEstimate(lt2);
  return out;
}

// ── Aggregation single → multi ───────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The canonical value of a DFA-a1 estimate: power (bike) or grade-adjusted speed (run).
 * Undefined for an HR-only estimate, which cannot be aggregated under the r2 rule.
 */
export function canonicalIntensity(estimate: Estimate<ThresholdPoint>): number | undefined {
  return estimate.value.power ?? estimate.value.pace;
}

/**
 * Aggregate ≥3 accepted single-session estimates within a 21-day window into a `dfa_a1_multi`
 * estimate (confidence 0.75, value = median). Returns undefined when the requirements are not
 * met — a single noisy session is never trusted.
 *
 * **Agreement is checked on power/pace, not on heart rate (r2, §6.1).** Reliability is
 * materially better in power (ICC 0.87/0.97) than in HR (typical error 8.8/4.1 bpm), and r1's
 * ±6 bpm HR window was roughly *one typical error wide* — it would have rejected valid
 * agreement about as often as it caught noise. The window is now ±4% of the median
 * power/pace value.
 *
 * An estimate carrying no power or pace at all cannot be aggregated: there is nothing reliable
 * to agree on, and falling back to the HR window would reinstate the rule r2 removed.
 */
export function aggregateDfaSingles(
  singles: Estimate<ThresholdPoint>[],
  now: ISODateTime,
): Estimate<ThresholdPoint> | undefined {
  const nowMs = new Date(now).getTime();
  const recent = singles.filter(
    (s) => nowMs - new Date(s.measuredAt).getTime() <= DFA_A1_MULTI_WINDOW_DAYS * DAY_MS,
  );
  if (recent.length < DFA_A1_MIN_SESSIONS_FOR_MULTI) return undefined;

  const canonical = recent.map(canonicalIntensity);
  if (canonical.some((v) => v === undefined)) return undefined;
  const values = canonical as number[];

  const centre = median(values);
  const tolerance = centre * DFA_A1_MULTI_AGREEMENT_FRACTION;
  if (values.some((v) => Math.abs(v - centre) > tolerance)) return undefined;

  const paces = recent.map((s) => s.value.pace).filter((p): p is number => p !== undefined);
  const powers = recent.map((s) => s.value.power).filter((p): p is number => p !== undefined);

  return {
    value: {
      // HR is derived for display and is deliberately *not* what agreement was judged on.
      hr: median(recent.map((s) => s.value.hr)),
      ...(paces.length > 0 ? { pace: median(paces) } : {}),
      ...(powers.length > 0 ? { power: median(powers) } : {}),
    },
    confidence: PROVENANCE_CONFIDENCE.dfa_a1_multi,
    provenance: 'dfa_a1_multi',
    measuredAt: now,
    sampleSize: recent.length,
  };
}

/**
 * The honest spread to show beside a DFA-a1 heart rate (§6.1). Individual limits of agreement
 * for a single session span roughly ±11–13 bpm, and typical error at threshold is 6 bpm (LT1)
 * / 8 bpm (LT2) — a whole zone either way.
 *
 * Returned so the UI can render "±6 bpm" rather than a bare number. Aggregation narrows the
 * *confidence*, not the underlying measurement error, so the spread is reported regardless.
 */
export function dfaHrSpreadBpm(threshold: 'lt1' | 'lt2'): number {
  return threshold === 'lt1' ? DFA_A1_TYPICAL_ERROR_BPM.t1 : DFA_A1_TYPICAL_ERROR_BPM.t2;
}
