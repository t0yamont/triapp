-- =============================================================================
-- TriFlow — 0001 extensions + enums
-- Source: spec/04-DATA-MODEL.sql. See DECISIONS.md for deviations.
--
-- pg_cron / pg_net are NOT enabled here — the scheduled job lives in the optional
-- migration 20260722120300 and is only applied on the real Supabase project.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type sport            as enum ('run','bike','swim','brick','strength','other');

-- provenance: the §2.1 ladder PLUS 'observed_max' (§2.2, highest valid observed HR,
-- confidence 0.80). The spec's SQL omitted it; added here to match packages/core/physio
-- (DECISIONS.md D-PROV-OBSERVED). Ordered by trust, highest first.
create type provenance       as enum ('lab_test','field_test','observed_max','dfa_a1_multi',
                                      'cp_model_fit','athlete_reported','dfa_a1_single',
                                      'passive_inference','population_formula');

create type plan_phase       as enum ('base','build','peak','taper','recovery','race_week','transition');
create type session_goal     as enum ('S1','S2','S3');
create type session_purpose  as enum ('aerobic_volume','threshold','vo2max','race_specific',
                                      'durability','technique','recovery','brick','strength',
                                      'heat_adaptation','field_test','rest');
create type workout_status   as enum ('scheduled','completed','partial','skipped','moved','replaced');
create type race_priority    as enum ('A','B','C');
create type provider         as enum ('garmin','strava','apple_health','wahoo','polar','suunto','manual','fit_upload');
