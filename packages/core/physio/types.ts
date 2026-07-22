/**
 * physio/types.ts — the type vocabulary of the engine.
 *
 * Every physiological estimate is `{ value, confidence, provenance, measuredAt }`
 * (03-ALGORITHM.md §0.3, §2.1). Confidence propagates through every calculation and
 * changes plan behaviour (§2.4). Downstream code must never strip it (CLAUDE.md §3).
 */

import type { PROVENANCE_CONFIDENCE } from './constants.js';

/** ISO-8601 date-time string. The engine never reads the clock; time is always passed in. */
export type ISODateTime = string;

export type Sport = 'run' | 'bike' | 'swim';

/**
 * Provenance of an estimate, ordered by trust. The base confidence for each is fixed in
 * constants.PROVENANCE_CONFIDENCE; an estimate may only gain confidence by moving to a
 * higher-priority provenance (invariant I14).
 */
export type Provenance = keyof typeof PROVENANCE_CONFIDENCE;

export interface Estimate<T> {
  value: T;
  /** 0..1. Never claim more confidence than the evidence supports (invariant P2). */
  confidence: number;
  provenance: Provenance;
  measuredAt: ISODateTime;
  sampleSize?: number;
}

/** Aerobic (LT1) / anaerobic (LT2) threshold expressed across whatever modalities exist. */
export interface ThresholdPoint {
  hr: number;
  /** metres per second. Store speed internally; convert to pace for display only (§3.2). */
  pace?: number;
  /** watts (bike/run power). */
  power?: number;
}

export interface SportAnchors {
  lt1?: Estimate<ThresholdPoint>; // aerobic threshold
  lt2?: Estimate<ThresholdPoint>; // anaerobic threshold
  /** CP (W) or CS (m/s) or CSS (m/s). Distinct from a measured lt2 (§6.3). */
  criticalIntensity?: Estimate<number>;
  wPrime?: Estimate<number>; // J, bike/run only
  economy?: Estimate<number>;
  durabilityIndex?: Estimate<number>; // §11
}

export interface AthleteModel {
  hrMax: Estimate<number>;
  hrRest: Estimate<number>;
  /** hrMax − hrRest, derived. Recomputed whenever either component updates (§2.3). */
  hrReserve: number;
  sports: Partial<Record<Sport, SportAnchors>>;
  bodyMass?: Estimate<number>;
  updatedAt: ISODateTime;
}

// ── Zones (§3) ───────────────────────────────────────────────────────────────

export type ZoneId = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
/** 3-zone roll-up used ONLY for distribution accounting, never as a prescription (§3.3). */
export type SZone = 'S1' | 'S2' | 'S3';
export type AnchorMode = 'threshold_anchored' | 'hrr_fallback';

/**
 * One zone boundary persisted in all three representations so a displayed zone is never
 * recomputed from a percentage at render time — render from stored bpm (§3.1).
 */
export interface ZoneBoundary {
  bpm: number;
  pctHRR: number;
  pctHRmax: number;
}

export interface HrZone {
  id: ZoneId;
  name: string;
  lower: ZoneBoundary;
  upper: ZoneBoundary;
}

export interface ZoneSet {
  mode: AnchorMode;
  hrMax: number;
  hrRest: number;
  hrReserve: number;
  zones: HrZone[];
  /**
   * The confidence of the anchors this zone set was built from. Drives §2.4 behaviour.
   * Present so the UI can honestly mark an estimated-HRmax zone system as an estimate (P2).
   */
  anchorConfidence: number;
}

// ── Confidence → behaviour (§2.4) ────────────────────────────────────────────

/**
 * The §2.4 tier that combined anchor confidence lands in. This is the mechanism that
 * makes an under-informed plan *safe* rather than merely uncertain — low confidence means
 * slower progression, more conservative intensity, and earlier scheduled testing.
 */
export interface ConfidenceBehaviour {
  tier: 'high' | 'moderate' | 'low' | 'critical';
  /** Multiplier applied to the G1 ramp cap. */
  rampCapMultiplier: number;
  /** Percentage-point conservative shift applied to intensity targets (0 = none). */
  intensityShiftPct: number;
  /** Fraction of nominal Z5 volume permitted (1 = full). */
  z5VolumeFraction: number;
  /** Highest S-zone the engine may prescribe. Below 0.30 confidence, no S3 at all (I15). */
  maxSZone: SZone;
  /** Days within which a field test must be scheduled. */
  testWithinDays: number;
  /** Nominal test cadence in weeks when no other trigger fires. */
  testCadenceWeeks: number;
  /** Whether the low-confidence state blocks the UI (critical tier). */
  blocking: boolean;
}
