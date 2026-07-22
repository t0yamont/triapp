/**
 * zones/build.ts — 5-zone construction (03-ALGORITHM.md §3.1).
 *
 * Zones are always *displayed* as %HRR (Karvonen) but their *boundaries* are pinned to
 * LT1/LT2 whenever known (Case A, threshold_anchored), falling back to population %HRR
 * bands otherwise (Case B, hrr_fallback). Every boundary is persisted as
 * { bpm, pctHRR, pctHRmax }; a displayed zone is rendered from stored bpm, never
 * recomputed from a percentage (§3.1).
 */

import { sportAnchorConfidence } from '../anchors/reconcile.js';
import { HRR_FALLBACK_BANDS, Z2_WIDTH_BELOW_LT1_HRR } from '../constants.js';
import type { AthleteModel, HrZone, Sport, ZoneBoundary, ZoneId, ZoneSet } from '../types.js';

const ZONE_META: { id: ZoneId; name: string }[] = [
  { id: 'Z1', name: 'Recovery' },
  { id: 'Z2', name: 'Endurance' },
  { id: 'Z3', name: 'Tempo' },
  { id: 'Z4', name: 'Threshold' },
  { id: 'Z5', name: 'VO2max' },
];

/**
 * Build a zone boundary from a raw bpm value. The bpm is rounded for display and the
 * percentages are derived from the *rounded* bpm, so `round(hrRest + pctHRR·HRR)` always
 * reproduces the stored bpm exactly (invariant I3). `render from stored bpm` (§3.1).
 */
function boundary(rawBpm: number, hrRest: number, hrMax: number, hrReserve: number): ZoneBoundary {
  const bpm = Math.round(rawBpm);
  return {
    bpm,
    // hrReserve can be 0 for a degenerate model (hrMax == hrRest); guard the division.
    pctHRR: hrReserve > 0 ? (bpm - hrRest) / hrReserve : 0,
    /* v8 ignore next -- defensive: a real HRmax is always > 0 */
    pctHRmax: hrMax > 0 ? bpm / hrMax : 0,
  };
}

/** Assemble 5 contiguous zones from 6 shared boundary values (b0..b5). */
function assemble(rawBoundaries: number[], hrRest: number, hrMax: number, hrReserve: number): HrZone[] {
  const b = rawBoundaries.map((v) => boundary(v, hrRest, hrMax, hrReserve));
  return ZONE_META.map((meta, i) => ({
    id: meta.id,
    name: meta.name,
    lower: b[i]!,
    upper: b[i + 1]!,
  }));
}

/**
 * Construct the HR zone set for a sport from the athlete model.
 *
 * Uses threshold anchoring when both LT1 and LT2 HR are known for the sport, else the
 * %HRR fallback. In fallback mode the UI must say so and §2.4 confidence rules apply.
 */
export function buildZones(model: AthleteModel, sport: Sport): ZoneSet {
  // HR is an integer measurement and zones are displayed in integer bpm. Build on rounded
  // bounds so the floor never rounds below HRrest (a fractional HRrest from the 5th-
  // percentile estimate would otherwise push Z1's lower boundary just under it, breaking
  // I2 and showing a negative %HRR). Boundaries then stay within [HRrest, HRmax] exactly.
  const hrMax = Math.round(model.hrMax.value);
  const hrRest = Math.round(model.hrRest.value);
  const hrReserve = hrMax - hrRest;
  const anchors = model.sports[sport];
  const lt1 = anchors?.lt1;
  const lt2 = anchors?.lt2;

  if (lt1?.value.hr !== undefined && lt2?.value.hr !== undefined) {
    // Case A — threshold anchored.
    const lt1hr = lt1.value.hr;
    const lt2hr = lt2.value.hr;
    const rawBoundaries = [
      hrRest, // Z1 lower — clamps every boundary into [hrRest, hrMax] (invariant I2)
      lt1hr - Z2_WIDTH_BELOW_LT1_HRR * hrReserve, // Z1 upper / Z2 lower
      lt1hr, // Z2 upper == HR@LT1 (invariant I4)
      lt1hr + 0.5 * (lt2hr - lt1hr), // Z3 upper (midpoint LT1→LT2)
      lt2hr, // Z4 upper == HR@LT2 (invariant I4)
      hrMax, // Z5 upper
    ];
    return {
      mode: 'threshold_anchored',
      hrMax,
      hrRest,
      hrReserve,
      zones: assemble(rawBoundaries, hrRest, hrMax, hrReserve),
      anchorConfidence: sportAnchorConfidence(model, sport),
    };
  }

  // Case B — %HRR fallback. Bands are [0.50, 0.60, 0.70, 0.80, 0.90, 1.00] × HRR + HRrest.
  const rawBoundaries = HRR_FALLBACK_BANDS.map((band) => hrRest + band * hrReserve);
  return {
    mode: 'hrr_fallback',
    hrMax,
    hrRest,
    hrReserve,
    zones: assemble(rawBoundaries, hrRest, hrMax, hrReserve),
    // Fallback relies entirely on HRR, so the anchor confidence is that of HRmax (§2.4).
    anchorConfidence: sportAnchorConfidence(model, sport),
  };
}
