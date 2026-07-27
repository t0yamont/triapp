-- =============================================================================
-- TriFlow — 0006 notification preferences
--
-- Settings has offered notification toggles since the screen was built, with nowhere to store
-- an answer. The `notifications` table (0002) holds what was sent; this holds what the athlete
-- wants sent. jsonb rather than a column per kind: the set of kinds changes as producers are
-- added, and a migration per toggle is not worth it.
--
-- Defaults are on. A notification only fires from a real producer — a plan the engine changed,
-- a test that has come due, a missing check-in — and an athlete who has opted into an adaptive
-- plan has opted into being told when it adapts. Every one is switchable off.
-- =============================================================================

alter table profiles
  add column if not exists notification_prefs jsonb not null
    default '{"plan_change": true, "test_due": true, "check_in_reminder": true}'::jsonb;
