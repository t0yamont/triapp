/**
 * ingest/types.ts — the normalized activity shape every parser produces.
 *
 * This is the "contract that unblocks everything" (08-ROADMAP.md Phase 2): FIT, TCX and GPX
 * all decode into one `ParsedActivity`, which the ingest Edge Function then dedupes and
 * writes to `activities` / `activity_laps` / `activity_streams` (04-DATA-MODEL.sql).
 *
 * Pure data. No I/O, no clock — parsers take bytes/strings and return this.
 */

/** Matches the DB `sport` enum (superset of the physio Sport). */
export type IngestSport = 'run' | 'bike' | 'swim' | 'brick' | 'strength' | 'other';

/** Matches the DB `provider` enum. */
export type IngestProvider =
  | 'garmin'
  | 'strava'
  | 'apple_health'
  | 'wahoo'
  | 'polar'
  | 'suunto'
  | 'manual'
  | 'fit_upload';

export type HrSource = 'chest_strap' | 'optical' | 'none';

export type ActivityFormat = 'fit' | 'tcx' | 'gpx';

/**
 * Per-sample streams. Parallel arrays; `timeS` is seconds from activity start. Streams are
 * large and lazy-loaded — never fetched for a list view (CLAUDE.md §6). `rrIntervalsMs`
 * (beat-to-beat) is what DFA-a1 needs (03-ALGORITHM.md §6.1) and only a chest strap records it.
 */
export interface ParsedStreams {
  timeS?: number[];
  hr?: number[];
  /** RR intervals in milliseconds (not per-`timeS`-sample; a separate beat series). */
  rrIntervalsMs?: number[];
  powerW?: number[];
  speedMps?: number[];
  altitudeM?: number[];
  cadence?: number[];
  latlng?: [number, number][];
  temperatureC?: number[];
  sampleRateHz?: number;
}

export interface ParsedLap {
  lapIndex: number;
  startOffsetS: number;
  durationS: number;
  distanceM?: number;
  avgHr?: number;
  avgPowerW?: number;
  avgSpeedMps?: number;
}

export interface ParsedActivity {
  sport: IngestSport;
  subSport?: string;
  /** ISO-8601 UTC. */
  startTime: string;
  /** Minutes offset of the activity's local zone from UTC, stored per activity (ARCH §4). */
  localTzOffsetMin: number;
  durationS: number;
  movingTimeS?: number;
  distanceM?: number;
  elevationGainM?: number;

  avgHr?: number;
  maxHr?: number;
  avgPowerW?: number;
  normalizedPowerW?: number;
  avgSpeedMps?: number;
  avgCadence?: number;
  temperatureC?: number;

  hrSource?: HrSource;
  hasRrIntervals: boolean;
  hasStreams: boolean;

  provider: IngestProvider;
  /** Provider's stable id for this activity; the idempotency key with `provider`. */
  providerActivityId?: string;

  laps: ParsedLap[];
  streams: ParsedStreams;
}
