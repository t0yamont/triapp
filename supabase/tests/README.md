# Database tests — RLS isolation

Verifies the **Phase 1 gate** (`spec/07-ACCEPTANCE.md` §C): *"RLS verified by an automated
test that authenticates as athlete A and confirms zero rows visible from athlete B, on
every table."*

The harness applies the real migrations (`0001`–`0003`) to a throwaway Postgres, plus a
local-only `auth` shim (the real Supabase project already provides `auth`), seeds two
athletes, then asserts:

- athlete A sees **exactly its own row** in all 21 tables,
- athlete B sees exactly its own row,
- an unauthenticated caller sees **zero** rows anywhere.

## Run it

**With Docker** (standard; needs Docker Hub access):

```bash
./supabase/tests/run-rls-tests.sh
```

**Without Docker** (restricted-egress environments where Docker Hub is blocked): use a real
Postgres from the npm registry (`embedded-postgres`) instead. Postgres refuses to run as
root, so run the server as an unprivileged user. This is exactly how the suite was verified
in development — against **PostgreSQL 18.4** — and it passed: all 21 tables isolate by
athlete. The SQL under test (`_local_auth_shim.sql`, `_local_grants.sql`, `rls_seed.sql`,
`rls_isolation.sql`, and migrations `0001`–`0003`) is identical on both paths.

## Files

| File | Purpose |
|---|---|
| `_local_auth_shim.sql` | Emulates Supabase's `auth` schema + `auth.uid()`; **local only**, never a migration |
| `_local_grants.sql` | Grants `authenticated` table access locally (Supabase does this via default privileges) |
| `rls_seed.sql` | Seeds athletes A and B with a row in every table |
| `rls_isolation.sql` | The assertions (aborts on any leak) |
| `run-rls-tests.sh` | Orchestrates the Docker path |
