/**
 * season.test.ts — the Phase-8 gate: "12-week simulated season across 20 synthetic athletes,
 * zero guardrail violations" (08-ROADMAP.md).
 *
 * This is the whole engine under load: 20 deliberately varied athletes each get a generated
 * plan, every week of it is validated against the guardrails *with the cross-week context*
 * (G2 long-session growth, G8 strain against a rolling mean), and then each athlete lives
 * through 12 weeks of daily readiness so the adaptive path is exercised too. Everything is
 * derived from the athlete index — no RNG — so a failure is always reproducible.
 */

import { describe, expect, it } from 'vitest';
import { adaptToday, type DailyReadiness } from '../readiness/response.js';
import { addDaysISO, generatePlan, type GeneratePlanInput } from '../plan/generate.js';
import { dailyLoads, longestBySport, strain, validateWeek, weekLoad } from '../plan/invariants.js';
import type { Availability } from '../plan/micro.js';
import type { EventType, GuardrailWeek, PlanSport } from '../plan/types.js';
import type { SZone } from '../types.js';

const EVENTS: EventType[] = ['ironman', '70.3', 'marathon', 'olympic_tri', 'half_marathon', 'sprint_tri', '10k', '5k'];
const LONG_COURSE = new Set<EventType>(['ironman', '70.3', 'marathon']);

interface Athlete {
  id: string;
  input: GeneratePlanInput;
}

/** 20 athletes spanning the realistic range: novice→veteran, 6→16 h/wk, sparse→full availability. */
function syntheticAthletes(): Athlete[] {
  return Array.from({ length: 20 }, (_, i) => {
    const eventType = EVENTS[i % EVENTS.length]!;
    const course = LONG_COURSE.has(eventType) ? 'long' : 'short';
    const weeklyHoursMax = 6 + (i % 6) * 2; // 6..16 h
    const trainsSevenDays = i % 3 === 0;

    // Availability scales with the athlete's declared ceiling so the two are never absurd together.
    const longDayMin = Math.round(weeklyHoursMax * 60 * 0.3);
    const shortDayMin = Math.round(weeklyHoursMax * 60 * 0.09);
    const dayMinutes: Record<number, number> = {
      1: shortDayMin,
      2: shortDayMin + 15,
      3: shortDayMin,
      4: shortDayMin + 15,
      6: longDayMin,
    };
    if (trainsSevenDays) {
      dayMinutes[5] = shortDayMin;
      dayMinutes[0] = Math.round(longDayMin * 0.6);
    }

    const availability: Availability = {
      dayMinutes,
      weeklyHoursMax,
      longRideDay: 6,
      ...(trainsSevenDays ? { longRunDay: 0 } : {}),
      swimDays: [2],
    };

    return {
      id: `athlete-${i + 1}`,
      input: {
        totalWeeks: 12 + (i % 13), // 12..24 weeks
        eventType,
        course,
        availability,
        startingLoad: 200 + i * 20, // 200..580
        // 0.15..0.90 — spans every §2.4 tier *including* the critical one. It previously
        // started at 0.30, so no synthetic athlete ever sat below the I15 threshold and the
        // cohort was structurally blind to an unenforced intensity ceiling.
        confidence: i % 8 === 0 ? 0.15 + (i % 3) * 0.05 : 0.3 + (i % 7) * 0.1,
        trainingAgeYears: i % 5 === 0 ? 0.5 : 1 + (i % 9), // some novices (tighter G1 cap)
        startDate: '2026-08-03', // a Monday
        ...(i % 4 === 0 ? { shortLoadingCycle: true } : {}), // 2:1 loading for some
      },
    };
  });
}

const athletes = syntheticAthletes();

const PEAK_WINDOW_WEEKS = 4;

/**
 * Rebuild each week with the cross-week context the guardrails need: G4 wants the immediately
 * preceding week's load, G2 the recent *peak* longest session per sport, G8 the rolling mean
 * strain. This is what a persistence layer would supply from the athlete's history.
 */
function withCrossWeekContext(weeks: GuardrailWeek[]): GuardrailWeek[] {
  const strains: number[] = [];
  return weeks.map((week, i) => {
    const prior = weeks[i - 1];
    const rollingMean = strains.length > 0 ? strains.reduce((a, b) => a + b, 0) / strains.length : undefined;
    strains.push(strain(dailyLoads(week.sessions)));

    const peak: Partial<Record<PlanSport, number>> = {};
    for (const past of weeks.slice(Math.max(0, i - PEAK_WINDOW_WEEKS), i)) {
      for (const [sport, min] of Object.entries(longestBySport(past.sessions)) as [PlanSport, number][]) {
        peak[sport] = Math.max(peak[sport] ?? 0, min);
      }
    }

    return {
      ...week,
      ...(prior ? { priorWeekLoad: weekLoad(prior.sessions) } : {}),
      ...(Object.keys(peak).length > 0 ? { priorLongestBySport: peak } : {}),
      ...(rollingMean !== undefined ? { strainRollingMean: rollingMean } : {}),
    };
  });
}

describe('Phase-8 gate — simulated season across 20 synthetic athletes', () => {
  it('every athlete gets a complete, contiguous plan', () => {
    for (const a of athletes) {
      const plan = generatePlan(a.input);
      expect(plan.summary.totalWeeks, a.id).toBe(a.input.totalWeeks);
      expect(plan.weeks.map((w) => w.weekNumber), a.id).toEqual(
        Array.from({ length: a.input.totalWeeks }, (_, i) => i + 1),
      );
      expect(plan.weeks[plan.weeks.length - 1]!.phase, a.id).toBe('race_week');
      expect(plan.summary.totalWorkouts, a.id).toBeGreaterThan(0);
    }
  });

  it('zero guardrail violations across every week of every athlete', () => {
    const failures: string[] = [];

    for (const a of athletes) {
      const plan = generatePlan(a.input);
      const weeks = withCrossWeekContext(plan.weeks.map((w) => w.week));

      weeks.forEach((week, i) => {
        for (const v of validateWeek(week)) {
          failures.push(`${a.id} (${a.input.eventType}, ${a.input.availability.weeklyHoursMax}h) week ${i + 1}: ${v.code} — ${v.message}`);
        }
      });
    }

    expect(failures, `\n${failures.slice(0, 25).join('\n')}\n`).toEqual([]);
  });

  it('respects every athlete\'s declared weekly hour ceiling (G10, I7)', () => {
    for (const a of athletes) {
      for (const w of generatePlan(a.input).weeks) {
        const hours = w.week.sessions.reduce((sum, s) => sum + s.durationMin, 0) / 60;
        expect(hours, `${a.id} week ${w.weekNumber}`).toBeLessThanOrEqual(a.input.availability.weeklyHoursMax);
      }
    }
  });

  it('never schedules a session on a day the athlete cannot train (I18)', () => {
    for (const a of athletes) {
      const trainable = new Set(
        Object.entries(a.input.availability.dayMinutes)
          .filter(([, min]) => min > 0)
          .map(([d]) => Number(d)),
      );
      for (const w of generatePlan(a.input).workouts) {
        expect(trainable.has(w.dayOfWeek), `${a.id} ${w.scheduledDate}`).toBe(true);
      }
    }
  });

  it('prescribes no S3 to an athlete whose anchors are barely known (I15)', () => {
    const underInformed = athletes.filter((a) => a.input.confidence < 0.3);
    expect(underInformed.length).toBeGreaterThan(0); // the cohort must actually cover this tier

    for (const a of underInformed) {
      for (const w of generatePlan(a.input).workouts) {
        expect(w.sZone, `${a.id} ${w.scheduledDate} — ${w.name}`).not.toBe('S3');
      }
    }
  });

  it('halves the S3 volume cap for a partially-known athlete (§2.4 z5VolumeFraction)', () => {
    const low = athletes.filter((a) => a.input.confidence >= 0.3 && a.input.confidence < 0.5);
    const high = athletes.filter((a) => a.input.confidence >= 0.75);
    if (low.length === 0 || high.length === 0) return;

    const s3Share = (a: (typeof athletes)[number]): number => {
      const ws = generatePlan(a.input).workouts;
      const total = ws.reduce((acc, w) => acc + w.durationMin, 0);
      const s3 = ws.filter((w) => w.sZone === 'S3').reduce((acc, w) => acc + w.durationMin, 0);
      return total > 0 ? s3 / total : 0;
    };
    const lowMean = low.reduce((acc, a) => acc + s3Share(a), 0) / low.length;
    const highMean = high.reduce((acc, a) => acc + s3Share(a), 0) / high.length;
    expect(lowMean).toBeLessThan(highMean);
  });

  it('leaves at least one rest day a week, two in recovery weeks (I17)', () => {
    for (const a of athletes) {
      for (const w of generatePlan(a.input).weeks) {
        const trained = new Set(w.week.sessions.map((s) => s.dayOfWeek)).size;
        const restDays = 7 - trained;
        expect(restDays, `${a.id} week ${w.weekNumber}`).toBeGreaterThanOrEqual(w.isRecoveryWeek ? 2 : 1);
      }
    }
  });

  it('lives 12 weeks of daily readiness without ever increasing load (I12, I13)', () => {
    const bands: DailyReadiness['band'][] = ['within', 'within', 'above', 'below', 'within', 'below', 'below'];
    let adaptations = 0;

    for (const a of athletes) {
      const plan = generatePlan(a.input);
      const history: DailyReadiness[] = [];

      // 84 days of the athlete's own season, walking their real scheduled sessions.
      for (let day = 0; day < 84; day++) {
        // A deterministic but varied readiness stream, with the occasional genuine crash.
        const band = bands[(day + a.id.length) % bands.length]!;
        const crash = day % 37 === 0;
        history.push({ band, ...(crash ? { hrvZ: -2.4 } : {}), restingHrDeltaBpm: band === 'below' ? 8 : 1 });

        const scheduled = plan.workouts.find((w) => w.scheduledDate === addDaysISO(a.input.startDate, day));
        const zone: SZone = scheduled?.sZone ?? 'S1';
        const r = adaptToday(history.slice(-6), zone);

        // I12 — a readiness signal may only ever reduce load.
        expect(r.weekLoadDeltaPct, `${a.id} day ${day}`).toBeLessThanOrEqual(0);

        // I13 — a change always carries exactly one audited, athlete-readable mutation.
        if (r.action !== 'none') {
          adaptations += 1;
          expect(r.mutation, `${a.id} day ${day}`).toBeDefined();
          expect(r.mutation!.reasonCode.length).toBeGreaterThan(0);
          expect(r.mutation!.reasonText.trim().length).toBeGreaterThan(0);
        } else {
          expect(r.mutation).toBeUndefined();
        }
      }
    }

    // The season must actually have exercised the adaptive path, not just passed vacuously.
    expect(adaptations).toBeGreaterThan(100);
  });
});

