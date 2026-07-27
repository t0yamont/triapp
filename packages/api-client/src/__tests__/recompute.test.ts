import { describe, expect, it } from 'vitest';
import { activityLoad, buildDailyMetrics, rollUpDays, type DailyRollup } from '../repositories/recompute.js';
import type { Tables } from '../types.js';

type Activity = Tables<'activities'>;

const activity = (over: Partial<Activity>): Activity =>
  ({
    start_time: '2026-07-20T08:00:00.000Z',
    local_tz_offset_min: 0,
    sport: 'run',
    internal_load: null,
    external_load: null,
    perceived_load: null,
    ...over,
  }) as Activity;

describe('activityLoad — the §5 hierarchy', () => {
  it('prefers measured internal load over everything else', () => {
    expect(activityLoad(activity({ internal_load: 80, external_load: 95, perceived_load: 60 }))).toBe(80);
  });

  it('falls back through external, then perceived', () => {
    expect(activityLoad(activity({ external_load: 95, perceived_load: 60 }))).toBe(95);
    expect(activityLoad(activity({ perceived_load: 60 }))).toBe(60);
  });

  // An unscored activity contributes nothing rather than breaking the series with a null.
  it('is zero when nothing scored it', () => {
    expect(activityLoad(activity({}))).toBe(0);
  });
});

describe('rollUpDays', () => {
  it('produces a dense consecutive series with rest days at zero', () => {
    const days = rollUpDays([activity({ start_time: '2026-07-20T08:00:00Z', internal_load: 50 })], '2026-07-18', '2026-07-21');
    expect(days.map((d) => d.date)).toEqual(['2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21']);
    expect(days.map((d) => d.load)).toEqual([0, 0, 50, 0]);
  });

  it('sums two sessions on one day and keeps them apart by sport', () => {
    const days = rollUpDays(
      [
        activity({ start_time: '2026-07-20T06:00:00Z', sport: 'swim', internal_load: 30 }),
        activity({ start_time: '2026-07-20T17:00:00Z', sport: 'run', internal_load: 70 }),
      ],
      '2026-07-20',
      '2026-07-20',
    );
    expect(days[0]!.load).toBe(100);
    expect(days[0]!.bySport).toEqual({ swim: 30, run: 70 });
  });

  // Hard rule 8. A 6am ride in Auckland is 18:00 UTC the day before; filed by UTC it lands on the
  // wrong day, and every downstream number — CTL, monotony, the strip on Today — shifts with it.
  it('files an activity under the athlete local day, not the UTC one', () => {
    const days = rollUpDays(
      [activity({ start_time: '2026-07-19T18:00:00Z', local_tz_offset_min: 720, internal_load: 60 })],
      '2026-07-19',
      '2026-07-20',
    );
    expect(days.find((d) => d.date === '2026-07-20')!.load).toBe(60);
    expect(days.find((d) => d.date === '2026-07-19')!.load).toBe(0);
  });

  it('ignores an activity whose local date falls outside the window', () => {
    const days = rollUpDays([activity({ start_time: '2026-01-01T08:00:00Z', internal_load: 99 })], '2026-07-19', '2026-07-20');
    expect(days.every((d) => d.load === 0)).toBe(true);
  });
});

const flat = (load: number, n: number): DailyRollup[] =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    load,
    bySport: { run: load },
  }));

describe('buildDailyMetrics', () => {
  it('converges CTL and ATL on a steady load, leaving TSB near zero', () => {
    const rows = buildDailyMetrics(flat(50, 200));
    const last = rows.at(-1)!;
    expect(last.ctl_total).toBeCloseTo(50, 0);
    expect(last.atl_total).toBeCloseTo(50, 0);
    expect(last.tsb_total).toBeCloseTo(0, 0);
  });

  // ATL's time constant is 7 days against CTL's 42, so fatigue must lead fitness on a ramp.
  it('moves ATL faster than CTL when load arrives', () => {
    const rows = buildDailyMetrics(flat(100, 10));
    const last = rows.at(-1)!;
    expect(last.atl_total).toBeGreaterThan(last.ctl_total);
  });

  it('decays both toward zero across a layoff', () => {
    const trained = flat(80, 60);
    const rested = flat(0, 30).map((d, i) => ({ ...d, date: `2026-04-${String(i + 1).padStart(2, '0')}` }));
    const rows = buildDailyMetrics([...trained, ...rested]);
    expect(rows.at(-1)!.ctl_total).toBeLessThan(rows[trained.length - 1]!.ctl_total);
    // 30 days is >4 ATL time constants, so fatigue is down to a couple of percent of where it was.
    expect(rows.at(-1)!.atl_total).toBeLessThan(rows[trained.length - 1]!.atl_total * 0.02);
  });

  it('tracks CTL per sport as well as combined', () => {
    const days: DailyRollup[] = flat(0, 60).map((d, i) => ({
      ...d,
      load: 100,
      bySport: (i % 2 === 0 ? { run: 100 } : { bike: 100 }) as Record<string, number>,
    }));
    const bySport = buildDailyMetrics(days).at(-1)!.ctl_by_sport as Record<string, number>;
    expect(bySport['run']).toBeGreaterThan(0);
    expect(bySport['bike']).toBeGreaterThan(0);
    // Each sport carries about half the combined load, and they sum back to it.
    expect(bySport['run']! + bySport['bike']!).toBeCloseTo(buildDailyMetrics(days).at(-1)!.ctl_total, 5);
  });

  // A standard deviation over three days is not monotony, it is noise with a name.
  it('leaves monotony and strain null until a full trailing week exists', () => {
    const rows = buildDailyMetrics(flat(60, 10));
    expect(rows[5]!.monotony).toBeNull();
    expect(rows[5]!.strain).toBeNull();
    expect(rows[6]!.monotony).not.toBeNull();
  });

  it('flags a monotonous week and a varied one differently', () => {
    const sameEveryDay = buildDailyMetrics(flat(60, 14)).at(-1)!;
    const varied = buildDailyMetrics(
      flat(60, 14).map((d, i) => ({ ...d, load: i % 2 === 0 ? 20 : 100 })),
    ).at(-1)!;
    expect(sameEveryDay.monotony!).toBeGreaterThan(varied.monotony!);
    expect(sameEveryDay.strain!).toBeGreaterThan(varied.strain!);
  });

  it('handles an athlete with no activities at all', () => {
    const rows = buildDailyMetrics(flat(0, 8));
    expect(rows.at(-1)).toMatchObject({ ctl_total: 0, atl_total: 0, tsb_total: 0, daily_load: 0 });
    expect(rows.at(-1)!.ctl_by_sport).toEqual({ run: 0 });
  });
});
