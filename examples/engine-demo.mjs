// IronFlow engine demo — proves the purity contract (00-AGENT-BRIEF.md): the physiology
// engine runs in a plain Node script with NO environment, no Supabase, no network, no clock.
//
//   pnpm --filter @ironflow/core build   # emit dist/
//   node examples/engine-demo.mjs
//
// Everything below is pure: typed inputs → typed outputs, every estimate carrying its
// { value, confidence, provenance }.

import {
  aggregateDfaSingles,
  bikeTss,
  buildZones,
  confidenceBehaviour,
  deriveHrMax,
  deriveHrRest,
  detectThresholdsFromWindows,
  fitCriticalPower,
  fitnessSeries,
  sportAnchorConfidence,
} from '../packages/core/dist/index.js';

const NOW = '2026-07-22T00:00:00Z';
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// 1. Anchors from real-ish inputs ────────────────────────────────────────────
const hrMax = deriveHrMax({
  observed: {
    value: 187,
    measuredAt: '2026-06-10T00:00:00Z',
    source: 'chest_strap',
    sustainedSeconds: 14,
    precededByJumpOver20BpmIn5s: false,
    sessionDurationMin: 62,
    withinPeakDistribution: true,
  },
  age: 34,
  now: NOW,
});
const hrRest = deriveHrRest({
  nightlyMinima: [44, 45, 45, 46, 46, 47, 47, 48, 48, 49, 42, 50, 51, 52],
  now: NOW,
});

// 2. LT1/LT2 for the run from three DFA-a1 sessions (single → multi) ──────────
const ramp = Array.from({ length: 16 }, (_, i) => ({
  timeS: i * 30,
  alpha1: 1.05 - i * 0.05, // declines through 0.75 (LT1) and 0.50 (LT2)
  hr: 121 + i * 3,
  intensity: 3.0 + i * 0.06, // GAP speed, m/s
  intensitySteady: true,
}));
const sessions = ['2026-07-05', '2026-07-12', '2026-07-18'].map(
  (d) => detectThresholdsFromWindows(ramp, 'speed', `${d}T00:00:00Z`),
);
const lt1 = aggregateDfaSingles(sessions.map((s) => s.lt1), NOW);
const lt2 = aggregateDfaSingles(sessions.map((s) => s.lt2), NOW);

// 3. Assemble the athlete model ──────────────────────────────────────────────
const model = {
  hrMax,
  hrRest,
  hrReserve: hrMax.value - hrRest.value,
  sports: { run: { lt1, lt2 } },
  updatedAt: NOW,
};

console.log('IRONFLOW ENGINE DEMO — pure, no environment\n' + '='.repeat(52));
console.log(
  `\nHRmax  ${hrMax.value} bpm   [${hrMax.provenance}, conf ${hrMax.confidence}]` +
    `\nHRrest ${hrRest.value.toFixed(1)} bpm  [${hrRest.provenance}, conf ${hrRest.confidence}]` +
    `\nHRR    ${model.hrReserve.toFixed(1)} bpm` +
    `\nRun LT1 ${lt1.value.hr} bpm / ${lt1.value.pace.toFixed(2)} m/s  [${lt1.provenance}, conf ${lt1.confidence}]` +
    `\nRun LT2 ${lt2.value.hr} bpm / ${lt2.value.pace.toFixed(2)} m/s  [${lt2.provenance}, conf ${lt2.confidence}]`,
);

// 4. Zones ────────────────────────────────────────────────────────────────────
const zones = buildZones(model, 'run');
console.log(`\nRUN HR ZONES  (mode: ${zones.mode}, anchor confidence ${zones.anchorConfidence})`);
for (const z of zones.zones) {
  console.log(
    `  ${z.id} ${z.name.padEnd(10)} ${String(z.lower.bpm).padStart(3)}–${String(z.upper.bpm).padStart(3)} bpm` +
      `   (${pct(z.lower.pctHRR)}–${pct(z.upper.pctHRR)} HRR)`,
  );
}

// 5. How confidence changes behaviour (§2.4) ─────────────────────────────────
const behaviour = confidenceBehaviour(sportAnchorConfidence(model, 'run'));
console.log(
  `\nBEHAVIOUR at anchor confidence ${sportAnchorConfidence(model, 'run')} → tier "${behaviour.tier}"` +
    `\n  ramp cap ×${behaviour.rampCapMultiplier}, max zone ${behaviour.maxSZone}, next test within ${behaviour.testWithinDays} days`,
);

// 6. Critical power fit for the bike ─────────────────────────────────────────
const cp = fitCriticalPower(
  [
    { durationS: 180, power: 320, sessionId: 'a', date: '2026-07-01T00:00:00Z' },
    { durationS: 300, power: 290, sessionId: 'a', date: '2026-07-01T00:00:00Z' },
    { durationS: 600, power: 262, sessionId: 'b', date: '2026-07-10T00:00:00Z' },
    { durationS: 900, power: 252, sessionId: 'b', date: '2026-07-10T00:00:00Z' },
  ],
  'bike',
  NOW,
).estimate;
console.log(
  `\nBIKE CP  ${cp.value.criticalIntensity.toFixed(1)} W, W′ ${(cp.value.wPrime / 1000).toFixed(1)} kJ, ` +
    `R² ${cp.value.r2.toFixed(4)}  [${cp.provenance}, conf ${cp.confidence.toFixed(3)}]`,
);
const session = bikeTss({ durationS: 3600, np: Math.round(cp.value.criticalIntensity * 0.85), cp: cp.value.criticalIntensity });
console.log(`  1 h ride at IF ${session.intensityFactor.toFixed(2)} → TSS ${session.tss.toFixed(1)}`);

// 7. Fitness / fatigue over a fortnight ──────────────────────────────────────
const loads = [60, 40, 90, 0, 75, 120, 30, 55, 45, 95, 0, 80, 130, 25];
const pmc = fitnessSeries(loads);
const last = pmc.at(-1);
console.log(
  `\nAfter ${loads.length} days:  CTL ${last.ctl.toFixed(1)}  ATL ${last.atl.toFixed(1)}  TSB ${last.tsb.toFixed(1)}`,
);
console.log('\nEngine ran with zero environment. ✔');
