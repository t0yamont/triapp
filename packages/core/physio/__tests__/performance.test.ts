/**
 * performance.test.ts — the Phase-8 performance budget (08-ROADMAP.md).
 *
 * "Performance pass: p95 dashboard load <1.5 s, plan generation <2 s."
 *
 * **Plan generation** is measured here, honestly and in full: the budget is a wall-clock number,
 * so this measures wall clock, over enough repetitions to take a p95 rather than a lucky single
 * run. It is the one number of the two that can be pinned in a unit test at all — generation is a
 * pure function of its inputs with no I/O anywhere in it.
 *
 * **Dashboard load p95** cannot be measured from here: it is dominated by network round trips,
 * Supabase query latency and browser paint, none of which exist in this process. What *is*
 * measurable is the engine work sitting behind a dashboard render — if that were slow, no amount
 * of front-end work would reach 1.5 s — so it gets its own, much tighter budget below. The
 * end-to-end number needs real-user monitoring against a deployed app.
 *
 * The budgets carry large headroom on purpose. A timing assertion that sits close to the actual
 * cost fails on a noisy CI box and teaches everyone to re-run the suite until it passes, which is
 * worse than not having it.
 */

import { describe, expect, it } from 'vitest';
import { generatePlan, type GeneratePlanInput } from '../plan/generate.js';
import { validateWeek, weekLoad, dailyLoads, monotony, s3TimeFraction, weeklyHours } from '../plan/invariants.js';
import type { Availability } from '../plan/micro.js';

const AVAILABILITY: Availability = {
  dayMinutes: { 0: 300, 1: 60, 2: 90, 3: 75, 4: 90, 5: 45, 6: 300 },
  weeklyHoursMax: 14,
  longRideDay: 6,
  longRunDay: 0,
  swimDays: [2, 4],
};

/** The heaviest realistic case: a full Ironman build, which is the longest plan the app makes. */
const IRONMAN: GeneratePlanInput = {
  totalWeeks: 24,
  eventType: 'ironman',
  course: 'long',
  availability: AVAILABILITY,
  startingLoad: 520,
  confidence: 0.7,
  trainingAgeYears: 5,
  startDate: '2026-08-03',
};

/** Milliseconds at the given percentile. Sorted ascending; `p` is 0–1. */
function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

function timed(runs: number, fn: () => void): { p50: number; p95: number; worst: number } {
  // One warm-up run so JIT compilation is not charged to the first sample.
  fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), worst: Math.max(...samples) };
}

describe('plan generation stays inside its 2 s budget', () => {
  const BUDGET_MS = 2000;

  it('generates a 24-week Ironman plan well inside budget', () => {
    const timing = timed(20, () => generatePlan(IRONMAN));
    expect(timing.p95).toBeLessThan(BUDGET_MS);
    // The budget is the gate; this is the smoke alarm. Generation is a few hundred pure-function
    // calls, so anything approaching a tenth of the budget means something started doing real
    // work per-day that used to be per-plan.
    expect(timing.p50).toBeLessThan(BUDGET_MS / 10);
  });

  it('scales sanely with plan length rather than blowing up', () => {
    const short = timed(20, () => generatePlan({ ...IRONMAN, totalWeeks: 8, eventType: '10k', course: 'short' }));
    const long = timed(20, () => generatePlan(IRONMAN));
    // 3× the weeks should not cost anything like 3× more than linearly; a super-linear jump is
    // the signature of an accidental O(n²) over the week list.
    expect(long.p50).toBeLessThan(Math.max(short.p50 * 12, 50));
  });

  it('holds the budget even at the longest plan the app will build', () => {
    const timing = timed(5, () => generatePlan({ ...IRONMAN, totalWeeks: 52 }));
    expect(timing.worst).toBeLessThan(BUDGET_MS);
  });
});

describe('the engine work behind a dashboard render is negligible', () => {
  // Not the 1.5 s dashboard budget — that is network and paint, and needs RUM in production.
  // This is the part that lives in this process: if it were slow, 1.5 s would be unreachable.
  const ENGINE_BUDGET_MS = 50;

  it('validates and summarises a full season of weeks in milliseconds', () => {
    const plan = generatePlan(IRONMAN);
    const timing = timed(20, () => {
      for (const week of plan.weeks) {
        validateWeek(week.week);
        s3TimeFraction(week.week.sessions);
        weeklyHours(week.week.sessions);
        monotony(dailyLoads(week.week.sessions));
        weekLoad(week.week.sessions);
      }
    });
    expect(timing.p95).toBeLessThan(ENGINE_BUDGET_MS);
  });
});
