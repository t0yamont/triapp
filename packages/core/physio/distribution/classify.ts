/**
 * distribution/classify.ts — session classification, both methods, always (§3.4).
 *
 * Distribution numbers are extremely sensitive to how a session is classified: the same week
 * looks polarised under session-goal classification and pyramidal under time-in-zone. So the
 * engine computes BOTH and shows both, and uses the divergence as a drift check — S2
 * time-in-zone creeping past 25% while the goal view says "polarised" is the most common
 * self-coached failure mode (§3.4, F11).
 */

import { MODERATE_DRIFT_REASON } from '../constants.js';
import type { SZone } from '../types.js';
import type { Distribution } from '../plan/types.js';
import { isModerateDrift } from './policy.js';

const ZONES: readonly SZone[] = ['S1', 'S2', 'S3'];

export interface ClassifiedSession {
  durationMin: number;
  /** The S-zone of the session's highest-intensity *purposeful* block (§3.4 primary). */
  goalZone: SZone;
  /** Seconds in each S-zone from the activity stream. Absent when the session has no stream. */
  timeInZoneS?: Record<SZone, number>;
}

/**
 * Whole-number percentages that always sum to 100 (largest-remainder). Naive per-zone rounding
 * gives 99 or 101, which reads as a bug wherever a distribution is displayed.
 */
function toPercent(parts: Record<SZone, number>): Distribution {
  const total = ZONES.reduce((a, z) => a + parts[z], 0);
  if (total <= 0) return { S1: 0, S2: 0, S3: 0 };

  const exact = { S1: (parts.S1 / total) * 100, S2: (parts.S2 / total) * 100, S3: (parts.S3 / total) * 100 };
  const out: Distribution = { S1: Math.floor(exact.S1), S2: Math.floor(exact.S2), S3: Math.floor(exact.S3) };

  let remainder = 100 - (out.S1 + out.S2 + out.S3);
  const byFraction = [...ZONES].sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])));
  for (const z of byFraction) {
    if (remainder <= 0) break;
    out[z] += 1;
    remainder -= 1;
  }
  return out;
}

/** Session-goal classification (primary): the whole session counts toward its goal zone. */
export function sessionGoalDistribution(sessions: ClassifiedSession[]): Distribution {
  const parts: Record<SZone, number> = { S1: 0, S2: 0, S3: 0 };
  for (const s of sessions) parts[s.goalZone] += s.durationMin;
  return toPercent(parts);
}

/** Time-in-zone classification (secondary): stream seconds allocated across the zones. */
export function timeInZoneDistribution(sessions: ClassifiedSession[]): Distribution {
  const parts: Record<SZone, number> = { S1: 0, S2: 0, S3: 0 };
  for (const s of sessions) {
    if (!s.timeInZoneS) continue; // no stream → contributes to neither view
    for (const z of ZONES) parts[z] += s.timeInZoneS[z];
  }
  return toPercent(parts);
}

export interface WeekDistribution {
  sessionGoal: Distribution;
  timeInZone: Distribution;
  /** True when S2 time-in-zone exceeds the §3.4 threshold — easy work is creeping up. */
  moderateDrift: boolean;
  /** Machine-readable reason for the audit row; present only when drifting (P1). */
  reasonCode?: string;
  /** Athlete-readable sentence; present only when drifting. */
  reasonText?: string;
}

/**
 * Both classifications for a week, plus the moderate-drift check between them (F11). Both are
 * always returned — a single distribution number is the thing this function exists to prevent.
 */
export function weekDistribution(sessions: ClassifiedSession[]): WeekDistribution {
  const sessionGoal = sessionGoalDistribution(sessions);
  const timeInZone = timeInZoneDistribution(sessions);
  const drift = isModerateDrift(timeInZone.S2 / 100);

  return {
    sessionGoal,
    timeInZone,
    moderateDrift: drift,
    ...(drift
      ? {
          reasonCode: MODERATE_DRIFT_REASON,
          reasonText:
            "Your easy sessions have been creeping up — more of this week sat in the moderate zone than it looks like on paper. Keep the easy days genuinely easy.",
        }
      : {}),
  };
}
