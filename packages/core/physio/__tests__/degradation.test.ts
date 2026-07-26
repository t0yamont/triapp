/**
 * F15 — the engine still works for an athlete with almost nothing (§14).
 *
 * This fixture had never been written, despite gating Phase 5. The product's whole claim is that
 * the *same* engine serves a lab-tested athlete and someone with a cheap watch; §14 is where that
 * claim is cashed, and it existed only as prose.
 */

import { describe, expect, it } from 'vitest';
import f15 from '../../../../supabase/seed/fixtures/F15-degradation.json' with { type: 'json' };
import { buildAthleteModel } from '../anchors/model.js';
import {
  degradationPlan,
  sessionTargets,
  sumMeasuredLoad,
  targetModalities,
  type AthleteCapabilities,
} from '../degradation.js';
import { generatePlan, type GeneratePlanInput } from '../plan/generate.js';
import { readinessScore } from '../readiness/score.js';
import { buildZones } from '../zones/build.js';

const caps: AthleteCapabilities = f15.input.capabilities;

const NOW = '2026-07-26T07:00:00.000Z';
const model = buildAthleteModel({
  hrMax: { age: 38, now: NOW },
  hrRest: { morningReadings: [52, 54, 53], now: NOW },
  now: NOW,
})!.model;
const zoneSet = buildZones(model, 'bike');

const planInput: GeneratePlanInput = {
  totalWeeks: 12,
  eventType: '70.3',
  course: 'long',
  availability: {
    dayMinutes: { 1: 60, 2: 60, 3: 75, 4: 60, 5: 45, 6: 180 },
    weeklyHoursMax: 10,
    longRideDay: 6,
    swimDays: [4],
  },
  startingLoad: 350,
  confidence: 0.45,
  trainingAgeYears: 3,
  startDate: '2026-08-03',
};

describe('F15 — degradation (§14)', () => {
  it('still produces a valid plan', () => {
    const plan = generatePlan(planInput);
    expect(plan.workouts.length).toBeGreaterThan(0);
    expect(plan.weeks).toHaveLength(planInput.totalWeeks);
    expect(f15.expected.planStillGenerates).toBe(true);
  });

  it('computes readiness from wellness and completion alone', () => {
    const plan = degradationPlan(caps);
    expect(plan.readinessFromWellnessOnly).toBe(f15.expected.readiness.fromWellnessOnly);
    expect(plan.requireDailyWellnessPrompt).toBe(true);

    // No HRV, no sleep device — the score must still come out, weighted across what exists.
    const readiness = readinessScore({
      wellness: { rolling: 4, baseline: 3.5, sd: 0.5 },
      completionRate: 0.9,
    });
    expect(readiness.band).not.toBe('unknown');
    expect(readiness.components.map((c) => c.key).sort()).toEqual(
      [...f15.expected.readiness.components].sort(),
    );
  });

  it('prescribes bike sessions in HR and RPE — never a null target', () => {
    expect(targetModalities('bike', caps)).toEqual(f15.expected.bikeTargets);

    const targets = sessionTargets('bike', 'S3', caps, zoneSet);
    const hr = targets.find((t) => t.modality === 'hr')!;
    const rpe = targets.find((t) => t.modality === 'rpe')!;
    expect(hr.band!.lo).toBeGreaterThan(0);
    expect(rpe.band).toEqual({ lo: 8, hi: 10 });
  });

  it('prescribes swims by stroke count and RPE', () => {
    expect(targetModalities('swim', caps)).toEqual(f15.expected.swimTargets);
    const targets = sessionTargets('swim', 'S1', caps);
    expect(targets.some((t) => t.modality === 'stroke_count')).toBe(true);
    expect(targets.find((t) => t.modality === 'rpe')!.band).toEqual({ lo: 2, hi: 4 });
  });

  it('excludes swim load from totals, and says so', () => {
    const totals = sumMeasuredLoad(
      [
        { sport: 'bike', load: 200 },
        { sport: 'run', load: 100 },
        { sport: 'swim', load: 60 },
      ],
      caps,
    );
    expect(totals.total).toBe(300);
    expect(totals.excluded).toBe(60);
    // "with a visible note" — the exclusion is worthless if the athlete can't see it happened.
    expect(totals.excludedNote).toMatch(/\S/);
    expect(f15.expected.swimLoad.requiresVisibleNote).toBe(true);
  });

  it('refuses the anchor paths its data cannot support', () => {
    const plan = degradationPlan(caps);
    expect(plan.dfaA1Available).toBe(f15.expected.dfaA1Available);
    expect(plan.cpFitAllowed).toBe(f15.expected.cpFitAllowed); // never fit CP from GPS speed
    expect(plan.recommendBikeFieldTest).toBe(f15.expected.recommendBikeFieldTest);
  });

  it('never returns an empty target list, for any sport or zone', () => {
    const nothing: AthleteCapabilities = {
      hasHrv: false,
      hasHr: false,
      hasPowerMeter: false,
      hasRunningGps: false,
      hasSwimData: false,
      hasSleepDevice: false,
    };
    for (const sport of ['run', 'bike', 'swim', 'brick', 'strength'] as const) {
      for (const zone of ['S1', 'S2', 'S3'] as const) {
        const targets = sessionTargets(sport, zone, nothing);
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.every((t) => t.modality !== 'hr')).toBe(true); // no HR ⇒ no HR target
        expect(targets.some((t) => t.modality === 'rpe')).toBe(true); // …but always RPE
      }
    }
  });
});

describe('§14 — the rest of the matrix', () => {
  const fully: AthleteCapabilities = {
    hasHrv: true,
    hasHr: true,
    hasPowerMeter: true,
    hasRunningGps: true,
    hasSwimData: true,
    hasSleepDevice: true,
  };

  it('leaves a fully-equipped athlete undegraded', () => {
    const plan = degradationPlan(fully);
    expect(plan.dfaA1Available).toBe(true);
    expect(plan.cpFitAllowed).toBe(true);
    expect(plan.excludeSwimFromLoadTotals).toBe(false);
    expect(plan.swimExclusionNote).toBeUndefined();
    expect(sumMeasuredLoad([{ sport: 'swim', load: 60 }], fully).total).toBe(60);
  });

  it('flags GAP unavailable on a treadmill, and drops pace targets with it', () => {
    const treadmill = { ...fully, hasRunningGps: false };
    expect(degradationPlan(treadmill).gapAvailable).toBe(false);
    expect(targetModalities('run', treadmill)).toEqual(['hr', 'rpe']);
  });

  it('reports TRIMP unavailable when there is no HR at all', () => {
    expect(degradationPlan({ ...fully, hasHr: false }).trimpAvailable).toBe(false);
  });

  it('prefers power for a bike session when there is a meter', () => {
    expect(targetModalities('bike', fully)).toEqual(['power', 'hr', 'rpe']);
  });
});

describe('§14 — the remaining branches', () => {
  const fully: AthleteCapabilities = {
    hasHrv: true,
    hasHr: true,
    hasPowerMeter: true,
    hasRunningGps: true,
    hasSwimData: true,
    hasSleepDevice: true,
  };

  it('prescribes a swim by pace once there is swim data', () => {
    expect(targetModalities('swim', fully)).toEqual(['pace', 'rpe']);
  });

  it('prescribes a run by pace when GPS is present', () => {
    expect(targetModalities('run', fully)).toEqual(['pace', 'hr', 'rpe']);
  });

  it('drops the HR target when zones were never built, even though HR exists', () => {
    // `hasHr` says a watch reports heart rate; a `ZoneSet` says we know what to do with it.
    const targets = sessionTargets('bike', 'S2', fully); // no zoneSet passed
    expect(targets.some((t) => t.modality === 'hr')).toBe(false);
    expect(targets.some((t) => t.modality === 'rpe')).toBe(true);
  });

  it('names power and pace as modalities without inventing a band for them', () => {
    const targets = sessionTargets('bike', 'S3', fully, undefined);
    const power = targets.find((t) => t.modality === 'power')!;
    expect(power.band).toBeUndefined(); // needs a CP anchor nobody has yet
  });

  it('excludes nothing, and adds no note, when there is no swim load to exclude', () => {
    const noSwimSessions = sumMeasuredLoad([{ sport: 'run', load: 50 }], caps);
    expect(noSwimSessions.excluded).toBe(0);
    expect(noSwimSessions.excludedNote).toBeUndefined();
  });
});
