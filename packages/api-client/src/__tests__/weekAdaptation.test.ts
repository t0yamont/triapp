import { describe, expect, it } from 'vitest';
import { planWeekAdaptation, type WeekAdaptationTarget } from '../repositories/wellness.js';

const TODAY = '2026-07-27';

const session = (over: Partial<WeekAdaptationTarget> & Pick<WeekAdaptationTarget, 'id' | 'scheduledDate'>): WeekAdaptationTarget => ({
  goalZone: 'S1',
  plannedDurationMin: 60,
  plannedLoad: 100,
  ...over,
});

describe('planWeekAdaptation', () => {
  // The gap this closes: easing today and leaving Wednesday and Thursday untouched, when the
  // rule fired precisely because one session is not an answer to a two-day pattern.
  it('scales the rest of the week down by the delta', () => {
    const changes = planWeekAdaptation(
      [session({ id: 'wed', scheduledDate: '2026-07-29' }), session({ id: 'thu', scheduledDate: '2026-07-30' })],
      { weekLoadDeltaPct: -38, suppressS3Days: 0 },
      TODAY,
    );
    expect(changes).toEqual([
      { id: 'wed', goalZone: 'S1', plannedDurationMin: 37, plannedLoad: 62 },
      { id: 'thu', goalZone: 'S1', plannedDurationMin: 37, plannedLoad: 62 },
    ]);
  });

  it('suppresses S3 inside the window and leaves it beyond', () => {
    const changes = planWeekAdaptation(
      [
        session({ id: 'soon', scheduledDate: '2026-07-28', goalZone: 'S3' }),
        session({ id: 'later', scheduledDate: '2026-07-31', goalZone: 'S3' }),
      ],
      { weekLoadDeltaPct: 0, suppressS3Days: 2 },
      TODAY,
    );
    expect(changes).toEqual([{ id: 'soon', goalZone: 'S2', plannedDurationMin: 60, plannedLoad: 100 }]);
  });

  // I12/I14: a readiness response may only ever reduce. A positive delta upstream would be a
  // bug, and it must not be able to turn into an *increase* in someone's week.
  it('never raises load, even given a positive delta', () => {
    const changes = planWeekAdaptation([session({ id: 'wed', scheduledDate: '2026-07-29' })], { weekLoadDeltaPct: 25, suppressS3Days: 0 }, TODAY);
    expect(changes).toEqual([]);
  });

  it('never raises a zone', () => {
    const changes = planWeekAdaptation(
      [session({ id: 'wed', scheduledDate: '2026-07-29', goalZone: 'S1' })],
      { weekLoadDeltaPct: 0, suppressS3Days: 7 },
      TODAY,
    );
    expect(changes).toEqual([]);
  });

  // An unchanged session must not collect a write, a new `updated_at`, or a device republish.
  it('returns nothing when nothing would change', () => {
    expect(planWeekAdaptation([session({ id: 'a', scheduledDate: '2026-07-29' })], { weekLoadDeltaPct: 0, suppressS3Days: 0 }, TODAY)).toEqual([]);
  });

  it('applies both halves to the same session', () => {
    const changes = planWeekAdaptation(
      [session({ id: 'wed', scheduledDate: '2026-07-28', goalZone: 'S3' })],
      { weekLoadDeltaPct: -20, suppressS3Days: 3 },
      TODAY,
    );
    expect(changes).toEqual([{ id: 'wed', goalZone: 'S2', plannedDurationMin: 48, plannedLoad: 80 }]);
  });

  it('leaves an empty week alone', () => {
    expect(planWeekAdaptation([], { weekLoadDeltaPct: -38, suppressS3Days: 2 }, TODAY)).toEqual([]);
  });
});
