import { describe, expect, it } from 'vitest';
import {
  decisionsForWorkout,
  fromPlanMutationRow,
  groupDecisionsByLocalDay,
  type PlanDecision,
} from '../repositories/decisions.js';
import { isSameLocalDay, localDayISO } from '../time.js';

const decision = (over: Partial<PlanDecision> = {}): PlanDecision => ({
  id: 1,
  occurredAt: '2026-07-27T06:15:00.000Z',
  actor: 'engine',
  reasonCode: 'READINESS_2DAY_LOW',
  reasonText: 'Two low-readiness mornings, so today’s intervals became an easy run.',
  ruleId: '10.2.R3',
  affectedWorkoutIds: ['w-thursday'],
  engineInputs: { hrvZ: -1.4, sleepH: 5.2 },
  before: { goal_zone: 'S3' },
  after: { goal_zone: 'S1' },
  ...over,
});

describe('fromPlanMutationRow', () => {
  it('maps a row, defaulting the affected ids to an empty list', () => {
    const mapped = fromPlanMutationRow({
      id: 7,
      occurred_at: '2026-07-27T06:15:00.000Z',
      actor: 'engine',
      reason_code: 'REPLAN_LOAD_SHORTFALL',
      reason_text: 'You missed two sessions, so next week starts lower.',
      rule_id: null,
      affected_workout_ids: null,
      engine_inputs: null,
      before: null,
      after: null,
    });
    expect(mapped.affectedWorkoutIds).toEqual([]);
    expect(mapped).toMatchObject({ id: 7, actor: 'engine', ruleId: null });
  });

  // The reason *code* is the stable one. Copy can be rewritten; a code cannot, or every previous
  // explanation in the log silently changes meaning.
  it('keeps the machine-readable code alongside the athlete-facing sentence', () => {
    const mapped = fromPlanMutationRow({
      id: 1,
      occurred_at: '2026-07-27T06:15:00.000Z',
      actor: 'athlete',
      reason_code: 'ATHLETE_SKIPPED',
      reason_text: 'You skipped it.',
      rule_id: '10.4',
      affected_workout_ids: ['a'],
      engine_inputs: { source: 'ui' },
      before: null,
      after: null,
    });
    expect(mapped.reasonCode).toBe('ATHLETE_SKIPPED');
    expect(mapped.reasonText).toBe('You skipped it.');
    expect(mapped.engineInputs).toEqual({ source: 'ui' });
  });
});

describe('decisionsForWorkout', () => {
  it('answers "why did my Thursday change" for one session', () => {
    const log = [
      decision({ id: 1, affectedWorkoutIds: ['w-thursday'] }),
      decision({ id: 2, affectedWorkoutIds: ['w-saturday', 'w-sunday'] }),
      decision({ id: 3, affectedWorkoutIds: ['w-thursday', 'w-friday'] }),
    ];
    expect(decisionsForWorkout(log, 'w-thursday').map((d) => d.id)).toEqual([1, 3]);
  });

  it('is empty for a session nothing touched, rather than guessing', () => {
    expect(decisionsForWorkout([decision()], 'w-never')).toEqual([]);
  });
});

describe('groupDecisionsByLocalDay', () => {
  it('files a decision under the day the athlete lived, not the day UTC had', () => {
    // 23:30 Tuesday in Auckland is 11:30 Monday UTC. Grouping on the raw instant puts the
    // explanation under the wrong heading — exactly where an explanation stops reassuring.
    const days = groupDecisionsByLocalDay([decision({ occurredAt: '2026-07-27T11:30:00.000Z' })], 'Pacific/Auckland');
    expect(days[0]!.date).toBe('2026-07-27');
    expect(groupDecisionsByLocalDay([decision({ occurredAt: '2026-07-27T11:30:00.000Z' })], 'UTC')[0]!.date).toBe(
      '2026-07-27',
    );
    // …and 23:30 UTC on the 27th is already the 28th in Auckland.
    expect(groupDecisionsByLocalDay([decision({ occurredAt: '2026-07-27T23:30:00.000Z' })], 'Pacific/Auckland')[0]!.date).toBe(
      '2026-07-28',
    );
  });

  it('groups and orders newest day first', () => {
    const days = groupDecisionsByLocalDay(
      [
        decision({ id: 1, occurredAt: '2026-07-25T09:00:00.000Z' }),
        decision({ id: 2, occurredAt: '2026-07-27T09:00:00.000Z' }),
        decision({ id: 3, occurredAt: '2026-07-27T18:00:00.000Z' }),
      ],
      'Europe/London',
    );
    expect(days.map((d) => d.date)).toEqual(['2026-07-27', '2026-07-25']);
    expect(days[0]!.decisions.map((d) => d.id)).toEqual([2, 3]);
  });

  it('handles an empty log', () => {
    expect(groupDecisionsByLocalDay([], 'Europe/London')).toEqual([]);
  });
});

// CLAUDE.md hard rule 8 asks for a test across a DST boundary specifically.
describe('localDayISO across DST', () => {
  it('holds through the spring forward in Europe/London', () => {
    // 2026-03-29 01:00 UTC is when London jumps to BST.
    expect(localDayISO('2026-03-28T23:30:00.000Z', 'Europe/London')).toBe('2026-03-28');
    expect(localDayISO('2026-03-29T00:30:00.000Z', 'Europe/London')).toBe('2026-03-29');
    // 23:30 UTC is already the next day in BST — the shift a naive `slice(0, 10)` would miss.
    expect(localDayISO('2026-03-29T23:30:00.000Z', 'Europe/London')).toBe('2026-03-30');
  });

  it('holds through the autumn fall back in Europe/London', () => {
    // 2026-10-25 02:00 UTC, BST → GMT. 23:30 UTC is the 25th before and after.
    expect(localDayISO('2026-10-24T23:30:00.000Z', 'Europe/London')).toBe('2026-10-25');
    expect(localDayISO('2026-10-25T23:30:00.000Z', 'Europe/London')).toBe('2026-10-25');
  });

  it('holds for a zone that never observes DST', () => {
    expect(localDayISO('2026-03-29T23:30:00.000Z', 'Asia/Tokyo')).toBe('2026-03-30');
  });

  it('isSameLocalDay follows the zone, not UTC', () => {
    expect(isSameLocalDay('2026-07-27T23:30:00.000Z', '2026-07-28T00:30:00.000Z', 'UTC')).toBe(false);
    expect(isSameLocalDay('2026-07-27T23:30:00.000Z', '2026-07-28T00:30:00.000Z', 'Pacific/Auckland')).toBe(true);
  });

  it('surfaces a corrupt timezone rather than silently answering in UTC', () => {
    expect(() => localDayISO('2026-07-27T12:00:00.000Z', 'Mars/Olympus_Mons')).toThrow();
  });
});
