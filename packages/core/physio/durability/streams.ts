/**
 * durability/streams.ts — derive a §11 decoupling reading from an activity's raw streams.
 *
 * `computeDecoupling` takes two already-summarised halves; this is what turns per-sample
 * HR and intensity into those halves. Kept separate and pure so the split rules (which
 * samples count, where the halves divide, what counts as a stop) are testable on their own.
 *
 * Notably this needs **no athlete model**: decoupling is a within-session comparison of
 * HR-to-intensity ratio, first half against second, so it is computable at ingest before any
 * threshold is known. That is why it is the one load-adjacent column filled at ingest today.
 */

import { DECOUPLING_LONG_STOP_S } from '../constants.js';
import type { IngestSportLike } from './decoupling.js';
import { computeDecoupling, type DecouplingResult, type HalfStats } from './decoupling.js';

export interface DecouplingStreams {
  /** Seconds from activity start, one per sample. */
  timeS?: number[];
  hr?: number[];
  powerW?: number[];
  speedMps?: number[];
}

export interface DecouplingFromStreamsOptions {
  sport: IngestSportLike;
  /** Ambient conditions were recorded — §11.1 requires it for the reading to be comparable. */
  ambientRecorded: boolean;
  /** Gap counted as a long stop. Defaults to the flagged convention, overridable. */
  longStopS?: number;
}

const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;

/** Coefficient of variation (SD ÷ mean) — the §11.1 steadiness gate. */
function cv(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  if (m === 0) return 0;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  return sd / m;
}

const summarise = (hr: number[], intensity: number[]): HalfStats => ({
  meanHr: mean(hr),
  meanIntensity: mean(intensity),
  intensityCv: cv(intensity),
});

/**
 * The external-intensity series decoupling compares HR against: power on the bike,
 * speed on foot. Swimming has no comparable continuous intensity stream here, and strength
 * is not an aerobic steady effort at all — both return null rather than a meaningless ratio.
 */
function intensitySeries(streams: DecouplingStreams, sport: IngestSportLike): number[] | undefined {
  if (sport === 'bike') return streams.powerW;
  if (sport === 'run' || sport === 'brick') return streams.speedMps;
  return undefined;
}

/**
 * A decoupling reading for one session, or null when the streams can't support one at all
 * (no HR, no usable intensity series, or too few moving samples).
 *
 * Null means "not computable"; a returned result with `valid: false` means "computed, but
 * §11.1 says don't trust it" and carries the reasons. Those are different, and the caller
 * stores both the percentage and the validity flag rather than discarding invalid readings —
 * an invalid reading is still evidence about the session.
 */
export function decouplingFromStreams(
  streams: DecouplingStreams,
  opts: DecouplingFromStreamsOptions,
): DecouplingResult | null {
  const intensity = intensitySeries(streams, opts.sport);
  const hr = streams.hr;
  if (!hr || !intensity) return null;

  const n = Math.min(hr.length, intensity.length);
  if (n < 4) return null; // two samples per half is the floor for any spread at all

  // Samples where the athlete was actually working. A stopped sample has intensity 0, which
  // would drag the mean down and inflate the HR:intensity ratio — the very thing being measured.
  const moving: { t: number; hr: number; intensity: number }[] = [];
  for (let i = 0; i < n; i++) {
    const h = hr[i]!;
    const x = intensity[i]!;
    if (h > 0 && x > 0) moving.push({ t: streams.timeS?.[i] ?? i, hr: h, intensity: x });
  }
  if (moving.length < 4) return null;

  // Split by elapsed time, not sample count, so irregular sampling doesn't skew the halves.
  const start = moving[0]!.t;
  const end = moving[moving.length - 1]!.t;
  const mid = start + (end - start) / 2;
  const first = moving.filter((s) => s.t <= mid);
  const second = moving.filter((s) => s.t > mid);
  if (first.length < 2 || second.length < 2) return null;

  // A gap in the *recorded* time series is a stop, whether or not the device paused.
  const longStopS = opts.longStopS ?? DECOUPLING_LONG_STOP_S;
  let hadLongStop = false;
  for (let i = 1; i < moving.length; i++) {
    if (moving[i]!.t - moving[i - 1]!.t > longStopS) {
      hadLongStop = true;
      break;
    }
  }

  return computeDecoupling({
    first: summarise(first.map((s) => s.hr), first.map((s) => s.intensity)),
    second: summarise(second.map((s) => s.hr), second.map((s) => s.intensity)),
    durationMin: (end - start) / 60,
    hadLongStop,
    ambientRecorded: opts.ambientRecorded,
  });
}
