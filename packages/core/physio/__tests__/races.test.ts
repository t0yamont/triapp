import { describe, expect, it } from 'vitest';
import { resolveRaceCalendar, type RaceEntry } from '../plan/races.js';

const race = (over: Partial<RaceEntry> & Pick<RaceEntry, 'id' | 'date' | 'priority'>): RaceEntry => ({
  eventType: 'olympic_tri',
  ...over,
});

describe('Race calendar resolution (§9)', () => {
  it('the A race owns the phase structure and gets its full taper', () => {
    const c = resolveRaceCalendar([race({ id: 'a', date: '2026-11-27', priority: 'A', eventType: 'ironman' })]);
    expect(c.primary!.id).toBe('a');
    expect(c.primary!.treatment).toBe('drives_macrocycle');
    expect(c.primary!.taperDays).toBe(18); // ironman
    expect(c.warnings).toEqual([]);
  });

  it('sorts by date regardless of input order', () => {
    const c = resolveRaceCalendar([
      race({ id: 'late', date: '2026-11-27', priority: 'C' }),
      race({ id: 'early', date: '2026-08-14', priority: 'C' }),
    ]);
    expect(c.races.map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('a B race takes a local taper and rejoins the plan afterwards', () => {
    const c = resolveRaceCalendar([race({ id: 'b', date: '2026-09-11', priority: 'B' })]);
    const b = c.races[0]!;
    expect(b.treatment).toBe('local_peak');
    expect(b.taperDays).toBe(10); // olympic
    expect(b.note).toMatch(/peak fitness target is unchanged/);
    expect(c.primary).toBeUndefined(); // no A race in this calendar
  });

  it('a C race is trained through, with the two surrounding days eased', () => {
    const c = resolveRaceCalendar([race({ id: 'c', date: '2026-08-14', priority: 'C', eventType: '10k' })]);
    const only = c.races[0]!;
    expect(only.treatment).toBe('trained_through');
    expect(only.taperDays).toBe(0);
    expect(only.reducedSurroundingDays).toBe(2);
  });

  it('demotes a second A race inside 12 weeks, and says why', () => {
    const c = resolveRaceCalendar([
      race({ id: 'a1', date: '2026-08-01', priority: 'A', eventType: 'ironman' }),
      race({ id: 'a2', date: '2026-09-26', priority: 'A', eventType: 'ironman' }), // 8 weeks later
    ]);
    expect(c.races[0]!.effectivePriority).toBe('A');
    expect(c.races[1]!.effectivePriority).toBe('B');
    expect(c.races[1]!.treatment).toBe('local_peak');
    expect(c.races[1]!.note).toMatch(/planned as a B race/);
    expect(c.warnings[0]!.code).toBe('A_RACES_TOO_CLOSE');
    expect(c.warnings[0]!.message).toMatch(/8 weeks apart/);
    expect(c.primary!.id).toBe('a1'); // the first still owns the macrocycle
  });

  it('keeps both A races when they are far enough apart', () => {
    const c = resolveRaceCalendar([
      race({ id: 'a1', date: '2026-05-01', priority: 'A', eventType: 'ironman' }),
      race({ id: 'a2', date: '2026-11-27', priority: 'A', eventType: 'ironman' }),
    ]);
    expect(c.races.every((r) => r.effectivePriority === 'A')).toBe(true);
    expect(c.warnings).toEqual([]);
  });

  it('derives the G9 recovery block from the expected finish time, min 2 days', () => {
    const c = resolveRaceCalendar([
      race({ id: 'long', date: '2026-11-27', priority: 'A', eventType: 'ironman', expectedDurationH: 11.5 }),
      race({ id: 'short', date: '2027-03-01', priority: 'C', eventType: '10k', expectedDurationH: 0.75 }),
    ]);
    expect(c.races[0]!.recoveryDays).toBe(12); // ceil(11.5)
    expect(c.races[1]!.recoveryDays).toBe(2); // floor of 2 days
  });

  it('leaves recovery undefined until an expected finish time is known', () => {
    expect(resolveRaceCalendar([race({ id: 'x', date: '2026-11-27', priority: 'A' })]).races[0]!.recoveryDays).toBeUndefined();
  });

  it('returns an empty calendar for no races', () => {
    expect(resolveRaceCalendar([])).toEqual({ races: [], warnings: [] });
  });
});
