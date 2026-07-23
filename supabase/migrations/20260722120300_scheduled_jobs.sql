-- =============================================================================
-- IronFlow — 0004 scheduled jobs  (OPTIONAL, real Supabase project only)
--
-- The nightly recompute job (spec/04-DATA-MODEL.sql tail). Needs pg_cron + pg_net, which
-- are Supabase-managed extensions, and the `app.edge_url` setting. This migration is
-- self-guarding: if the prerequisites are absent it logs a notice and does nothing, so
-- `supabase db push` never fails on it. It is skipped entirely in local verification
-- (plain Postgres has no pg_cron).
--
-- To activate on Supabase:
--   1. Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
--   2. Point the job at your Edge Functions base URL:
--        alter database postgres set app.edge_url = 'https://<project-ref>.functions.supabase.co';
--   3. Re-run:  supabase db push   (or re-apply this migration)
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'IronFlow: pg_cron/pg_net not enabled — skipping nightly-recompute schedule. See migration header.';
    return;
  end if;

  if current_setting('app.edge_url', true) is null then
    raise notice 'IronFlow: app.edge_url not set — skipping nightly-recompute schedule. See migration header.';
    return;
  end if;

  -- Hourly tick; the recompute Edge Function resolves each athlete's local 03:00 itself.
  perform cron.schedule(
    'nightly-recompute',
    '0 * * * *',
    $job$ select net.http_post(url := current_setting('app.edge_url') || '/recompute') $job$
  );
  raise notice 'IronFlow: nightly-recompute scheduled.';
end $$;
