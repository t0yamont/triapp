'use client';

/**
 * lib/session-file.ts — download today's session as a `.FIT` workout for a watch.
 *
 * `encodeFitWorkout` has existed since Phase 7, is tested against an independent reader, and had
 * no caller anywhere in the app — the roadmap calls it the fallback that has to exist "regardless"
 * of whether the Garmin Training API grant ever arrives. This is the button that reaches it.
 *
 * HR targets come from the athlete's own stored zones. With no zones yet the steps are written
 * **open** rather than given an invented range, which is what the encoder already does for a step
 * with no target: a watch beeping at a made-up heart rate is worse than one that just counts down.
 */

import { encodeFitWorkout, type FitSport, type FitWorkoutStep } from '@ironflow/core/ingest';
import { zoneToSZone, type SZone, type ZoneSet } from '@ironflow/core/physio';
import type { SessionInterval } from './today-demo';

const FIT_SPORT: Record<string, FitSport> = { run: 'run', bike: 'bike', swim: 'swim' };

/**
 * The bpm range for an S-zone, spanning every HR zone that rolls up into it.
 *
 * S1 covers Z1–Z2, S2 is Z3, S3 covers Z4–Z5 (§3.3), so the target is the bottom of the lowest
 * and the top of the highest — a single Z-zone range would prescribe a narrower band than the
 * session actually asks for.
 */
export function hrRangeFor(zones: ZoneSet | null, zone: SZone): { low: number; high: number } | undefined {
  const bands = zones?.zones.filter((z) => zoneToSZone(z.id) === zone) ?? [];
  if (bands.length === 0) return undefined;
  return {
    low: Math.round(Math.min(...bands.map((b) => b.lower.bpm))),
    high: Math.round(Math.max(...bands.map((b) => b.upper.bpm))),
  };
}

export function toFitWorkout(
  session: { name: string; sport: string; intervals: SessionInterval[] },
  zones: ZoneSet | null,
): Parameters<typeof encodeFitWorkout>[0] {
  const steps: FitWorkoutStep[] = session.intervals.map((interval, i) => {
    const hr = hrRangeFor(zones, interval.zone);
    return {
      name: `${interval.zone} ${i + 1}`,
      durationSec: Math.round(interval.minutes * 60),
      // The watch shows warmup/cooldown differently, and the first and last blocks of a rendered
      // session are exactly that (§7.2).
      intensity: i === 0 ? 'warmup' : i === session.intervals.length - 1 ? 'cooldown' : interval.zone === 'S1' ? 'rest' : 'active',
      ...(hr ? { hrLowBpm: hr.low, hrHighBpm: hr.high } : {}),
    };
  });

  return { name: session.name, sport: FIT_SPORT[session.sport] ?? 'other', steps };
}

/** Encode and hand it to the browser. Returns false when there is nothing to write. */
export function downloadSessionFit(
  session: { name: string; sport: string; intervals: SessionInterval[] },
  zones: ZoneSet | null,
  dateLabel: string,
): boolean {
  if (session.intervals.length === 0) return false;
  const bytes = encodeFitWorkout(toFitWorkout(session, zones));
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `triflow-${dateLabel}-${session.sport}.fit`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
