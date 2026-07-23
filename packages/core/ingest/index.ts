/**
 * @ironflow/core/ingest — activity ingest: parse FIT/TCX/GPX into a normalised activity,
 * then dedupe and finalise. Pure (no I/O, no clock); the Edge Function composes it with the
 * database. See 05-INTEGRATIONS.md and 02-ARCHITECTURE.md §3.
 */

export * from './types.js';
export * from './normalize.js';
export * from './dedupe.js';
export * from './parse/index.js';
export { parseFit } from './parse/fit.js';
export { parseGpx } from './parse/gpx.js';
export { parseTcx } from './parse/tcx.js';
export { fitCrc } from './parse/fit-crc.js';
