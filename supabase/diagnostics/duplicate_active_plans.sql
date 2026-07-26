-- diagnostics/duplicate_active_plans.sql
--
-- Why this exists: until the sign-in fix, every authenticated path landed on
-- `/onboarding/about`, and `insertGeneratedPlan` inserted unconditionally. So signing in and
-- walking through onboarding again created a SECOND `training_plans` row with status 'active'.
-- Nothing errored: `getActivePlan` orders by `created_at desc limit 1`, so the newest duplicate
-- silently shadows the original, and every workout (plus any completion history) attached to the
-- older plan becomes invisible to the app.
--
-- The code fix stops new duplicates. It does not clean up ones already in the database.
--
-- Run these in the Supabase SQL editor (it runs privileged, so it sees every athlete).
-- Read-only until STEP 3, which is commented out on purpose.

-- ── STEP 1 · Is there a problem at all? ─────────────────────────────────────
-- One row per athlete who has more than one active plan. No rows = nothing to do.

select
  athlete_id,
  count(*)                          as active_plans,
  min(created_at)                   as first_created,
  max(created_at)                   as latest_created,
  array_agg(id order by created_at) as plan_ids
from training_plans
where status = 'active'
group by athlete_id
having count(*) > 1
order by active_plans desc;

-- ── STEP 2 · Which plan is the one actually being used? ─────────────────────
-- Do NOT assume "newest wins" — that is only what `getActivePlan` happens to do. The plan worth
-- keeping is the one the athlete has actually trained against: completed workouts, linked
-- activities, or audited mutations. `visible_to_app` marks the one the app currently shows.

select
  p.athlete_id,
  p.id                                   as plan_id,
  p.name,
  p.start_date,
  p.created_at,
  p.id = first_value(p.id) over (
    partition by p.athlete_id order by p.created_at desc
  )                                      as visible_to_app,
  count(w.id)                            as workouts,
  count(*) filter (where w.status = 'completed')          as completed,
  count(*) filter (where w.completed_activity_id is not null) as linked_activities,
  (select count(*) from plan_mutations m where m.plan_id = p.id) as audit_rows
from training_plans p
left join workouts w on w.plan_id = p.id
where p.status = 'active'
  and p.athlete_id in (
    select athlete_id from training_plans where status = 'active'
    group by athlete_id having count(*) > 1
  )
group by p.athlete_id, p.id, p.name, p.start_date, p.created_at
order by p.athlete_id, p.created_at;

-- ── STEP 3 · Archive the plans that were never trained against ──────────────
-- Deliberately commented out. Read STEP 2 first and decide per athlete.
--
-- This keeps, for each athlete, the plan with the most real history (completed workouts +
-- linked activities + audit rows), breaking ties toward the most recent. Everything else
-- becomes 'archived' — a status change, never a delete: the workouts stay, so nothing an
-- athlete actually did is lost, and a wrong call here is reversible.
--
-- If STEP 2 shows an athlete whose *evidence* sits on one plan and whose *visible_to_app* is a
-- different one, that athlete has been looking at an empty plan while their history sat on the
-- other. That is the case this is meant to repair.

-- begin;
--
-- with ranked as (
--   select
--     p.id,
--     p.athlete_id,
--     row_number() over (
--       partition by p.athlete_id
--       order by
--         (select count(*) from workouts w
--           where w.plan_id = p.id
--             and (w.status = 'completed' or w.completed_activity_id is not null)) desc,
--         (select count(*) from plan_mutations m where m.plan_id = p.id) desc,
--         p.created_at desc
--     ) as keep_rank
--   from training_plans p
--   where p.status = 'active'
--     and p.athlete_id in (
--       select athlete_id from training_plans where status = 'active'
--       group by athlete_id having count(*) > 1
--     )
-- )
-- update training_plans t
--    set status = 'archived', updated_at = now()
--   from ranked r
--  where t.id = r.id
--    and r.keep_rank > 1;
--
-- -- Re-run STEP 1: it must return zero rows before you commit.
-- -- rollback;   -- or:
-- -- commit;
