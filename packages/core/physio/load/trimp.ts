/**
 * load/trimp.ts — internal load, zone-weighted TRIMP (03-ALGORITHM.md §5.1).
 *
 * Lucia-style weights applied to the 3-zone roll-up: S1 = 1, S2 = 2, S3 = 3. Deliberately
 * simple; more robust across athletes than exponential Banister TRIMP, which needs a
 * sex-specific constant and is sensitive to HRmax error.
 */

import { TRIMP_ZONE_WEIGHTS } from '../constants.js';
import type { SZone } from '../types.js';

/** Minutes spent in each 3-zone band. */
export type MinutesInSZone = Record<SZone, number>;

export function trimp(minutes: MinutesInSZone): number {
  return (
    minutes.S1 * TRIMP_ZONE_WEIGHTS.S1 +
    minutes.S2 * TRIMP_ZONE_WEIGHTS.S2 +
    minutes.S3 * TRIMP_ZONE_WEIGHTS.S3
  );
}
