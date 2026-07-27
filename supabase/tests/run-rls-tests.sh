#!/usr/bin/env bash
# =============================================================================
# Local RLS verification (Phase 1 gate) — no secrets, no cloud.
#
# Spins up a throwaway Postgres in Docker, applies the auth shim + real migrations
# (0001–0003) + a two-athlete seed, then asserts every table isolates by athlete.
# The real Supabase project is never touched.
#
#   ./supabase/tests/run-rls-tests.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"
TST="$ROOT/supabase/tests"
CONTAINER="ironflow_rls_test_$$"
IMAGE="postgres:16-alpine"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ starting $IMAGE as $CONTAINER"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

echo -n "▶ waiting for postgres"
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 1
done
echo

psql_apply() {
  local label="$1"; local file="$2"
  echo "▶ applying: $label"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q < "$file"
}

# Order matters: auth shim → enums → schema → grants → RLS → seed → isolation test.
psql_apply "auth shim (local)"            "$TST/_local_auth_shim.sql"
psql_apply "0001 extensions + enums"      "$MIG/20260722120000_init_extensions_enums.sql"
psql_apply "0002 schema"                  "$MIG/20260722120100_init_schema.sql"
psql_apply "grants (local)"               "$TST/_local_grants.sql"
psql_apply "0003 RLS policies"            "$MIG/20260722120200_rls_policies.sql"
psql_apply "seed two athletes"            "$TST/rls_seed.sql"

psql_apply "0006 notification prefs"      "$MIG/20260727130000_notification_prefs.sql"

echo "▶ running RLS isolation assertions"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$TST/rls_isolation.sql"

# The compliance claim the TypeScript tests cannot make: they assert against a fake client, so
# they prove the *logic* of erasure and nothing about whether the foreign keys actually cascade.
echo "▶ running erasure cascade assertions"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$TST/erasure_cascade.sql"

echo "✔ database verification passed"
