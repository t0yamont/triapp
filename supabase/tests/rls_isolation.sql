-- =============================================================================
-- LOCAL TEST — RLS isolation (Phase 1 gate, 07-ACCEPTANCE.md §C):
-- "authenticate as athlete A and confirm zero rows visible from athlete B, on every table".
--
-- Runs with ON_ERROR_STOP=1: any RAISE EXCEPTION aborts psql with a non-zero exit.
-- =============================================================================

\set ON_ERROR_STOP on

-- Every table under RLS. Each athlete should see exactly ONE row (their own) in each.
-- (For coach_athlete_relationships the one row is the A↔B relationship, visible to both.)
\set tables '{profiles,athlete_availability,athlete_anchors,athlete_model_current,athlete_zones,integrations,sync_log,activities,activity_sources,activity_laps,activity_streams,mean_max_curves,daily_metrics,races,training_plans,plan_weeks,workouts,plan_mutations,field_tests,coach_athlete_relationships,notifications}'

-- Bridge the psql client variable into a session GUC the DO blocks below can read.
select set_config('ironflow.tables', :'tables', false);

-- 0. Superuser sanity: RLS is bypassed for the owner, so both athletes' data is present.
do $$
declare c bigint;
begin
  select count(*) into c from activities;
  if c <> 2 then raise exception 'SEED FAIL: expected 2 activities total, found %', c; end if;
  raise notice 'seed sanity OK: % activities present as superuser (RLS bypassed)', c;
end $$;

-- 1. Athlete A sees exactly its own row in every table.
begin;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
  set local role authenticated;
  do $$
  declare t text; c bigint; n int := 0;
  begin
    foreach t in array current_setting('ironflow.tables')::text[] loop
      execute format('select count(*) from %I', t) into c;
      if c <> 1 then
        raise exception 'RLS FAIL: athlete A sees % row(s) in "%", expected exactly 1 (its own)', c, t;
      end if;
      n := n + 1;
    end loop;
    raise notice 'RLS OK: athlete A sees exactly its own row across all % tables', n;
  end $$;
commit;

-- 2. Athlete B, symmetrically, sees only its own row.
begin;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
  set local role authenticated;
  do $$
  declare t text; c bigint; n int := 0;
  begin
    foreach t in array current_setting('ironflow.tables')::text[] loop
      execute format('select count(*) from %I', t) into c;
      if c <> 1 then
        raise exception 'RLS FAIL: athlete B sees % row(s) in "%", expected exactly 1 (its own)', c, t;
      end if;
      n := n + 1;
    end loop;
    raise notice 'RLS OK: athlete B sees exactly its own row across all % tables', n;
  end $$;
commit;

-- 3. No identity (no sub claim) sees nothing — RLS denies by default.
begin;
  select set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  do $$
  declare t text; c bigint;
  begin
    foreach t in array current_setting('ironflow.tables')::text[] loop
      execute format('select count(*) from %I', t) into c;
      if c <> 0 then
        raise exception 'RLS FAIL: an unauthenticated caller sees % row(s) in "%", expected 0', c, t;
      end if;
    end loop;
    raise notice 'RLS OK: an unauthenticated caller sees zero rows in every table';
  end $$;
commit;

\echo '==================================================='
\echo ' RLS ISOLATION: PASS — every table isolates by athlete'
\echo '==================================================='
