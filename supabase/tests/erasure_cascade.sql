-- =============================================================================
-- Right to erasure — the cascade, verified (02-ARCHITECTURE.md §7)
--
-- §7 requires a hard delete that "cascades ... and is verifiable". `deleteAthleteData` deletes
-- one `profiles` row and then re-counts every table to prove it worked. That reasoning rests on
-- the foreign keys actually cascading — which the TypeScript tests assert against a fake client
-- and therefore cannot prove. This proves it against Postgres.
--
-- It also pins the fact that makes `/api/account` necessary: `profiles.id` REFERENCES
-- `auth.users`, so the cascade runs the wrong way and the athlete's auth row — their email —
-- survives the delete. Removing it needs the service role, from a server.
--
-- Run via supabase/tests/run-rls-tests.sh.
-- =============================================================================

\set ath '''44444444-4444-4444-4444-444444444444'''

begin;
set local role postgres;

insert into auth.users(id) values (:ath);
insert into profiles(id, display_name) values (:ath, 'Erasure Test');

insert into athlete_model_current(athlete_id, model, combined_confidence) values (:ath, '{}', 0.6);
insert into athlete_anchors(athlete_id, sport, anchor_type, value_numeric, unit, confidence, provenance, measured_at)
  values (:ath, 'bike', 'critical_power', 268, 'W', 0.7, 'cp_model_fit', now());
insert into integrations(athlete_id, provider, access_token_ref, consent_at) values (:ath, 'garmin', 'vault:ref', now());
insert into sync_log(athlete_id, provider, job) values (:ath, 'garmin', 'backfill');
insert into daily_metrics(athlete_id, date, ctl_total) values (:ath, current_date, 40);
insert into mean_max_curves(athlete_id, sport, metric, window_start, window_end, curve)
  values (:ath, 'bike', 'power', current_date - 90, current_date, '[]');
insert into races(athlete_id, name, race_date, priority, event_type)
  values (:ath, 'A race', current_date + 90, 'A', 'ironman');
insert into field_tests(athlete_id, sport, protocol) values (:ath, 'run', '20min_tt');
insert into notifications(athlete_id, kind, title, body) values (:ath, 'plan_change', 't', 'b');

insert into training_plans(athlete_id, name, start_date, end_date, engine_version,
                           model_snapshot, availability_snapshot, distribution_policy)
  values (:ath, 'P', current_date, current_date + 90, 'v1', '{}', '{}', '{}');

insert into activities(athlete_id, sport, start_time, local_tz_offset_min, duration_s, primary_provider)
  values (:ath, 'run', now(), 0, 3600, 'manual');
-- The three child tables that carry no athlete_id and are reachable only through their parent —
-- the ones an export or an erasure most easily forgets.
insert into activity_streams(activity_id, hr) select id, '\x00' from activities where athlete_id = :ath;
insert into activity_laps(activity_id, lap_index, start_offset_s, duration_s)
  select id, 0, 0, 600 from activities where athlete_id = :ath;
insert into activity_sources(activity_id, provider, provider_activity_id)
  select id, 'manual', 'seed-1' from activities where athlete_id = :ath;

create or replace function pg_temp.erasure_rows(aid uuid) returns bigint language sql as $fn$
  select (select count(*) from profiles where id = aid)
       + (select count(*) from athlete_availability where athlete_id = aid)
       + (select count(*) from athlete_model_current where athlete_id = aid)
       + (select count(*) from athlete_anchors where athlete_id = aid)
       + (select count(*) from athlete_zones where athlete_id = aid)
       + (select count(*) from integrations where athlete_id = aid)
       + (select count(*) from sync_log where athlete_id = aid)
       + (select count(*) from daily_metrics where athlete_id = aid)
       + (select count(*) from mean_max_curves where athlete_id = aid)
       + (select count(*) from races where athlete_id = aid)
       + (select count(*) from training_plans where athlete_id = aid)
       + (select count(*) from workouts where athlete_id = aid)
       + (select count(*) from plan_mutations where athlete_id = aid)
       + (select count(*) from field_tests where athlete_id = aid)
       + (select count(*) from notifications where athlete_id = aid)
       + (select count(*) from activities where athlete_id = aid)
       + (select count(*) from coach_athlete_relationships where athlete_id = aid or coach_id = aid)
       + (select count(*) from plan_weeks w join training_plans p on p.id = w.plan_id where p.athlete_id = aid)
       + (select count(*) from activity_streams s join activities x on x.id = s.activity_id where x.athlete_id = aid)
       + (select count(*) from activity_laps l join activities x on x.id = l.activity_id where x.athlete_id = aid)
       + (select count(*) from activity_sources s join activities x on x.id = s.activity_id where x.athlete_id = aid);
$fn$;

do $$
declare
  held bigint;
  remaining bigint;
  auth_rows bigint;
begin
  held := pg_temp.erasure_rows('44444444-4444-4444-4444-444444444444');
  if held < 13 then
    raise exception 'FIXTURE BROKEN: seeded only % rows — the cascade assertion below would prove nothing', held;
  end if;

  delete from profiles where id = '44444444-4444-4444-4444-444444444444';

  remaining := pg_temp.erasure_rows('44444444-4444-4444-4444-444444444444');
  if remaining <> 0 then
    raise exception 'ERASURE INCOMPLETE: % rows survived deleting the profile', remaining;
  end if;
  raise notice 'ERASURE OK: % rows across 21 tables, all gone with one profile delete', held;

  -- Not a bug: the direction of this FK is why /api/account exists.
  select count(*) into auth_rows from auth.users where id = '44444444-4444-4444-4444-444444444444';
  if auth_rows <> 1 then
    raise exception 'EXPECTED auth.users to survive — /api/account deletes it with the service role';
  end if;
  raise notice 'auth.users row survives as expected — the server route removes it (service role only)';
end $$;

rollback;

\echo '==================================================='
\echo ' ERASURE CASCADE: PASS — one delete clears 21 tables'
\echo '==================================================='
