/**
 * ingest/dedupe.ts — idempotency and cross-provider deduplication (02-ARCHITECTURE.md §3,
 * 05-INTEGRATIONS.md §7).
 *
 * Idempotency: every ingest is keyed on (provider, provider_activity_id) — replaying a
 * webhook must be a no-op.
 *
 * Deduplication: the same ride can arrive from Garmin AND Strava. Match on same athlete
 * (scoped by the caller's query) AND same sport AND start within ±120 s AND duration within
 * ±3%. Keep the richest source (most streams, highest sample rate, RR present wins), record
 * every source, set is_duplicate_of on the losers, never hard-delete.
 */

import type { ParsedActivity } from './types.js';

/** Stable key for idempotent upserts; undefined when the provider gave no activity id. */
export function idempotencyKey(
  provider: string,
  providerActivityId: string | undefined,
): string | undefined {
  return providerActivityId ? `${provider}:${providerActivityId}` : undefined;
}

export const DEDUPE_START_TOLERANCE_S = 120;
export const DEDUPE_DURATION_TOLERANCE = 0.03;

type DedupeCandidate = Pick<ParsedActivity, 'sport' | 'startTime' | 'durationS'>;

/** True if two activities are the same session from different sources (per-athlete). */
export function isDuplicate(a: DedupeCandidate, b: DedupeCandidate): boolean {
  if (a.sport !== b.sport) return false;
  const startDiffS = Math.abs(new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) / 1000;
  if (startDiffS > DEDUPE_START_TOLERANCE_S) return false;
  const longer = Math.max(a.durationS, b.durationS);
  if (longer === 0) return true;
  const durationDiff = Math.abs(a.durationS - b.durationS) / longer;
  return durationDiff <= DEDUPE_DURATION_TOLERANCE;
}

/**
 * Richness score: RR intervals dominate (they unlock DFA-a1), then stream count, then
 * sample rate. Used to pick which of two duplicates to keep as primary.
 */
export function richnessScore(a: ParsedActivity): number {
  const s = a.streams;
  const streamCount = [s.hr, s.powerW, s.speedMps, s.altitudeM, s.cadence, s.latlng, s.temperatureC].filter(
    (arr) => arr !== undefined && arr.length > 0,
  ).length;
  return (a.hasRrIntervals ? 1000 : 0) + streamCount * 10 + (s.sampleRateHz ?? 1);
}

/** The richer of two duplicate activities; ties keep the first (existing) record. */
export function chooseRicher(a: ParsedActivity, b: ParsedActivity): ParsedActivity {
  return richnessScore(b) > richnessScore(a) ? b : a;
}
