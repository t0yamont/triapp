import { describe, expect, it } from 'vitest';
import { layoutMacrocycle, type MacroWeek } from '../plan/macro.js';

function assertContiguous(weeks: MacroWeek[], total: number) {
  expect(weeks).toHaveLength(total);
  expect(weeks.map((w) => w.weekNumber)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  expect(weeks[total - 1]!.phase).toBe('race_week'); // the plan always ends on the race
}

describe('Macrocycle layout (§8.1)', () => {
  it('lays out a 24-week Ironman with no gaps or overlaps', () => {
    const weeks = layoutMacrocycle({ totalWeeks: 24, eventType: 'ironman', course: 'long' });
    assertContiguous(weeks, 24);
    const phases = new Set(weeks.map((w) => w.phase));
    expect(phases).toContain('base');
    expect(phases).toContain('build');
    expect(phases).toContain('peak');
    expect(phases).toContain('taper');
    // Taper = ceil(18/7) = 3 weeks (weeks 22–24, last is the race).
    expect(weeks.slice(21).map((w) => w.phase)).toEqual(['taper', 'taper', 'race_week']);
    // 3:1 loading → a recovery week every 4th loading week; peak/taper carry none.
    const recovery = weeks.filter((w) => w.isRecoveryWeek).map((w) => w.weekNumber);
    expect(recovery).toEqual([4, 8, 12, 16]);
  });

  it('uses a 2-week peak for short-course events', () => {
    const weeks = layoutMacrocycle({ totalWeeks: 20, eventType: 'olympic_tri', course: 'short' });
    assertContiguous(weeks, 20);
    expect(weeks.filter((w) => w.phase === 'peak')).toHaveLength(2);
    expect(weeks.filter((w) => w.phase === 'taper')).toHaveLength(1); // ceil(10/7)=2 incl. race week
  });

  it('allocates at least as much to Base as to Build (§8.1: 50–60% vs 40–50%)', () => {
    const weeks = layoutMacrocycle({ totalWeeks: 30, eventType: 'ironman', course: 'long' });
    const baseCount = weeks.filter((w) => w.phase === 'base').length;
    const buildCount = weeks.filter((w) => w.phase === 'build').length;
    expect(baseCount).toBeGreaterThan(0);
    expect(baseCount).toBeGreaterThanOrEqual(buildCount);
  });

  it('compresses to consolidation + taper under 12 weeks (no distinct Base/Peak)', () => {
    const weeks = layoutMacrocycle({ totalWeeks: 8, eventType: 'ironman', course: 'long' });
    assertContiguous(weeks, 8);
    const phases = new Set(weeks.map((w) => w.phase));
    expect(phases.has('base')).toBe(false);
    expect(phases.has('peak')).toBe(false);
    expect(phases.has('build')).toBe(true);
  });

  it('degrades to all-taper when there is not even room for the taper', () => {
    const weeks = layoutMacrocycle({ totalWeeks: 2, eventType: 'ironman', course: 'long' });
    assertContiguous(weeks, 2);
    expect(weeks[0]!.phase).toBe('taper');
    expect(weeks.some((w) => w.isRecoveryWeek)).toBe(false);
  });

  it('honours a 2:1 loading cycle (recovery every 3rd loading week)', () => {
    const weeks = layoutMacrocycle({ totalWeeks: 16, eventType: 'ironman', course: 'long', shortLoadingCycle: true });
    const recovery = weeks.filter((w) => w.isRecoveryWeek).map((w) => w.weekNumber);
    expect(recovery).toEqual([3, 6, 9]); // 10 loading weeks (16 − 3 taper − 3 peak), every 3rd
  });
});
