import { moveSession, type GuardrailWeek, type WeekEdit } from '@ironflow/core/physio';
import { describe, expect, it } from 'vitest';
import { resolveWeekEdits, type MovableWorkout } from '../repositories/plans.js';

// Week of Mon 2026-08-03. dayOfWeek is JS getUTCDay(): 1=Mon … 6=Sat, 0=Sun.
const WEEK_START = '2026-08-03';
const DATE_OF: Record<number, string> = {
  1: '2026-08-03',
  2: '2026-08-04',
  3: '2026-08-05',
  4: '2026-08-06',
  5: '2026-08-07',
  6: '2026-08-08',
  0: '2026-08-09',
};

const row = (
  id: string,
  sport: MovableWorkout['sport'],
  dayOfWeek: number,
  originalDate: string | null = null,
): MovableWorkout => ({
  id,
  sport,
  scheduled_date: DATE_OF[dayOfWeek]!,
  original_scheduled_date: originalDate,
});

describe('resolveWeekEdits', () => {
  it('maps a single move onto the right row and date', () => {
    const rows = [row('run-1', 'run', 4), row('bike-1', 'bike', 5)];
    const edits: WeekEdit[] = [{ sport: 'run', fromDay: 4, toDay: 5, byEngine: false }];

    expect(resolveWeekEdits(rows, edits, WEEK_START)).toEqual([
      { id: 'run-1', scheduledDate: DATE_OF[5], originalDate: DATE_OF[4] },
    ]);
  });

  it('resolves a swap correctly — the case independent resolution gets wrong', () => {
    // run Thu→Fri, and the engine pushes the displaced bike Fri→Thu.
    const rows = [row('run-1', 'run', 4), row('bike-1', 'bike', 5)];
    const edits: WeekEdit[] = [
      { sport: 'run', fromDay: 4, toDay: 5, byEngine: false },
      { sport: 'bike', fromDay: 5, toDay: 4, byEngine: true },
    ];

    const moves = resolveWeekEdits(rows, edits, WEEK_START);
    expect(moves).toHaveLength(2);
    expect(moves.find((m) => m.id === 'run-1')?.scheduledDate).toBe(DATE_OF[5]);
    expect(moves.find((m) => m.id === 'bike-1')?.scheduledDate).toBe(DATE_OF[4]);
  });

  it('follows a session moved twice, rather than matching a stale day', () => {
    const rows = [row('run-1', 'run', 1)];
    const edits: WeekEdit[] = [
      { sport: 'run', fromDay: 1, toDay: 2, byEngine: false },
      { sport: 'run', fromDay: 2, toDay: 6, byEngine: true },
    ];

    expect(resolveWeekEdits(rows, edits, WEEK_START)).toEqual([
      { id: 'run-1', scheduledDate: DATE_OF[6], originalDate: DATE_OF[1] },
    ]);
  });

  it('omits rows that end up back where they started', () => {
    const rows = [row('run-1', 'run', 3)];
    const edits: WeekEdit[] = [
      { sport: 'run', fromDay: 3, toDay: 4, byEngine: false },
      { sport: 'run', fromDay: 4, toDay: 3, byEngine: true },
    ];

    expect(resolveWeekEdits(rows, edits, WEEK_START)).toEqual([]);
  });

  it('preserves the first original_scheduled_date across a later move', () => {
    // Already moved once: sitting on Wed, but originally scheduled for Mon.
    const rows = [row('run-1', 'run', 3, DATE_OF[1]!)];
    const edits: WeekEdit[] = [{ sport: 'run', fromDay: 3, toDay: 5, byEngine: false }];

    expect(resolveWeekEdits(rows, edits, WEEK_START)[0]).toEqual({
      id: 'run-1',
      scheduledDate: DATE_OF[5],
      originalDate: DATE_OF[1], // not Wed — the true original survives
    });
  });

  it('ignores an edit naming a sport/day with no matching row', () => {
    const rows = [row('run-1', 'run', 4)];
    const edits: WeekEdit[] = [{ sport: 'swim', fromDay: 2, toDay: 3, byEngine: false }];

    expect(resolveWeekEdits(rows, edits, WEEK_START)).toEqual([]);
  });

  it('handles Sunday (dayOfWeek 0) as the last day of a Mon-first week', () => {
    const rows = [row('run-1', 'run', 6)];
    const edits: WeekEdit[] = [{ sport: 'run', fromDay: 6, toDay: 0, byEngine: false }];

    expect(resolveWeekEdits(rows, edits, WEEK_START)[0]?.scheduledDate).toBe(DATE_OF[0]);
  });

  it('agrees with what moveSession actually produced, end to end', () => {
    const week: GuardrailWeek = {
      phase: 'build',
      isRecoveryWeek: false,
      hoursCeiling: 12,
      sessions: [
        { dayOfWeek: 2, sport: 'bike', sZone: 'S1', purpose: 'aerobic_volume', durationMin: 60, isHard: false, load: 45 },
        { dayOfWeek: 4, sport: 'run', sZone: 'S3', purpose: 'vo2max', durationMin: 60, isHard: true, load: 90 },
        { dayOfWeek: 6, sport: 'bike', sZone: 'S1', purpose: 'durability', durationMin: 180, isHard: false, load: 140 },
      ],
    };
    const rows = [row('bike-tue', 'bike', 2), row('run-thu', 'run', 4), row('bike-sat', 'bike', 6)];

    const result = moveSession(week, { fromDay: 4, toDay: 2, sport: 'run' }, { availableDays: [2, 4, 6] });
    expect(result.changed).toBe(true);

    const moves = resolveWeekEdits(rows, result.edits, WEEK_START);
    // Every row's resolved day must match where that session actually ended up.
    for (const move of moves) {
      const original = rows.find((r) => r.id === move.id)!;
      const landed = result.week.sessions.filter((s) => s.sport === original.sport);
      expect(landed.some((s) => DATE_OF[s.dayOfWeek] === move.scheduledDate)).toBe(true);
    }
  });
});
