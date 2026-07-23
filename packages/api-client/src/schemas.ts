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
