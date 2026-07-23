-- LOCAL TEST ONLY — applied after the schema migration.
-- On real Supabase these grants are handled automatically by default privileges for the
-- anon/authenticated/service_role roles; here we grant them explicitly so RLS (not a
-- missing table grant) is what governs visibility in the tests.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
