import { describe, expect, it } from 'vitest';
import f12 from '../../../../supabase/seed/fixtures/F12-decoupling.json' with { type: 'json' };
import { computeDecoupling, durabilityResponse, type DecouplingInput, type HalfStats } from '../durability/decoupling.js';

const half = (meanHr: number, meanIntensity: number, intensityCv = 0.05): HalfStats => ({ meanHr, meanIntensity, intensityCv });
const input = (over: Partial<DecouplingInput> = {}): DecouplingInput => ({
  first: half(155, 250),
  second: half(165, 250),
  durationMin: 180,
  hadLongStop: false,
  ambientRecorded: true,
  ...over,
});

describe('Decoupling measurement (§11.1, F12)', () => {
  it('F12 — a 3-hour ride drifting 0.62 → 0.66 decouples 6.45% and is valid', () => {
    const r = computeDecoupling(f12.input as DecouplingInput);
    expect(r.ratioFirst).toBeCloseTo(f12.expected.ratioFirst, 4); // 0.62
    expect(r.ratioSecond).toBeCloseTo(f12.expected.ratioSecond, 4); // 0.66
    expect(r.decouplingPct).toBeCloseTo(f12.expected.decouplingPct, 2); // 6.45
    expect(r.valid).toBe(f12.expected.valid);
    expect(r.invalidReasons).toEqual([]);
    expect(r.exceedsTarget).toBe(f12.expected.exceedsTarget); // > 5%

    const resp = durabilityResponse(r);
    expect(resp.action).toBe(f12.expected.action); // increase_aerobic_volume
    expect(resp.reasonCode).toBe(f12.expected.reasonCode); // DECOUPLING_HIGH
  });

  it('is invalid on a session shorter than 75 min', () => {
    expect(computeDecoupling(input({ durationMin: 60 })).invalidReasons).toContain('TOO_SHORT');
  });

  it('is invalid when either half is not steady (intensity CV ≥ 10%)', () => {
    expect(computeDecoupling(input({ first: half(155, 250, 0.12) })).invalidReasons).toContain('UNSTEADY_INTENSITY');
    expect(computeDecoupling(input({ second: half(165, 250, 0.15) })).invalidReasons).toContain('UNSTEADY_INTENSITY');
  });

  it('is invalid after a long stop or without ambient conditions', () => {
    expect(computeDecoupling(input({ hadLongStop: true })).invalidReasons).toContain('LONG_STOP');
    expect(computeDecoupling(input({ ambientRecorded: false })).invalidReasons).toContain('NO_AMBIENT');
  });

  it('reports no drift when the ratio holds, and negative decoupling when it improves', () => {
    expect(computeDecoupling(input({ second: half(155, 250) })).decouplingPct).toBe(0);
    const improving = computeDecoupling(input({ second: half(150, 250) }));
    expect(improving.decouplingPct).toBeLessThan(0);
    expect(improving.exceedsTarget).toBe(false);
  });
});

describe('Durability planning response (§11.2)', () => {
  const high = computeDecoupling(input()); // 6.45%, valid, exceeds
  const steady = computeDecoupling(input({ second: half(155, 250) })); // 0%, valid
  const invalid = computeDecoupling(input({ durationMin: 60 }));

  it('adds aerobic volume (not intensity) when decoupling exceeds 5%', () => {
    const r = durabilityResponse(high);
    expect(r.action).toBe('increase_aerobic_volume');
    expect(r.reasonCode).toBe('DECOUPLING_HIGH');
    expect(durabilityResponse(high, { longCourseWeeksToRace: 14 }).action).toBe('increase_aerobic_volume'); // ≥10 wk out
  });

  it('escalates durability to the primary focus within 10 weeks of a long-course A race', () => {
    const r = durabilityResponse(high, { longCourseWeeksToRace: 8 });
    expect(r.action).toBe('escalate_durability_focus');
    expect(r.reasonCode).toBe('DURABILITY_PRIMARY_LIMITER');
  });

  it('progresses race-pace duration when durability is improving and on target', () => {
    expect(durabilityResponse(steady, { improvingTrend: true }).action).toBe('progress_racepace_duration');
  });

  it('does nothing on a steady-but-not-improving reading, or an invalid one', () => {
    expect(durabilityResponse(steady).action).toBe('none');
    expect(durabilityResponse(invalid, { longCourseWeeksToRace: 4 }).action).toBe('none');
  });
});
