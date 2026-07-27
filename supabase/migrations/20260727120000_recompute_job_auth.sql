-- =============================================================================
-- TriFlow — 0005 recompute job authorisation  (OPTIONAL, real Supabase project only)
--
-- `20260722120300_scheduled_jobs.sql` scheduled an hourly POST to /recompute with **no
-- Authorization header**. The function it calls now exists, bypasses RLS, and therefore
-- requires the service-role key — so the original job would get a 401 every hour, for ever.
--
-- Rather than edit an already-applied migration, this re-registers the job with the header.
--
-- To activate on Supabase (in addition to the steps in 0004):
--   alter database postgres set app.service_role_key = '<your service_role key>';
--   supabase db push
--
-- The key sits in a database setting for the same reason `app.edge_url` does: pg_cron has no
-- other way to reach it. It is readable by superusers only. If you would rather it lived in
-- Vault, `vault.decrypted_secrets` works here too — swap the `current_setting` call below.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'TriFlow: pg_cron/pg_net not enabled — skipping recompute reschedule.';
    return;
  end if;

  if current_setting('app.edge_url', true) is null then
    raise notice 'TriFlow: app.edge_url not set — skipping recompute reschedule.';
    return;
  end if;

  if current_setting('app.service_role_key', true) is null then
    raise notice 'TriFlow: app.service_role_key not set — the recompute job would 401. Skipping.';
    return;
  end if;

  perform cron.unschedule('nightly-recompute')
  where exists (select 1 from cron.job where jobname = 'nightly-recompute');

  -- Still hourly: the function resolves which athletes are at their local 03:00 itself, so one
  -- schedule serves every timezone.
  perform cron.schedule(
    'nightly-recompute',
    '0 * * * *',
    $job$
      select net.http_post(
        url     := current_setting('app.edge_url') || '/recompute',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body    := '{}'::jsonb
      )
    $job$
  );
  raise notice 'TriFlow: nightly-recompute rescheduled with authorisation.';
end $$;
