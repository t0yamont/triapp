/**
 * load/srpe.ts — perceived load, session RPE (03-ALGORITHM.md §5.1; Foster et al. 2001).
 *
 * sRPE = RPE (0–10, CR10 scale) × duration (minutes). Always available if the athlete
 * logs it; the fallback and cross-check metric.
 */

export function srpe(params: { rpe: number; durationMin: number }): number {
  const { rpe, durationMin } = params;
  if (rpe < 0 || rpe > 10) throw new Error(`sRPE expects RPE on 0–10 (CR10); got ${rpe}`);
  return rpe * durationMin;
}
