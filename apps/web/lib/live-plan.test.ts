import type { Tables } from '@ironflow/api-client';
import { buildAthleteModel, buildZones, type ZoneSet } from '@ironflow/core/physio';
import { renderSession } from '@ironflow/core/physio';
import { describe, expect, it } from 'vitest';
import { toPlannedSession, toSessionIntervals } from './live-plan';

const NOW = '2026-07-26T07:00:00.000Z';
const { model } = buildAthleteModel({
  hrMax: { athleteReported: { value: 190, measuredAt: NOW }, now: NOW },
  hrRest: { morningReadings: [50], now: NOW },
  now: NOW,
})!;
const zoneSet: ZoneSet = buildZones(model, 'run');

const row = (over: Partial<Tables<'workouts'>> = {}): Tables<'workouts'> =>
  ({
    id: 'w-1',
    plan_id: 'p-1',
    plan_week_id: 'pw-1',
    athlete_id: 'ath-1',
    scheduled_date: '2026-07-26',
    sport: 'run',
    template_id: 'run-aerobic',
    name: 'Run — aerobic',
    description: null,
    purpose: 'aerobic_volume',
    goal_zone: 'S1',
    is_key_session: false,
    planned_duration_min: 45,
    planned_load: 40,
    structure: { kind: 'steady', durationMin: 45, goalZone: 'S1' },
    status: 'scheduled',
    completed_activity_id: null,
    original_scheduled_date: null,
    original_load: null,
    pushed_to_device_at: null,
    device_workout_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  }) as Tables<'workouts'>;

describe('toPlannedSession', () => {
  it('renders the athlete’s own workout, not a sample', () => {
    const s = toPlannedSession(row({ name: 'Long run', planned_duration_min: 95 }), zoneSet)!;
    expect(s.name).toBe('Long run');
    expect(s.durationMin).toBe(95);
    expect(s.sport).toBe('run');
    expect(s.plannedZone).toBe('S1');
  });

  it('derives heart-rate targets from the athlete’s persisted zones', () => {
    const s = toPlannedSession(row(), zoneSet)!;
    // S1 spans Z1+Z2, so the range runs from the Z1 floor to the Z2 ceiling.
    const z1 = zoneSet.zones.find((z) => z.id === 'Z1')!;
    const z2 = zoneSet.zones.find((z) => z.id === 'Z2')!;
    const hr = s.targetRows.find((t) => t.label === 'Heart rate')!;
    expect(hr.value).toBe(`${Math.round(z1.lower.bpm)}–${Math.round(z2.upper.bpm)} bpm`);
    expect(s.targetsConfidence).toBe(zoneSet.anchorConfidence);
  });

  // §14/F15: RPE needs no sensor, so it is always prescribed alongside whatever else exists.
  it('always prescribes effort as well as heart rate', () => {
    const s = toPlannedSession(row(), zoneSet)!;
    expect(s.targetRows.find((t) => t.label === 'Effort')!.value).toBe('RPE 2–4 of 10');
  });

  it('uses the S3 bands for a hard session, in both modalities', () => {
    const s = toPlannedSession(row({ goal_zone: 'S3', is_key_session: true }), zoneSet)!;
    const z5 = zoneSet.zones.find((z) => z.id === 'Z5')!;
    expect(s.targetRows.find((t) => t.label === 'Heart rate')!.value).toContain(
      `${Math.round(z5.lower.bpm)}–`,
    );
    expect(s.targetRows.find((t) => t.label === 'Effort')!.value).toBe('RPE 8–10 of 10');
    expect(s.targetRows.every((t) => t.zone === 'S3')).toBe(true);
  });

  // Previously this asserted "duration only, no targets". §14 is better than that: an athlete
  // with no HR anchors still gets a real prescription, because RPE needs no sensor (F15).
  it('falls back to effort alone when there are no zones — never a null target', () => {
    const s = toPlannedSession(row(), null)!;
    expect(s.targetRows.some((t) => t.label === 'Heart rate')).toBe(false);
    expect(s.targetRows.find((t) => t.label === 'Effort')!.value).toBe('RPE 2–4 of 10');
    expect(s.targetsConfidence).toBe(0); // §2.4: no anchor, no confidence
    expect(s.targetsNote).toMatch(/go by effort/i);
  });

  it('prescribes a swim by stroke count and effort (§14)', () => {
    const s = toPlannedSession(row({ sport: 'swim' }), zoneSet)!;
    expect(s.targetRows.map((t) => t.label)).toEqual(['Stroke count', 'Effort']);
  });

  it('draws the real interval silhouette from the stored structure', () => {
    const structure = renderSession({ sport: 'run', purpose: 'vo2max', goalZone: 'S3', durationMin: 40 });
    const s = toPlannedSession(
      row({ goal_zone: 'S3', is_key_session: true, planned_duration_min: 40, structure: structure as never }),
      zoneSet,
    )!;
    // Warm-up, then alternating work/recovery, then cool-down — not one flat block.
    expect(s.intervals.length).toBeGreaterThan(2);
    expect(s.intervals.some((iv) => iv.zone === 'S3')).toBe(true);
    expect(s.intervals.reduce((a, iv) => a + iv.minutes, 0)).toBe(40);
  });

  // A plan written before §7 was wired stored `{ kind: 'steady' }` with no steps.
  it('falls back to one block for a pre-§7 placeholder structure, rather than rendering nothing', () => {
    const s = toPlannedSession(row({ structure: { kind: 'steady', durationMin: 45, goalZone: 'S1' } as never }), zoneSet)!;
    expect(s.intervals).toEqual([{ minutes: 45, zone: 'S1' }]);
  });

  it('explains the session from its purpose when there is no description', () => {
    expect(toPlannedSession(row({ purpose: 'recovery' }), zoneSet)!.why).toMatch(/deliberately easy/i);
    expect(toPlannedSession(row({ description: 'Hill reps on the usual loop.' }), zoneSet)!.why).toBe(
      'Hill reps on the usual loop.',
    );
  });

  it('renders a brick as a run — the run leg is the one being prescribed', () => {
    expect(toPlannedSession(row({ sport: 'brick' }), zoneSet)!.sport).toBe('run');
  });

  it('returns null for a sport with no prescription view', () => {
    expect(toPlannedSession(row({ sport: 'other' }), zoneSet)).toBeNull();
  });
});

describe('toSessionIntervals', () => {
  it('expands repeats and merges adjacent same-zone blocks into a readable shape', () => {
    // Bike VO₂ is 3×13×(30/15) — 78 raw slivers, which is noise, not a silhouette.
    const bike = renderSession({ sport: 'bike', purpose: 'vo2max', goalZone: 'S3', durationMin: 60 });
    const blocks = toSessionIntervals(bike)!;
    expect(blocks.length).toBeLessThan(20);
    expect(blocks.some((b) => b.zone === 'S3')).toBe(true);
  });

  it('shows the durability session rising into S2 at the end', () => {
    const long = renderSession({ sport: 'bike', purpose: 'durability', goalZone: 'S1', durationMin: 180 });
    const blocks = toSessionIntervals(long)!;
    expect(blocks[0]!.zone).toBe('S1');
    expect(blocks[blocks.length - 1]!.zone).toBe('S2');
  });

  it('returns null for anything that is not a structure', () => {
    expect(toSessionIntervals({ kind: 'steady', durationMin: 45 })).toBeNull();
    expect(toSessionIntervals(null)).toBeNull();
    expect(toSessionIntervals({ steps: [] })).toBeNull();
  });
});

describe('the silhouette never lies about total time', () => {
  it('blocks sum to the session duration for every rendered session', () => {
    for (const durationMin of [20, 40, 45, 60, 90, 180]) {
      for (const sport of ['run', 'bike', 'swim'] as const) {
        for (const purpose of ['vo2max', 'aerobic_volume', 'durability', 'recovery'] as const) {
          const structure = renderSession({
            sport,
            purpose,
            goalZone: purpose === 'vo2max' ? 'S3' : 'S1',
            durationMin,
          });
          const blocks = toSessionIntervals(structure)!;
          expect(blocks.reduce((a, b) => a + b.minutes, 0)).toBe(durationMin);
        }
      }
    }
  });
});
