/**
 * zones/seiler.ts — the 3-zone roll-up, for distribution accounting ONLY (§3.3).
 *
 * Intensity distribution is a three-zone concept (below LT1 / between LT1 and LT2 /
 * above LT2). It cannot be expressed meaningfully in five zones, so the engine maintains
 * this roll-up used *only* for distribution accounting and never shown as a prescription
 * target.
 *
 *   S1 (low)      = Z1 + Z2      // below LT1
 *   S2 (moderate) = Z3 + Z4      // between LT1 and LT2
 *   S3 (high)     = Z5           // above LT2
 */

import type { SZone, ZoneId } from '../types.js';

const ZONE_TO_SZONE: Record<ZoneId, SZone> = {
  Z1: 'S1',
  Z2: 'S1',
  Z3: 'S2',
  Z4: 'S2',
  Z5: 'S3',
};

export function zoneToSZone(zone: ZoneId): SZone {
  return ZONE_TO_SZONE[zone];
}

/** Roll seconds-in-each-5-zone up to the 3-zone accounting frame. */
export function rollupToSZones(secondsPerZone: Partial<Record<ZoneId, number>>): Record<SZone, number> {
  const out: Record<SZone, number> = { S1: 0, S2: 0, S3: 0 };
  for (const [zone, seconds] of Object.entries(secondsPerZone) as [ZoneId, number][]) {
    out[ZONE_TO_SZONE[zone]] += seconds ?? 0;
  }
  return out;
}
