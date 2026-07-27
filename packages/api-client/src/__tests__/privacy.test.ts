import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL_PERSONAL_DATA_TABLES,
  assertExportCoversSchema,
  countAthleteRows,
  deleteAthleteData,
  exportAthleteData,
  isExportComplete,
} from '../repositories/privacy.js';
import type { TriflowClient } from '../client.js';

// ── A fake Postgres, just big enough ─────────────────────────────────────────
// The point of these tests is the *policy* — which tables are read, in what order, and whether
// the delete can be proven — so the fake models only what the policy depends on: filters, counts,
// and the FK cascade. `noCascade` lets a test stage the failure that erasure verification exists
// to catch.

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}

interface FakeOpts {
  /** table → message: this read fails. */
  failReads?: Record<string, string>;
  deleteError?: string;
  /** Tables whose foreign key "forgot" to cascade. */
  noCascade?: string[];
}

class Query implements PromiseLike<QueryResult> {
  private readonly filters: ((r: Row) => boolean)[] = [];

  constructor(
    private readonly rows: Row[],
    private readonly head: boolean,
    private readonly failMessage: string | undefined,
  ) {}

  eq(column: string, value: unknown): Query {
    this.filters.push((r) => r[column] === value);
    return this;
  }

  in(column: string, values: readonly unknown[]): Query {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }

  then<A = QueryResult, B = never>(
    onfulfilled?: ((v: QueryResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const matched = this.rows.filter((r) => this.filters.every((f) => f(r)));
    const result: QueryResult = this.failMessage
      ? { data: null, error: { message: this.failMessage }, count: null }
      : { data: this.head ? null : matched, error: null, count: matched.length };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function cascadeDelete(db: Db, athleteId: string, noCascade: string[]): void {
  const idsOwnedBy = (table: string) =>
    (db[table] ?? []).filter((r) => r['athlete_id'] === athleteId).map((r) => r['id']);
  const activityIds = idsOwnedBy('activities');
  const planIds = idsOwnedBy('training_plans');

  for (const [table, rows] of Object.entries(db)) {
    if (noCascade.includes(table)) continue;
    db[table] = rows.filter((r) => {
      if (table === 'profiles') return r['id'] !== athleteId;
      if (r['athlete_id'] === athleteId || r['coach_id'] === athleteId) return false;
      if (r['activity_id'] !== undefined && activityIds.includes(r['activity_id'])) return false;
      if (r['plan_id'] !== undefined && planIds.includes(r['plan_id'])) return false;
      return true;
    });
  }
}

function fakeClient(db: Db, opts: FakeOpts = {}): TriflowClient {
  return {
    from(table: string) {
      return {
        select: (_columns: string, selectOpts?: { head?: boolean }) =>
          new Query(db[table] ?? [], selectOpts?.head === true, opts.failReads?.[table]),
        delete: () => ({
          eq: (_column: string, value: unknown) => {
            if (opts.deleteError) return Promise.resolve({ error: { message: opts.deleteError } });
            cascadeDelete(db, value as string, opts.noCascade ?? []);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  } as unknown as TriflowClient;
}

const ATHLETE = 'athlete-1';
const COACH = 'coach-9';

const seed = (): Db => ({
  profiles: [{ id: ATHLETE, display_name: 'Ada' }, { id: COACH, display_name: 'Coach' }],
  activities: [
    { id: 'act-1', athlete_id: ATHLETE, sport: 'run' },
    { id: 'act-2', athlete_id: ATHLETE, sport: 'bike' },
    { id: 'act-other', athlete_id: 'someone-else', sport: 'run' },
  ],
  activity_streams: [
    { activity_id: 'act-1', hr: [120, 130] },
    { activity_id: 'act-other', hr: [99] },
  ],
  activity_laps: [{ id: 'lap-1', activity_id: 'act-1', lap_index: 0 }],
  activity_sources: [{ activity_id: 'act-2', provider: 'garmin' }],
  training_plans: [{ id: 'plan-1', athlete_id: ATHLETE }],
  plan_weeks: [
    { id: 'week-1', plan_id: 'plan-1', week_number: 1 },
    { id: 'week-x', plan_id: 'plan-other', week_number: 1 },
  ],
  workouts: [{ id: 'w-1', athlete_id: ATHLETE, plan_id: 'plan-1' }],
  daily_metrics: [{ id: 'dm-1', athlete_id: ATHLETE, date: '2026-07-27' }],
  integrations: [
    {
      id: 'int-1',
      athlete_id: ATHLETE,
      provider: 'garmin',
      access_token_ref: 'vault:garmin-access',
      refresh_token_ref: 'vault:garmin-refresh',
      revoked_at: null,
    },
    {
      id: 'int-2',
      athlete_id: ATHLETE,
      provider: 'strava',
      access_token_ref: 'vault:strava-access',
      refresh_token_ref: null,
      revoked_at: '2026-05-01T00:00:00.000Z',
    },
  ],
  coach_athlete_relationships: [{ id: 'rel-1', coach_id: COACH, athlete_id: ATHLETE, status: 'active' }],
});

const NOW = '2026-07-27T10:00:00.000Z';

// ── The completeness guard ───────────────────────────────────────────────────

describe('assertExportCoversSchema', () => {
  const migrationsDir = fileURLToPath(new URL('../../../../supabase/migrations', import.meta.url));

  const schemaTables = (): string[] => {
    const names = new Set<string>();
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(`${migrationsDir}/${file}`, 'utf8');
      for (const m of sql.matchAll(/^create table (?:if not exists )?(?:public\.)?(\w+)/gm)) names.add(m[1]!);
    }
    return [...names];
  };

  // This is the test that matters. A migration adding a table that holds athlete data, without a
  // matching entry here, produces an export that looks complete and is not — which is a reportable
  // breach rather than a bug. Reading the real migrations means the guard cannot go stale.
  it('the export covers every table in the migrations', () => {
    const tables = schemaTables();
    expect(tables.length).toBeGreaterThan(15); // the parse actually found something
    expect(() => assertExportCoversSchema(tables)).not.toThrow();
  });

  it('names a new table the export would miss', () => {
    expect(() => assertExportCoversSchema([...ALL_PERSONAL_DATA_TABLES, 'nutrition_logs'])).toThrow(/nutrition_logs/);
  });

  it('names a table that was listed but has since been renamed away', () => {
    expect(() => assertExportCoversSchema(ALL_PERSONAL_DATA_TABLES.filter((t) => t !== 'races'))).toThrow(
      /listed but not in the schema: races/,
    );
  });
});

// ── Right of access ──────────────────────────────────────────────────────────

describe('exportAthleteData', () => {
  it('returns every personal-data table, present even when empty', async () => {
    const out = await exportAthleteData(fakeClient(seed()), ATHLETE, NOW);
    for (const table of ALL_PERSONAL_DATA_TABLES) expect(out.tables).toHaveProperty(table);
    expect(out.exportedAt).toBe(NOW);
    expect(isExportComplete(out)).toBe(true);
  });

  it('returns only this athlete, never anyone else', async () => {
    const out = await exportAthleteData(fakeClient(seed()), ATHLETE, NOW);
    expect(out.tables['profiles']).toEqual([{ id: ATHLETE, display_name: 'Ada' }]);
    expect((out.tables['activities'] as { id: string }[]).map((a) => a.id)).toEqual(['act-1', 'act-2']);
  });

  it('reaches child rows through their parents', async () => {
    const out = await exportAthleteData(fakeClient(seed()), ATHLETE, NOW);
    // Children carry no athlete_id, so a naive export loses them entirely.
    expect(out.tables['activity_streams']).toHaveLength(1);
    expect(out.tables['activity_laps']).toHaveLength(1);
    expect(out.tables['activity_sources']).toHaveLength(1);
    expect((out.tables['plan_weeks'] as { id: string }[]).map((w) => w.id)).toEqual(['week-1']);
  });

  it('includes a coach-side relationship row, deduped', async () => {
    // Keyed only on athlete_id, a coach's export of this table would be empty and look correct.
    const coach = await exportAthleteData(fakeClient(seed()), COACH, NOW);
    expect(coach.tables['coach_athlete_relationships']).toHaveLength(1);

    // The athlete sees the same row once, not twice.
    const athlete = await exportAthleteData(fakeClient(seed()), ATHLETE, NOW);
    expect(athlete.tables['coach_athlete_relationships']).toHaveLength(1);
  });

  it('skips streams on request but keeps the other children', async () => {
    const out = await exportAthleteData(fakeClient(seed()), ATHLETE, NOW, { includeStreams: false });
    expect(out.tables['activity_streams']).toEqual([]);
    expect(out.tables['activity_laps']).toHaveLength(1);
  });

  it('skips child queries when there is no parent to hang them off', async () => {
    const empty: Db = { profiles: [{ id: ATHLETE }] };
    const out = await exportAthleteData(fakeClient(empty), ATHLETE, NOW);
    expect(out.tables['plan_weeks']).toEqual([]);
    expect(isExportComplete(out)).toBe(true);
  });

  it('marks the export incomplete when a table fails to read', async () => {
    const out = await exportAthleteData(fakeClient(seed(), { failReads: { races: 'permission denied' } }), ATHLETE, NOW);
    expect(out.errors).toEqual([{ table: 'races', message: 'permission denied' }]);
    expect(isExportComplete(out)).toBe(false);
    // The rest still comes back — a partial export is useful to debug, just not shippable.
    expect(out.tables['activities']).toHaveLength(2);
  });

  it('reports a failure on the second-owner read too', async () => {
    const out = await exportAthleteData(
      fakeClient(seed(), { failReads: { coach_athlete_relationships: 'nope' } }),
      ATHLETE,
      NOW,
    );
    expect(out.errors.filter((e) => e.table === 'coach_athlete_relationships')).toHaveLength(2);
  });
});

// ── Right to erasure ─────────────────────────────────────────────────────────

describe('countAthleteRows', () => {
  it('counts what is held before anything is deleted', async () => {
    const counts = await countAthleteRows(fakeClient(seed()), ATHLETE);
    expect(counts['profiles']).toBe(1);
    expect(counts['activities']).toBe(2);
    expect(counts['integrations']).toBe(2);
    expect(counts['athlete_zones']).toBe(0);
  });

  it('counts a coach by their own key as well', async () => {
    const counts = await countAthleteRows(fakeClient(seed()), COACH);
    expect(counts['coach_athlete_relationships']).toBe(1);
  });
});

describe('deleteAthleteData', () => {
  it('erases everything and proves it', async () => {
    const db = seed();
    const result = await deleteAthleteData(fakeClient(db), ATHLETE);

    expect(result.verified).toBe(true);
    expect(Object.values(result.remaining).every((n) => n === 0)).toBe(true);
    // Cascade reached the children, which no count covers directly.
    expect(db['activity_streams']).toEqual([{ activity_id: 'act-other', hr: [99] }]);
    expect(db['plan_weeks']).toEqual([{ id: 'week-x', plan_id: 'plan-other', week_number: 1 }]);
    // Nobody else was touched.
    expect(db['profiles']).toEqual([{ id: COACH, display_name: 'Coach' }]);
    expect(db['activities']).toHaveLength(1);
  });

  it('returns the Vault refs to revoke, read before the rows vanish', async () => {
    const db = seed();
    const result = await deleteAthleteData(fakeClient(db), ATHLETE);

    // Read after the delete this would be empty, and two live tokens would sit at Garmin and
    // Strava forever — the row is gone, so there is no second chance to find them.
    expect(result.providersToRevoke).toEqual([
      {
        provider: 'garmin',
        accessTokenRef: 'vault:garmin-access',
        refreshTokenRef: 'vault:garmin-refresh',
        alreadyRevoked: false,
      },
      { provider: 'strava', accessTokenRef: 'vault:strava-access', refreshTokenRef: null, alreadyRevoked: true },
    ]);
    expect(db['integrations']).toEqual([]);
  });

  it('reports unverified, and names the table, when a cascade does not fire', async () => {
    // The failure this whole mechanism exists to catch: a table that silently keeps its rows.
    const result = await deleteAthleteData(fakeClient(seed(), { noCascade: ['daily_metrics'] }), ATHLETE);
    expect(result.verified).toBe(false);
    expect(result.remaining['daily_metrics']).toBe(1);
    expect(result.remaining['activities']).toBe(0);
  });

  it('throws rather than half-erase when the delete fails', async () => {
    const db = seed();
    await expect(deleteAthleteData(fakeClient(db, { deleteError: 'FK violation' }), ATHLETE)).rejects.toThrow(
      /nothing deleted: FK violation/,
    );
    expect(db['profiles']).toHaveLength(2);
  });

  it('aborts before deleting if the provider connections cannot be read', async () => {
    // Deleting here would strand tokens we could no longer enumerate.
    const db = seed();
    await expect(
      deleteAthleteData(fakeClient(db, { failReads: { integrations: 'timeout' } }), ATHLETE),
    ).rejects.toThrow(/erasure aborted, nothing deleted/);
    expect(db['profiles']).toHaveLength(2);
  });
});
