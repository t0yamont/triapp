# Edge Functions

Supabase Edge Functions (Deno) are the I/O boundary for ingest and background jobs
(02-ARCHITECTURE.md §3). They stay thin: all parsing/normalisation/dedup logic lives in the
pure, unit-tested `@ironflow/core/ingest` package and is *composed* here, never duplicated.

## `ingest` (committed — activate once the migrations are applied)

The activity-ingest flow, per `05-INTEGRATIONS.md` and the data flow in §3:

```
upload / provider webhook (FIT | TCX | GPX)
  → parseActivityFile(bytes)          # @ironflow/core/ingest — DONE, tested
      → normalizeActivity()           # summary metrics, hasStreams/hasRrIntervals, hrSource
  → idempotencyKey(provider, id)      # replaying a webhook is a no-op (ARCH §3)
  → isDuplicate() vs recent activities # cross-provider dedupe (§7)
      → chooseRicher() keeps RR/most streams; losers get is_duplicate_of
  → upsert activities + activity_laps
  → activity_streams (compressed, lazy — never read in list views; ARCH §5, CLAUDE §6)
  → activity_sources (every provider that delivered this session)
```

**Status.** Implemented and composed end-to-end:
- `packages/core/ingest` — FIT (incl. RR intervals), TCX, GPX parsing, normalization,
  idempotency, deduplication. Unit-tested.
- `packages/api-client` — typed Supabase clients + `upsertParsedActivity`, the idempotent,
  dedup-aware write path, verified against generated `Database` types by `tsc`.
- `ingest/index.ts` — the Deno handler wiring them together (auth from JWT → parse → upsert).

The one thing not verifiable here is *runtime*: it needs the migrations applied to a real
project (currently on hold) and Supabase's env vars. `parseActivityFile` and
`upsertParsedActivity` are typechecked and unit-tested; the handler is thin glue over them.
Activate with `supabase functions deploy ingest` once the schema is live.

RR-interval streams are what make DFA-a1 threshold detection possible (03-ALGORITHM.md §6.1),
so the parser preserves them end-to-end and the normalizer flags `hrSource: 'chest_strap'`
whenever they are present.
