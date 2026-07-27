import { describe, expect, it } from 'vitest';
import f13 from '../../../../supabase/seed/fixtures/F13-interval-selection.json' with { type: 'json' };
import { renderSession, renderVo2max, structureDurationSec, type Repeat, type Step, type WorkoutElement } from '../sessions/library.js';
import type { SessionPurpose } from '../plan/types.js';

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

describe('Swim sessions are written as sets (§7.2)', () => {
  const swim = (purpose: SessionPurpose, durationMin = 40) =>
    renderSession({ sport: 'swim', purpose, goalZone: 'S1', durationMin });

  it('never renders an easy swim as one continuous block — nobody swims that way', () => {
    const s = swim('aerobic_volume');
    expect(s.steps.some((el) => el.kind === 'repeat')).toBe(true);
    expect(s.steps.some((el) => el.kind === 'step' && el.intent === 'steady')).toBe(false);
  });

  it('alternates a drill with a swim in a technique session', () => {
    const rep = swim('technique').steps.find((el) => el.kind === 'repeat')!;
    expect(rep.steps.map((el) => (el.kind === 'step' ? el.intent : 'repeat'))).toEqual([
      'drill',
      'work',
      'recovery',
    ]);
  });

  it('keeps drills easy so technique work is not scored as intensity', () => {
    const rep = swim('technique').steps.find((el) => el.kind === 'repeat')!;
    const drill = rep.steps.find((el) => el.kind === 'step' && el.intent === 'drill')!;
    expect(drill.kind === 'step' && drill.targetZone).toBe('S1');
  });

  it('preserves the session total exactly, whatever the remainder', () => {
    for (const min of [20, 33, 40, 47, 60]) {
      expect(structureDurationSec(swim('aerobic_volume', min).steps)).toBe(min * 60);
      expect(structureDurationSec(swim('technique', min).steps)).toBe(min * 60);
    }
  });

  it('still uses the §7.2 interval template for a VO₂ swim', () => {
    const s = swim('vo2max', 45);
    const rep = s.steps.find((el) => el.kind === 'repeat')!;
    expect(rep.steps.some((el) => el.kind === 'step' && el.targetZone === 'S3')).toBe(true);
  });

  it('leaves bike and run sessions alone', () => {
    const run = renderSession({ sport: 'run', purpose: 'aerobic_volume', goalZone: 'S1', durationMin: 45 });
    expect(run.steps).toEqual([{ kind: 'step', intent: 'steady', durationSec: 2700, targetZone: 'S1' }]);
  });
});
