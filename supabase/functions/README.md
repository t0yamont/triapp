# Edge Functions

Supabase Edge Functions (Deno) are the I/O boundary for ingest and background jobs
(02-ARCHITECTURE.md §3). They stay thin: all parsing/normalisation/dedup logic lives in the
pure, unit-tested `@ironflow/core/ingest` package and is *composed* here, never duplicated.

## `ingest` (planned — wiring pending the applied DB)

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

**Status.** The pure pipeline (`packages/core/ingest`) is implemented and unit-tested:
FIT (incl. RR intervals for DFA-a1), TCX and GPX parsing, normalization, idempotency and
deduplication. The Deno Edge Function that composes it with the database is intentionally
*not* committed yet: it needs the migrations applied to a real project (currently on hold)
and the `@ironflow/core/api-client` package, so it can't be run or verified in isolation.
It is the immediate next step once the schema is live.

RR-interval streams are what make DFA-a1 threshold detection possible (03-ALGORITHM.md §6.1),
so the parser preserves them end-to-end and the normalizer flags `hrSource: 'chest_strap'`
whenever they are present.
