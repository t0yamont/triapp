import type { Tables } from '@ironflow/api-client';
import { describe, expect, it } from 'vitest';
import { ACTIVITIES, listTotals, type ActivitySummary } from './activities-demo';
import { dateLabels, toActivitySummary } from './live-activities';

/** A stored activity, as Postgres returns it — note the numerics arrive as strings. */
const row = (over: Partial<Tables<'activities'>> = {}): Tables<'activities'> =>
  ({
    id: 'act-1',
    athlete_id: 'ath-1',
    sport: 'bike',
    sub_sport: null,
    start_time: '2026-07-22T17:30:00.000Z',
    local_tz_offset_min: 120,
    duration_s: 3630,
    moving_time_s: null,
    distance_m: '31800.5',
    elevation_gain_m: null,
    avg_hr: 141,
    max_hr: 178,
    avg_power_w: null,
    normalized_power_w: null,
    avg_speed_mps: null,
    avg_gap_speed_mps: null,
    avg_cadence: null,
    swim_avg_pace_s_per_100m: null,
    swim_stroke_count: null,
    temperature_c: null,
    humidity_pct: null,
    avg_altitude_m: null,
    external_load: null,
    internal_load: '78.4',
    perceived_load: null,
    rpe: null,
    load_disagreement: null,
    session_goal_zone: null,
    time_in_s1_s: 2400,
    time_in_s2_s: 900,
    time_in_s3_s: 330,
    decoupling_pct: null,
    decoupling_valid: false,
    hr_source: 'chest_strap',
    has_rr_intervals: true,
    has_streams: true,
    primary_provider: 'fit_upload',
    provider_activity_id: null,
    is_duplicate_of: null,
    planned_workout_id: null,
    created_at: '2026-07-22T19:00:00.000Z',
    ...over,
  }) as Tables<'activities'>;

const noNames = () => undefined;

describe('toActivitySummary', () => {
  it('keeps an absent load figure null rather than zero', () => {
    const s = toActivitySummary(row(), noNames);
    expect(s.trimp).toBe(78); // measured at ingest, rounded off the numeric string
    expect(s.tss).toBeNull(); // no CP/CS/CSS yet
    expect(s.srpe).toBeNull(); // nothing collects an RPE yet
  });

  it('converts the numeric columns Postgres returns as strings', () => {
    expect(toActivitySummary(row(), noNames).distanceKm).toBe(31.8);
    expect(toActivitySummary(row({ distance_m: null }), noNames).distanceKm).toBeNull();
  });

  it('rounds duration to whole minutes', () => {
    expect(toActivitySummary(row(), noNames).durationMin).toBe(61);
  });

  it('names the row from the session it completed, and marks it unplanned otherwise', () => {
    const linked = toActivitySummary(row({ planned_workout_id: 'w-1' }), (id) =>
      id === 'w-1' ? 'VO₂ intervals' : undefined,
    );
    expect(linked.title).toBe('VO₂ intervals');
    expect(linked.status).toBe('completed');

    const orphan = toActivitySummary(row(), noNames);
    expect(orphan.title).toBe('Bike · 61m');
    expect(orphan.status).toBe('unplanned');
  });

  it('falls back to a plain label when the linked session is outside the read window', () => {
    const s = toActivitySummary(row({ planned_workout_id: 'w-missing' }), noNames);
    expect(s.title).toBe('Bike · 61m');
    expect(s.status).toBe('completed'); // it *is* attributed; we just don't have its name here
  });

  it('renders a brick as a run — the run leg carries the load', () => {
    expect(toActivitySummary(row({ sport: 'brick' }), noNames).sport).toBe('run');
    expect(toActivitySummary(row({ sport: 'strength' }), noNames).sport).toBe('strength');
  });

  // Hard rule #8: stored UTC, reasoned about in the athlete's local zone.
  describe('the day is the athlete’s local day', () => {
    it('uses the local zone, not the UTC prefix, for a late-evening session', () => {
      // 22:30 UTC on the 22nd is 00:30 on the 23rd in UTC+2 — the ride was on the 23rd.
      const late = toActivitySummary(row({ start_time: '2026-07-22T22:30:00.000Z' }), noNames);
      expect(late.dateLabel).toBe('23 Jul');
      expect(late.dayLabel).toBe('Thu');
    });

    it('uses the local zone for an early-morning session west of UTC', () => {
      // 02:00 UTC on the 23rd is 22:00 on the 22nd in UTC−4.
      const early = toActivitySummary(
        row({ start_time: '2026-07-23T02:00:00.000Z', local_tz_offset_min: -240 }),
        noNames,
      );
      expect(early.dateLabel).toBe('22 Jul');
    });

    it('holds across a DST boundary, because the offset is per activity', () => {
      // Europe/Madrid: CEST (+120) on 25 Oct 2026, CET (+60) the morning after the change.
      const before = toActivitySummary(
        row({ start_time: '2026-10-24T23:30:00.000Z', local_tz_offset_min: 120 }),
        noNames,
      );
      const after = toActivitySummary(
        row({ start_time: '2026-10-25T23:30:00.000Z', local_tz_offset_min: 60 }),
        noNames,
      );
      expect(before.dateLabel).toBe('25 Oct'); // 01:30 local, already the 25th
      expect(after.dateLabel).toBe('26 Oct'); // 00:30 local, the 26th — one hour less of offset
    });
  });
});

describe('dateLabels', () => {
  it('parses a plain date as local parts, so no UTC shift applies', () => {
    expect(dateLabels('2026-01-01')).toEqual({ dateLabel: '1 Jan', dayLabel: 'Thu' });
    expect(dateLabels('2026-12-31')).toEqual({ dateLabel: '31 Dec', dayLabel: 'Thu' });
  });
});

describe('listTotals', () => {
  const item = (over: Partial<ActivitySummary>): ActivitySummary =>
    ({ ...ACTIVITIES[0]!, ...over }) as ActivitySummary;

  it('sums TRIMP only — never across metrics, whose scales differ', () => {
    const totals = listTotals([
      item({ trimp: 40, tss: 999, srpe: 999, durationMin: 60 }),
      item({ trimp: 60, tss: 999, srpe: 999, durationMin: 30 }),
    ]);
    expect(totals.trimp).toBe(100);
    expect(totals.hours).toBe(1.5);
    expect(totals.count).toBe(2);
  });

  it('reports no load total at all when nothing is measured', () => {
    const totals = listTotals([item({ trimp: null, durationMin: 45 })]);
    expect(totals.trimp).toBeNull();
    expect(totals.hours).toBe(0.8);
  });

  it('totals the activities that do carry a TRIMP, ignoring those that do not', () => {
    expect(listTotals([item({ trimp: 50 }), item({ trimp: null })]).trimp).toBe(50);
  });
});
