/**
 * repositories/privacy.ts — right of access and right to erasure (02-ARCHITECTURE.md §7).
 *
 * Health and fitness data is **special-category personal data** under UK/EU GDPR, so these are
 * legal obligations, not features:
 *   - **Access** — a self-service full export.
 *   - **Erasure** — a self-service hard delete that cascades, revokes provider tokens, and is
 *     **verifiable**. "Probably deleted" is not a defensible position.
 *
 * The table lists below are exhaustive by construction and asserted against the live schema by
 * `assertExportCoversSchema`. An export that silently misses a table is a compliance failure that
 * looks exactly like a working export, so the completeness check is the important part of this
 * file — more than any single query.
 */

import type { TriflowClient } from '../client.js';
import type { Database } from '../database.types.js';

type TableName = keyof Database['public']['Tables'];

/** Athlete-owned tables, keyed directly by `athlete_id`. */
export const ATHLETE_KEYED_TABLES = [
  'athlete_availability',
  'athlete_anchors',
  'athlete_model_current',
  'athlete_zones',
  'integrations',
  'sync_log',
  'activities',
  'mean_max_curves',
  'daily_metrics',
  'races',
  'training_plans',
  'workouts',
  'plan_mutations',
  'field_tests',
  'coach_athlete_relationships',
  'notifications',
] as const satisfies readonly TableName[];

/**
 * A second owner column on a table already in the list above. `coach_athlete_relationships` names
 * two people, and a coach's own copy of that row is their personal data too — an export keyed only
 * on `athlete_id` would hand a coach an empty file and call it complete.
 */
export const SECOND_OWNER_COLUMNS = {
  coach_athlete_relationships: 'coach_id',
} as const satisfies Partial<Record<TableName, string>>;

/** Reachable only through a parent row, so they need the parent's ids to fetch. */
export const CHILD_TABLES = {
  activity_sources: 'activity_id',
  activity_laps: 'activity_id',
  activity_streams: 'activity_id',
  plan_weeks: 'plan_id',
} as const satisfies Partial<Record<TableName, string>>;

/** Every table an athlete's personal data can live in — the export must cover all of these. */
export const ALL_PERSONAL_DATA_TABLES: readonly TableName[] = [
  'profiles',
  ...ATHLETE_KEYED_TABLES,
  ...(Object.keys(CHILD_TABLES) as TableName[]),
];

/**
 * Fails loudly if the schema and this module have drifted apart. A new table holding athlete data
 * is the realistic way an export silently becomes incomplete, and a compile-time type gives no
 * protection because the list is hand-written. A stale entry is the milder failure — every export
 * then reports an error and ships nothing — but it is worth naming precisely rather than debugging.
 */
export function assertExportCoversSchema(schemaTables: readonly string[]): void {
  const covered = new Set<string>(ALL_PERSONAL_DATA_TABLES);
  const live = new Set(schemaTables);
  const missing = schemaTables.filter((t) => !covered.has(t));
  const stale = ALL_PERSONAL_DATA_TABLES.filter((t) => !live.has(t));
  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(
      `not covered by the export: ${missing.join(', ')} — add each to ATHLETE_KEYED_TABLES or ` +
        'CHILD_TABLES (or document why it holds no personal data)',
    );
  }
  if (stale.length > 0) {
    problems.push(`listed but not in the schema: ${stale.join(', ')} — renamed or dropped?`);
  }
  if (problems.length > 0) throw new Error(`Personal-data export is out of step with the schema. ${problems.join('; ')}.`);
}

/**
 * Structural view of the client. These queries are driven by a *list* of table names, and
 * supabase-js types each column argument from the literal table it was called on, so a loop over a
 * union cannot type-check. Narrowing to the four methods actually used keeps the cast to one place
 * and keeps the table lists — the thing that matters for compliance — data rather than code.
 */
interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}
interface Filterable extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): Filterable;
  in(column: string, values: readonly unknown[]): Filterable;
}
interface DynamicClient {
  from(table: string): {
    select(columns: string, opts?: { count?: 'exact'; head?: boolean }): Filterable;
    delete(): { eq(column: string, value: unknown): PromiseLike<{ error: { message: string } | null }> };
  };
}
const dynamic = (client: TriflowClient): DynamicClient => client as unknown as DynamicClient;

// ── Right of access ──────────────────────────────────────────────────────────

export interface AthleteExport {
  athleteId: string;
  /** ISO instant, supplied by the caller — this package does not read the clock either. */
  exportedAt: string;
  /** One entry per table, always present even when empty, so the athlete can see the shape. */
  tables: Record<string, unknown[]>;
  /** Tables that failed to read. Non-empty ⇒ the export is incomplete and must not be shipped. */
  errors: { table: string; message: string }[];
}

/** An export with any read error in it is not a lawful response to a subject-access request. */
export function isExportComplete(exported: AthleteExport): boolean {
  return exported.errors.length === 0;
}

const idOf = (row: unknown): string => (row as { id: string }).id;

/**
 * Everything held about one athlete. Streams are large binary blobs; `includeStreams: false`
 * produces a preview, but a real subject-access request must include them.
 */
export async function exportAthleteData(
  client: TriflowClient,
  athleteId: string,
  exportedAt: string,
  opts: { includeStreams?: boolean } = {},
): Promise<AthleteExport> {
  const db = dynamic(client);
  const includeStreams = opts.includeStreams ?? true;
  const tables: Record<string, unknown[]> = {};
  const errors: { table: string; message: string }[] = [];

  const record = (table: string, result: QueryResult): unknown[] => {
    if (result.error) errors.push({ table, message: result.error.message });
    const rows = result.data ?? [];
    tables[table] = rows;
    return rows;
  };

  record('profiles', await db.from('profiles').select('*').eq('id', athleteId));

  for (const table of ATHLETE_KEYED_TABLES) {
    const rows = record(table, await db.from(table).select('*').eq('athlete_id', athleteId));

    const secondColumn = (SECOND_OWNER_COLUMNS as Record<string, string | undefined>)[table];
    if (secondColumn === undefined) continue;
    const asOther = await db.from(table).select('*').eq(secondColumn, athleteId);
    if (asOther.error) errors.push({ table, message: asOther.error.message });
    const seen = new Set(rows.map(idOf));
    tables[table] = [...rows, ...(asOther.data ?? []).filter((r) => !seen.has(idOf(r)))];
  }

  // Children: fetch by their parents' ids, which the loop above has already read.
  const parentIds: Record<string, string[]> = {
    activity_id: (tables['activities'] ?? []).map(idOf),
    plan_id: (tables['training_plans'] ?? []).map(idOf),
  };

  for (const [table, fk] of Object.entries(CHILD_TABLES)) {
    const ids = parentIds[fk] ?? [];
    if ((table === 'activity_streams' && !includeStreams) || ids.length === 0) {
      tables[table] = [];
      continue;
    }
    record(table, await db.from(table).select('*').in(fk, ids));
  }

  return { athleteId, exportedAt, tables, errors };
}

// ── Right to erasure ─────────────────────────────────────────────────────────

/**
 * A provider connection that outlives the row describing it. The tokens themselves live in
 * Supabase Vault (the table stores only references), so erasure has two halves: revoke at the
 * provider, then destroy the Vault secret. Deleting the row alone leaves a live token at a third
 * party and an orphaned secret — precisely the data the athlete asked to have destroyed.
 */
export interface ProviderRevocation {
  provider: string;
  accessTokenRef: string | null;
  refreshTokenRef: string | null;
  /** Already revoked at the provider; the Vault secrets may still need destroying. */
  alreadyRevoked: boolean;
}

export interface ErasureResult {
  athleteId: string;
  providersToRevoke: ProviderRevocation[];
  /** Per-table rows still present after the delete. All zero ⇒ erasure verified. */
  remaining: Record<string, number>;
  verified: boolean;
}

/**
 * Rows still holding this athlete's data. Erasure "must complete within 30 days and be
 * verifiable" (§7), so this is the evidence, runnable before and after a delete.
 *
 * Children are not counted directly: each cascades from a parent that *is* counted, so a
 * non-zero child count without a non-zero parent count is not reachable.
 */
export async function countAthleteRows(client: TriflowClient, athleteId: string): Promise<Record<string, number>> {
  const db = dynamic(client);
  const counts: Record<string, number> = {};

  const profile = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('id', athleteId);
  counts['profiles'] = profile.count ?? 0;

  for (const table of ATHLETE_KEYED_TABLES) {
    const own = await db.from(table).select('id', { count: 'exact', head: true }).eq('athlete_id', athleteId);
    let n = own.count ?? 0;

    const secondColumn = (SECOND_OWNER_COLUMNS as Record<string, string | undefined>)[table];
    if (secondColumn !== undefined) {
      const asOther = await db.from(table).select('id', { count: 'exact', head: true }).eq(secondColumn, athleteId);
      n += asOther.count ?? 0;
    }
    counts[table] = n;
  }
  return counts;
}

/**
 * Hard-delete an athlete. Every personal-data table cascades from `profiles`, so one delete
 * removes the lot — but the provider connections are read out **first**, because once the rows are
 * gone there is nothing left to revoke with.
 *
 * Revocation itself is a third-party HTTP call, and destroying the Vault secrets needs the
 * service role, so both belong to the caller; this returns what to act on. The `auth.users` row
 * must also be deleted separately (service-role only) — `profiles.id` references it, not the
 * other way round, so it does not cascade from here.
 */
export async function deleteAthleteData(client: TriflowClient, athleteId: string): Promise<ErasureResult> {
  const db = dynamic(client);

  const integrations = await db
    .from('integrations')
    .select('provider, access_token_ref, refresh_token_ref, revoked_at')
    .eq('athlete_id', athleteId);
  if (integrations.error) {
    throw new Error(`erasure aborted, nothing deleted: could not read provider connections: ${integrations.error.message}`);
  }

  const providersToRevoke = (integrations.data ?? []).map((row) => {
    const i = row as {
      provider: string;
      access_token_ref: string | null;
      refresh_token_ref: string | null;
      revoked_at: string | null;
    };
    return {
      provider: i.provider,
      accessTokenRef: i.access_token_ref,
      refreshTokenRef: i.refresh_token_ref,
      alreadyRevoked: i.revoked_at !== null,
    };
  });

  const { error } = await db.from('profiles').delete().eq('id', athleteId);
  if (error) throw new Error(`erasure failed, nothing deleted: ${error.message}`);

  const remaining = await countAthleteRows(client, athleteId);
  return {
    athleteId,
    providersToRevoke,
    remaining,
    verified: Object.values(remaining).every((n) => n === 0),
  };
}
