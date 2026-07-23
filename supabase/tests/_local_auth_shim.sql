-- =============================================================================
-- LOCAL TEST ONLY — emulates the Supabase-managed `auth` schema.
--
-- The real Supabase project already provides `auth.users` and `auth.uid()`. This shim
-- exists so the RLS policies (which call auth.uid()) can be verified in a throwaway plain
-- Postgres container. It is NEVER applied to the real project and is not a migration.
--
-- auth.uid() reads the JWT `sub` claim from the `request.jwt.claims` GUC, exactly as
-- PostgREST/Supabase sets it per request. Tests set that GUC to impersonate an athlete.
-- =============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

-- Supabase end-user roles (subset). `authenticated` is the role RLS targets; it is NOT a
-- superuser and does NOT own the tables, so RLS is enforced against it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
