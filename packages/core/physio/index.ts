/**
 * @ironflow/core/physio — THE ENGINE.
 *
 * Pure functions, typed in, typed out. No React, no Supabase, no HTTP client, no reading
 * of the system clock (time is always an argument). Runnable in a plain Node script with
 * no environment. See spec/03-ALGORITHM.md.
 */

export * from './types.js';
export * from './constants.js';
export * from './confidence.js';

// Anchors — the athlete model (§2, §6)
export * from './anchors/hrMax.js';
export * from './anchors/hrRest.js';
export * from './anchors/criticalPower.js';
export * from './anchors/criticalSwimSpeed.js';
export * from './anchors/dfaAlpha1.js';
export * from './anchors/reconcile.js';

// Zones (§3)
export * from './zones/build.js';
export * from './zones/seiler.js';

// Load (§5)
export * from './load/tss.js';
export * from './load/trimp.js';
export * from './load/srpe.js';
export * from './load/fitness.js';
export * from './load/meanMax.js';

// Distribution (§3.4, §4)
export * from './distribution/policy.js';
export * from './distribution/classify.js';

// Planning — periodisation & guardrails (§4, §5.3, §8)
export * from './plan/types.js';
export * from './plan/invariants.js';
export * from './plan/taper.js';
export * from './plan/macro.js';
export * from './plan/micro.js';
export * from './plan/assemble.js';
export * from './plan/generate.js';
export * from './plan/reschedule.js';
export * from './plan/actions.js';
export * from './plan/races.js';
export * from './plan/onboarding.js';
export * from './plan/goalTime.js';
export * from './plan/fieldtest.js';
export * from './plan/replan.js';

// Session templates (§7)
export * from './sessions/library.js';
export * from './sessions/strength.js';
export * from './sessions/heat.js';

// Durability — decoupling & its planning response (§11)
export * from './durability/decoupling.js';

// Adaptive engine — readiness scoring & response rules (§10)
export * from './readiness/score.js';
export * from './readiness/response.js';
export * from './readiness/return.js';
