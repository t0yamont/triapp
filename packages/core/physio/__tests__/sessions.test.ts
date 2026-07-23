import { describe, expect, it } from 'vitest';
import f13 from '../../../../supabase/seed/fixtures/F13-interval-selection.json' with { type: 'json' };
import { renderVo2max, type Repeat, type Step, type WorkoutElement } from '../sessions/library.js';

const repeats = (steps: WorkoutElement[]): Repeat[] => steps.filter((s): s is Repeat => s.kind === 'repeat');

describe('Sport-specific interval selection (§7.2, F13)', () => {
  it('bike VO2max renders 3 × 13 × (30/15)', () => {
    const w = renderVo2max('bike');
    expect(w.purpose).toBe('vo2max');
    expect(w.goalZone).toBe('S3');
    const sets = repeats(w.steps)[0]!;
    expect(sets.count).toBe(f13.expected.bike.sets); // 3
    const reps = repeats(sets.steps)[0]!;
    expect(reps.count).toBe(f13.expected.bike.repsPerSet); // 13
    expect((reps.steps[0] as Step).durationSec).toBe(f13.expected.bike.workSec); // 30
    expect((reps.steps[1] as Step).durationSec).toBe(f13.expected.bike.restSec); // 15
  });

  it('run VO2max renders 4–6 × 3–4 min', () => {
    const w = renderVo2max('run');
    const reps = repeats(w.steps)[0]!;
    const [repsLo, repsHi] = f13.expected.run.repsRange as [number, number];
    expect(reps.count).toBeGreaterThanOrEqual(repsLo); // ≥4
    expect(reps.count).toBeLessThanOrEqual(repsHi); // ≤6
    const work = (reps.steps[0] as Step).durationSec;
    expect(work).toBeGreaterThanOrEqual(f13.expected.run.workMinSec); // ≥180
    expect(work).toBeLessThanOrEqual(f13.expected.run.workMaxSec); // ≤240
  });

  it('the sports do NOT share an interval template', () => {
    expect(JSON.stringify(renderVo2max('bike').steps)).not.toEqual(JSON.stringify(renderVo2max('run').steps));
  });

  it('swim VO2max renders 10 × 100 efforts', () => {
    const w = renderVo2max('swim');
    expect(repeats(w.steps)[0]!.count).toBe(10);
    expect(w.goalZone).toBe('S3');
  });
});
