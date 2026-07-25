import { describe, expect, it } from 'vitest';
import { ACTION_REASON, blockDay, shortenSession, skipSession, swapDays } from '../plan/actions.js';
import { isValidWeek, weekLoad } from '../plan/invariants.js';
import type { GuardrailWeek, WeekSession } from '../plan/types.js';

function s(p: Partial<WeekSession> & Pick<WeekSession, 'dayOfWeek'>): WeekSession {
  return { sport: 'run', sZone: 'S1', durationMin: 60, load: 60, isHard: false, ...p };
}

it('the fixture week is guardrail-valid to begin with', () => {
  expect(isValidWeek(week)).toBe(true);
});

/** A guardrail-valid build week: S3 under the 10% cap, hard days spaced, well under the ceiling. */
const week: GuardrailWeek = {
  phase: 'build',
  isRecoveryWeek: false,
  hoursCeiling: 12,
  sessions: [
    s({ dayOfWeek: 1, sport: 'run', durationMin: 60, load: 60 }),
    s({ dayOfWeek: 2, sport: 'bike', sZone: 'S3', durationMin: 30, load: 90, isHard: true }),
    s({ dayOfWeek: 4, sport: 'swim', durationMin: 45, load: 45 }),
    s({ dayOfWeek: 6, sport: 'bike', durationMin: 180, load: 180, isHard: true }),
  ],
};

describe('shortenSession', () => {
  it('cuts duration and load together, and states the cost', () => {
    const r = shortenSession(week, { day: 6, sport: 'bike', toMinutes: 90 });
    const cut = r.week.sessions.find((x) => x.dayOfWeek === 6)!;
    expect(cut.durationMin).toBe(90);
    expect(cut.load).toBe(90); // load scales with duration
    expect(r.loadDeltaPct).toBeLessThan(0);
    expect(r.mutation!.reasonCode).toBe(ACTION_REASON.SHORTENED);
    expect(r.message).toMatch(/less load/);
  });

  it('refuses to lengthen — growth is the planner\'s job under G1/G2', () => {
    const r = shortenSession(week, { day: 1, toMinutes: 120 });
    expect(r.changed).toBe(false);
    expect(r.mutation).toBeUndefined();
  });

  it('is a no-op when there is no such session', () => {
    expect(shortenSession(week, { day: 3, toMinutes: 20 }).changed).toBe(false);
    expect(shortenSession(week, { day: 1, sport: 'swim', toMinutes: 20 }).changed).toBe(false);
  });

  it('clamps a negative target to zero', () => {
    const r = shortenSession(week, { day: 1, toMinutes: -30 });
    expect(r.week.sessions.find((x) => x.dayOfWeek === 1)!.durationMin).toBe(0);
  });
});

describe('skipSession', () => {
  it('drops the session and names the load given up', () => {
    const before = weekLoad(week.sessions);
    const r = skipSession(week, { day: 2, sport: 'bike' });
    expect(r.week.sessions).toHaveLength(3);
    expect(weekLoad(r.week.sessions)).toBe(before - 90);
    expect(r.loadDeltaPct).toBeLessThan(0);
    expect(r.mutation!.reasonCode).toBe(ACTION_REASON.SKIPPED);
    expect(r.message).toMatch(/key session/); // it was hard — say what quality was lost
  });

  it('frames an easy session differently from a key one', () => {
    expect(skipSession(week, { day: 1 }).message).toMatch(/Aerobic volume/);
  });

  it('is a no-op when there is no such session', () => {
    expect(skipSession(week, { day: 3 }).changed).toBe(false);
  });

  it('reports 0% rather than dividing by zero when the week carried no load', () => {
    const zero: GuardrailWeek = { ...week, sessions: [s({ dayOfWeek: 1, durationMin: 30, load: 0 })] };
    expect(skipSession(zero, { day: 1 }).loadDeltaPct).toBe(0);
  });
});

describe('swapDays', () => {
  it('exchanges two days without changing the week load', () => {
    const r = swapDays(week, { dayA: 1, dayB: 4 });
    expect(r.changed).toBe(true);
    expect(r.loadDeltaPct).toBe(0);
    expect(weekLoad(r.week.sessions)).toBe(weekLoad(week.sessions));
    expect(r.week.sessions.find((x) => x.sport === 'run')!.dayOfWeek).toBe(4);
    expect(r.week.sessions.find((x) => x.sport === 'swim')!.dayOfWeek).toBe(1);
    expect(r.mutation!.reasonCode).toBe(ACTION_REASON.SWAPPED);
  });

  it('works when only one of the two days has sessions', () => {
    const r = swapDays(week, { dayA: 2, dayB: 3 }); // Wednesday is empty
    expect(r.week.sessions.find((x) => x.sport === 'bike' && x.sZone === 'S3')!.dayOfWeek).toBe(3);
  });

  it('reports a breach rather than hiding it', () => {
    // Put the two hard days adjacent to an existing hard day → 3 in a row (G5).
    const tight: GuardrailWeek = {
      ...week,
      sessions: [
        s({ dayOfWeek: 1, sZone: 'S3', isHard: true, durationMin: 30, load: 90 }),
        s({ dayOfWeek: 2, sZone: 'S3', isHard: true, durationMin: 30, load: 90 }),
        s({ dayOfWeek: 4, sZone: 'S3', isHard: true, durationMin: 30, load: 90 }),
      ],
    };
    const r = swapDays(tight, { dayA: 4, dayB: 3 }); // → Mon, Tue, Wed all hard
    expect(r.remainingViolations.some((v) => v.code === 'G5_CONSECUTIVE_HARD_DAYS')).toBe(true);
    expect(r.message).toMatch(/safety limits/);
  });

  it('is a no-op for the same day, or two empty days', () => {
    expect(swapDays(week, { dayA: 3, dayB: 3 }).changed).toBe(false);
    expect(swapDays(week, { dayA: 3, dayB: 5 }).changed).toBe(false);
  });
});

describe('blockDay', () => {
  it('relocates what it can and keeps the week valid', () => {
    const r = blockDay(week, 4, { availableDays: [0, 1, 2, 3, 4, 5, 6] }); // block the swim day
    expect(r.changed).toBe(true);
    expect(r.relocated).toHaveLength(1);
    expect(r.dropped).toEqual([]);
    expect(r.week.sessions.some((x) => x.dayOfWeek === 4)).toBe(false);
    expect(r.week.sessions).toHaveLength(4); // nothing lost
    expect(r.loadDeltaPct).toBe(0);
    expect(isValidWeek(r.week)).toBe(true);
    expect(r.mutation!.reasonCode).toBe(ACTION_REASON.DAY_BLOCKED);
    expect(r.message).toMatch(/blocked out/);
  });

  it('drops only what genuinely will not fit, and says so', () => {
    // No other day is available, so the session has nowhere legal to land.
    const r = blockDay(week, 4, { availableDays: [4] });
    expect(r.dropped).toEqual(['swim']);
    expect(r.relocated).toEqual([]);
    expect(r.loadDeltaPct).toBeLessThan(0);
    expect(r.mutation!.reasonCode).toBe(ACTION_REASON.DAY_BLOCKED_PARTIAL);
    expect(r.message).toMatch(/nowhere safe/);
  });

  it('is a no-op on an already-empty day', () => {
    const r = blockDay(week, 3);
    expect(r.changed).toBe(false);
    expect(r.relocated).toEqual([]);
    expect(r.dropped).toEqual([]);
  });
});
