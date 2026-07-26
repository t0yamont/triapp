/**
 * §2.4's intensity ceiling, enforced by the planner (I15).
 *
 * `confidenceBehaviour` has always computed `maxSZone` and `z5VolumeFraction` correctly — and
 * `plan/*.ts` never read either of them, so confidence throttled how fast load grew and never
 * how hard the sessions were. A 0.20-confidence athlete was being handed VO₂ intervals
 * prescribed against thresholds nobody had measured.
 */

import { describe, expect, it } from 'vitest';
import { confidenceBehaviour } from '../confidence.js';
import { generatePlan, type GeneratePlanInput } from '../plan/generate.js';
import { constructMicrocycle, type Availability } from '../plan/micro.js';

const availability: Availability = {
  dayMinutes: { 0: 240, 1: 60, 2: 90, 3: 60, 4: 75, 5: 45, 6: 240 },
  weeklyHoursMax: 12,
  longRideDay: 6,
  longRunDay: 0,
  swimDays: [2],
};

const planAt = (confidence: number): GeneratePlanInput => ({
  totalWeeks: 12,
  eventType: 'ironman',
  course: 'long',
  availability,
  startingLoad: 400,
  confidence,
  trainingAgeYears: 4,
  startDate: '2026-08-03',
});

describe('I15 — no S3 below 0.30 anchor confidence', () => {
  it('generates a plan with zero S3 workouts for an under-informed athlete', () => {
    for (const confidence of [0.0, 0.1, 0.2, 0.29]) {
      const workouts = generatePlan(planAt(confidence)).workouts;
      expect(workouts.length).toBeGreaterThan(0); // still a real plan, not an empty one
      expect(workouts.filter((w) => w.sZone === 'S3')).toHaveLength(0);
    }
  });

  it('still prescribes S3 the moment the anchors are good enough', () => {
    const workouts = generatePlan(planAt(0.3)).workouts;
    expect(workouts.some((w) => w.sZone === 'S3')).toBe(true);
  });

  it('leaves the athlete a full aerobic week rather than an empty one', () => {
    // §2.4's critical tier is "aerobic and technique work only" — not "stop training".
    const week = constructMicrocycle({
      phase: 'build',
      isRecoveryWeek: false,
      loadTarget: 600,
      availability,
      confidence: 0.2,
    });
    expect(week.sessions.length).toBeGreaterThan(3);
    expect(week.sessions.every((s) => s.sZone === 'S1')).toBe(true);
    expect(week.sessions.every((s) => !s.isHard)).toBe(true);
    // Purposes stay meaningful: aerobic volume, technique, the long ride (§7.2).
    expect(week.sessions.every((s) => s.purpose !== 'vo2max')).toBe(true);
  });

  it('ties the planner to the published behaviour table rather than a second threshold', () => {
    // If §2.4's tiers ever move, this fails rather than the planner silently disagreeing.
    for (const confidence of [0.0, 0.29, 0.3, 0.75]) {
      const allowsS3 = confidenceBehaviour(confidence).maxSZone === 'S3';
      const hasS3 = generatePlan(planAt(confidence)).workouts.some((w) => w.sZone === 'S3');
      expect(hasS3).toBe(allowsS3);
    }
  });
});

describe('§2.4 z5VolumeFraction — half the S3 volume at low confidence', () => {
  const s3Minutes = (confidence: number): number =>
    constructMicrocycle({
      phase: 'build',
      isRecoveryWeek: false,
      loadTarget: 900,
      availability,
      confidence,
    })
      .sessions.filter((s) => s.sZone === 'S3')
      .reduce((a, s) => a + s.durationMin, 0);

  it('gives a partially-anchored athlete less S3 than a well-anchored one', () => {
    expect(confidenceBehaviour(0.4).z5VolumeFraction).toBe(0.5);
    expect(s3Minutes(0.4)).toBeLessThan(s3Minutes(0.8));
    expect(s3Minutes(0.4)).toBeGreaterThan(0); // reduced, not removed
  });
});
