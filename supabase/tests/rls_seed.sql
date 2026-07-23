-- LOCAL TEST ONLY — seed two athletes (A and B) with one row in every table.
-- Run as a superuser (RLS bypassed) so both athletes' data exists; the isolation test then
-- proves that, as each athlete, only their own row is visible.

create or replace function pg_temp.seed_athlete(aid uuid, tag text) returns void
  language plpgsql
as $$
declare
  act uuid := gen_random_uuid();
  rac uuid := gen_random_uuid();
  pl  uuid := gen_random_uuid();
  wk  uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (aid, tag || '@test.dev');
  insert into profiles(id, display_name) values (aid, tag);
  insert into athlete_availability(athlete_id, weekly_hours_target, weekly_hours_max, day_minutes)
    values (aid, 8, 12, '{"1":60}');
  insert into athlete_anchors(athlete_id, anchor_type, unit, confidence, provenance, measured_at)
    values (aid, 'hr_max', 'bpm', 0.2, 'population_formula', now());
  insert into athlete_model_current(athlete_id, model, combined_confidence)
    values (aid, '{}'::jsonb, 0.5);
  insert into athlete_zones(athlete_id, sport, modality, anchor_mode, zones)
    values (aid, 'run', 'hr', 'hrr_fallback', '[]'::jsonb);
  insert into integrations(athlete_id, provider, consent_at) values (aid, 'garmin', now());
  insert into sync_log(athlete_id, provider, job) values (aid, 'garmin', 'backfill');
  insert into activities(id, athlete_id, sport, start_time, local_tz_offset_min, duration_s,
                         primary_provider, provider_activity_id)
    values (act, aid, 'run', now(), 0, 3600, 'garmin', tag || '-act1');
  insert into activity_sources(activity_id, provider, provider_activity_id)
    values (act, 'garmin', tag || '-act1');
  insert into activity_laps(activity_id, lap_index, start_offset_s, duration_s)
    values (act, 0, 0, 600);
  insert into activity_streams(activity_id) values (act);
  insert into mean_max_curves(athlete_id, sport, metric, window_start, window_end, curve)
    values (aid, 'run', 'power', current_date - 30, current_date, '[]'::jsonb);
  insert into daily_metrics(athlete_id, date) values (aid, current_date);
  insert into races(id, athlete_id, name, race_date, priority, event_type)
    values (rac, aid, tag || ' race', current_date + 90, 'A', 'ironman');
  insert into training_plans(id, athlete_id, primary_race_id, name, start_date, end_date,
                             model_snapshot, availability_snapshot, distribution_policy, engine_version)
    values (pl, aid, rac, tag || ' plan', current_date, current_date + 90, '{}', '{}', '{}', 'test');
  insert into plan_weeks(id, plan_id, week_number, week_start_date, phase, load_target, hours_target,
                         distribution_target)
    values (wk, pl, 1, current_date, 'base', 100, 8, '{"S1":80,"S2":15,"S3":5}');
  insert into workouts(athlete_id, plan_week_id, plan_id, scheduled_date, sport, template_id, name,
                       purpose, goal_zone, planned_duration_min, planned_load, structure)
    values (aid, wk, pl, current_date, 'run', 'tmpl', 'workout', 'aerobic_volume', 'S1', 60, 50, '{}');
  insert into plan_mutations(athlete_id, plan_id, actor, reason_code, reason_text)
    values (aid, pl, 'engine', 'TEST', 'seed mutation');
  insert into field_tests(athlete_id, sport, protocol) values (aid, 'run', '30min_tt');
  insert into notifications(athlete_id, kind, title, body) values (aid, 'test', 't', 'b');
end $$;

select pg_temp.seed_athlete('00000000-0000-0000-0000-00000000000a', 'athleteA');
select pg_temp.seed_athlete('00000000-0000-0000-0000-00000000000b', 'athleteB');

-- One coach relationship: B is A's coach. Visible to A (as athlete) and B (as coach) — this
-- is a relationship both parties are party to, not a leak. Inert in v1 (status 'pending').
insert into coach_athlete_relationships(coach_id, athlete_id)
  values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
