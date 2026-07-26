/**
 * schemas.ts — Zod schemas for data crossing a network boundary (CLAUDE.md §5). The ingest
 * Edge Function validates its request against these before doing any work.
 */

import { z } from 'zod';

export const providerSchema = z.enum([
  'garmin',
  'strava',
  'apple_health',
  'wahoo',
  'polar',
  'suunto',
  'manual',
  'fit_upload',
]);

export const activityFormatSchema = z.enum(['fit', 'tcx', 'gpx']);

export const ingestRequestSchema = z.object({
  athleteId: z.string().uuid(),
  provider: providerSchema.default('fit_upload'),
  /** Optional; the parser sniffs the format from the file when omitted. */
  format: activityFormatSchema.optional(),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

const zoneBoundarySchema = z.object({
  bpm: z.number().finite(),
  pctHRR: z.number().finite(),
  pctHRmax: z.number().finite(),
});

/**
 * A stored `athlete_zones.zones` payload (a `ZoneSet`).
 *
 * Written as jsonb, so it comes back untyped — and ingest turns these boundaries into
 * `internal_load`/time-in-zone numbers that are then stored permanently. A bad boundary would
 * silently mis-bin a whole session's HR, so it is validated rather than cast.
 */
export const zoneSetSchema = z.object({
  mode: z.enum(['threshold_anchored', 'hrr_fallback']),
  hrMax: z.number().finite().positive(),
  hrRest: z.number().finite().positive(),
  hrReserve: z.number().finite(),
  zones: z
    .array(
      z.object({
        id: z.enum(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']),
        name: z.string(),
        lower: zoneBoundarySchema,
        upper: zoneBoundarySchema,
      }),
    )
    .nonempty(),
  anchorConfidence: z.number().finite(),
});
