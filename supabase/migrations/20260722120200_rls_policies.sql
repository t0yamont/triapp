-- =============================================================================
-- TriFlow — 0003 Row Level Security
--
-- RLS on EVERY table, no exceptions (CLAUDE.md §Hard rule 4; 02-ARCHITECTURE.md §6).
-- The spec SQL enabled RLS on all tables but wrote policies for only three ("replicate
-- for each"). A table with RLS enabled and NO policy denies all access, so this migration
-- writes the complete set: an owner policy for every table, parent-ownership for child
-- tables, and the inert coach-read policy (present, returns no rows until coach mode ships).
--
-- Policy pattern (02-ARCHITECTURE.md §6): athlete_id = auth.uid(); profiles keys on id;
-- child tables reach ownership through their parent. Multiple permissive policies combine
-- with OR, so "owner OR active-coach" is the effective read rule on shared training data.
-- =============================================================================

-- Enable RLS on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','athlete_availability','athlete_anchors','athlete_model_current',
    'athlete_zones','integrations','sync_log','activities','activity_sources',
    'activity_laps','activity_streams','mean_max_curves','daily_metrics','races',
    'training_plans','plan_weeks','workouts','plan_mutations','field_tests',
    'coach_athlete_relationships','notifications'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── Owner policies — direct athlete_id ownership ─────────────────────────────
create policy own_profile on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy own_rows on athlete_availability
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on athlete_anchors
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on athlete_model_current
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on athlete_zones
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on integrations
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on sync_log
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on activities
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on mean_max_curves
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on daily_metrics
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on races
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on training_plans
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on workouts
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on plan_mutations
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on field_tests
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy own_rows on notifications
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

-- ── Owner policies — ownership via a parent row ──────────────────────────────
create policy own_via_activity on activity_sources
  for all using (exists (
    select 1 from activities a where a.id = activity_sources.activity_id and a.athlete_id = auth.uid()
  )) with check (exists (
    select 1 from activities a where a.id = activity_sources.activity_id and a.athlete_id = auth.uid()
  ));
create policy own_via_activity on activity_laps
  for all using (exists (
    select 1 from activities a where a.id = activity_laps.activity_id and a.athlete_id = auth.uid()
  )) with check (exists (
    select 1 from activities a where a.id = activity_laps.activity_id and a.athlete_id = auth.uid()
  ));
create policy own_via_activity on activity_streams
  for all using (exists (
    select 1 from activities a where a.id = activity_streams.activity_id and a.athlete_id = auth.uid()
  )) with check (exists (
    select 1 from activities a where a.id = activity_streams.activity_id and a.athlete_id = auth.uid()
  ));
create policy own_via_plan on plan_weeks
  for all using (exists (
    select 1 from training_plans p where p.id = plan_weeks.plan_id and p.athlete_id = auth.uid()
  )) with check (exists (
    select 1 from training_plans p where p.id = plan_weeks.plan_id and p.athlete_id = auth.uid()
  ));

-- ── Coach relationship — visible to either party ─────────────────────────────
create policy own_relationship on coach_athlete_relationships
  for all using (athlete_id = auth.uid() or coach_id = auth.uid())
  with check (athlete_id = auth.uid() or coach_id = auth.uid());

-- ── Inert coach-read policies (02-ARCHITECTURE.md §6) ────────────────────────
-- Present but return no rows in v1: no relationship is 'active' until coach mode ships,
-- and no coach features are exposed (spec D1). SELECT-only, on training data a coach views.
create policy coach_read on activities for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = activities.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on athlete_anchors for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = athlete_anchors.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on athlete_zones for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = athlete_zones.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on athlete_model_current for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = athlete_model_current.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on athlete_availability for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = athlete_availability.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on daily_metrics for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = daily_metrics.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on races for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = races.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on training_plans for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = training_plans.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on workouts for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = workouts.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on plan_mutations for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = plan_mutations.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on field_tests for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = field_tests.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on mean_max_curves for select using (exists (
  select 1 from coach_athlete_relationships r
  where r.athlete_id = mean_max_curves.athlete_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
-- child tables: coach reaches them through the parent activity / plan
create policy coach_read on activity_laps for select using (exists (
  select 1 from activities a
  join coach_athlete_relationships r on r.athlete_id = a.athlete_id
  where a.id = activity_laps.activity_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on activity_streams for select using (exists (
  select 1 from activities a
  join coach_athlete_relationships r on r.athlete_id = a.athlete_id
  where a.id = activity_streams.activity_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
create policy coach_read on plan_weeks for select using (exists (
  select 1 from training_plans p
  join coach_athlete_relationships r on r.athlete_id = p.athlete_id
  where p.id = plan_weeks.plan_id and r.coach_id = auth.uid()
    and r.status = 'active' and (r.permissions->>'view')::boolean is true));
