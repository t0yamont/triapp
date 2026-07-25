-- =============================================================================
-- TriFlow — 0002 schema (tables + indexes)
-- Source: spec/04-DATA-MODEL.sql, reproduced faithfully.
-- Conventions: all timestamps timestamptz (UTC); every physiological estimate carries
-- value + confidence + provenance + measured_at. RLS is applied in migration 0003.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- IDENTITY
-- ---------------------------------------------------------------------------
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  date_of_birth     date,
  sex               text check (sex in ('male','female','prefer_not_to_say')),
  timezone          text not null default 'Europe/London',   -- IANA
  week_start_day    smallint not null default 1,             -- 1 = Monday
  units             text not null default 'metric' check (units in ('metric','imperial')),
  training_age_years numeric,
  -- consent (see 02-ARCHITECTURE.md §7)
  health_data_consent_at    timestamptz,
  health_data_consent_version text,
  medical_disclaimer_ack_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Athlete-declared availability. Drives micro-cycle construction (§8.4).
create table athlete_availability (
  athlete_id        uuid primary key references profiles(id) on delete cascade,
  weekly_hours_target numeric not null,
  weekly_hours_max    numeric not null,
  -- per weekday: 0=Sun..6=Sat
  day_minutes       jsonb not null,   -- {"0":180,"1":60,...} available minutes
  swim_days         smallint[] not null default '{}',
  long_ride_day     smallint,
  long_run_day      smallint,
  gym_access        boolean not null default false,
  sauna_access      boolean not null default false,
  notes             text,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ATHLETE PHYSIOLOGICAL MODEL  (03-ALGORITHM.md §2)
-- One row per anchor per sport. History is retained — never update in place.
-- ---------------------------------------------------------------------------
create table athlete_anchors (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references profiles(id) on delete cascade,
  sport             sport,                       -- null for whole-body anchors (hr_max, hr_rest)
  anchor_type       text not null check (anchor_type in
                      ('hr_max','hr_rest','lt1','lt2','critical_power','critical_speed',
                       'css','w_prime','body_mass','durability_index','economy')),
  value_numeric     numeric,
  value_json        jsonb,                       -- for composite anchors e.g. {hr, pace, power}
  unit              text not null,
  confidence        numeric not null check (confidence between 0 and 1),
  provenance        provenance not null,
  sample_size       integer,
  source_activity_ids uuid[],
  measured_at       timestamptz not null,
  superseded_at     timestamptz,                 -- null = current
  created_at        timestamptz not null default now()
);
create index on athlete_anchors (athlete_id, anchor_type, sport, superseded_at);

-- Materialised current model, refreshed by reconcile.ts. Read path optimisation only.
create table athlete_model_current (
  athlete_id        uuid primary key references profiles(id) on delete cascade,
  model             jsonb not null,              -- AthleteModel, see §2.1
  combined_confidence numeric not null,
  computed_at       timestamptz not null default now()
);

-- Zone sets (03-ALGORITHM.md §3). Stored, never recomputed at render time.
create table athlete_zones (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references profiles(id) on delete cascade,
  sport             sport not null,
  modality          text not null check (modality in ('hr','pace','power')),
  anchor_mode       text not null check (anchor_mode in ('threshold_anchored','hrr_fallback')),
  zones             jsonb not null,
  valid_from        timestamptz not null default now(),
  valid_to          timestamptz,
  created_at        timestamptz not null default now()
);
create index on athlete_zones (athlete_id, sport, modality, valid_to);

-- ---------------------------------------------------------------------------
-- INTEGRATIONS
-- ---------------------------------------------------------------------------
create table integrations (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references profiles(id) on delete cascade,
  provider          provider not null,
  provider_user_id  text,
  access_token_ref  text,        -- Supabase Vault secret reference — NEVER the token
  refresh_token_ref text,
  scopes            text[],
  connected_at      timestamptz not null default now(),
  last_sync_at      timestamptz,
  last_sync_status  text,
  consent_at        timestamptz not null,
  revoked_at        timestamptz,
  unique (athlete_id, provider)
);

create table sync_log (
  id                bigserial primary key,
  athlete_id        uuid not null references profiles(id) on delete cascade,
  provider          provider not null,
  job               text not null,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  activities_seen   integer default 0,
  activities_new    integer default 0,
  outcome           text,
  error             text
);
create index on sync_log (athlete_id, started_at desc);

-- ---------------------------------------------------------------------------
-- ACTIVITIES
-- ---------------------------------------------------------------------------
create table activities (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references profiles(id) on delete cascade,
  sport             sport not null,
  sub_sport         text,
  start_time        timestamptz not null,
  local_tz_offset_min integer not null,
  duration_s        integer not null,
  moving_time_s     integer,
  distance_m        numeric,
  elevation_gain_m  numeric,

  -- summary metrics
  avg_hr            integer,
  max_hr            integer,
  avg_power_w       numeric,
  normalized_power_w numeric,
  avg_speed_mps     numeric,
  avg_gap_speed_mps numeric,          -- grade-adjusted, run only
  avg_cadence       numeric,
  swim_avg_pace_s_per_100m numeric,
  swim_stroke_count integer,

  -- environment (needed for heat handling and load interpretation)
  temperature_c     numeric,
  humidity_pct      numeric,
  avg_altitude_m    numeric,

  -- load (03-ALGORITHM.md §5) — all three, always, where computable
  external_load     numeric,           -- sport-specific TSS
  internal_load     numeric,           -- zone-weighted TRIMP
  perceived_load    numeric,           -- sRPE × minutes
  rpe               smallint check (rpe between 0 and 10),
  load_disagreement numeric,

  -- distribution accounting (§3.4)
  session_goal_zone session_goal,
  time_in_s1_s      integer,
  time_in_s2_s      integer,
  time_in_s3_s      integer,

  -- durability (§11)
  decoupling_pct    numeric,
  decoupling_valid  boolean default false,

  -- data quality
  hr_source         text check (hr_source in ('chest_strap','optical','none')),
  has_rr_intervals  boolean not null default false,
  has_streams       boolean not null default false,

  -- provenance / dedupe
  primary_provider  provider not null,
  provider_activity_id text,
  is_duplicate_of   uuid references activities(id),

  planned_workout_id uuid,             -- FK added after workouts table
  created_at        timestamptz not null default now(),
  unique (primary_provider, provider_activity_id)
);
create index on activities (athlete_id, start_time desc);
create index on activities (athlete_id, sport, start_time desc);
create index on activities (athlete_id, start_time) where is_duplicate_of is null;

create table activity_sources (
  activity_id       uuid not null references activities(id) on delete cascade,
  provider          provider not null,
  provider_activity_id text not null,
  ingested_at       timestamptz not null default now(),
  primary key (activity_id, provider)
);

create table activity_laps (
  id                uuid primary key default gen_random_uuid(),
  activity_id       uuid not null references activities(id) on delete cascade,
  lap_index         integer not null,
  start_offset_s    integer not null,
  duration_s        integer not null,
  distance_m        numeric,
  avg_hr            integer,
  avg_power_w       numeric,
  avg_speed_mps     numeric,
  unique (activity_id, lap_index)
);

-- Streams are large. Compressed, lazy-loaded, never touched by list views.
create table activity_streams (
  activity_id       uuid primary key references activities(id) on delete cascade,
  sample_rate_hz    numeric not null default 1,
  time_s            bytea,
  hr                bytea,
  rr_intervals      bytea,      -- required for DFA-a1 (§6.1)
  power_w           bytea,
  speed_mps         bytea,
  altitude_m        bytea,
  latlng            bytea,
  cadence           bytea,
  temperature_c     bytea,
  compression       text not null default 'zstd',
  created_at        timestamptz not null default now()
);

-- Mean-maximal curves, cached per athlete/sport. Feeds CP fitting (§6.3).
create table mean_max_curves (
  athlete_id        uuid not null references profiles(id) on delete cascade,
  sport             sport not null,
  metric            text not null check (metric in ('power','speed')),
  window_start      date not null,
  window_end        date not null,
  curve             jsonb not null,     -- [{duration_s, value, activity_id, date}]
  computed_at       timestamptz not null default now(),
  primary key (athlete_id, sport, metric, window_start, window_end)
);

-- ---------------------------------------------------------------------------
-- DAILY METRICS  (§5.2, §10.1)
-- ---------------------------------------------------------------------------
create table daily_metrics (
  athlete_id        uuid not null references profiles(id) on delete cascade,
  date              date not null,
  ctl_total         numeric,
  atl_total         numeric,
  tsb_total         numeric,
  ctl_by_sport      jsonb,              -- {"run": 42.1, "bike": 55.0, "swim": 12.3}
  daily_load        numeric,
  monotony          numeric,
  strain            numeric,
  -- wellness inputs
  hrv_rmssd         numeric,
  hrv_rolling_7d    numeric,
  hrv_baseline_60d  numeric,
  hrv_baseline_sd   numeric,
  resting_hr        integer,
  sleep_duration_min integer,
  sleep_score       numeric,
  body_mass_kg      numeric,
  wellness_fatigue  smallint check (wellness_fatigue between 1 and 5),
  wellness_soreness smallint check (wellness_soreness between 1 and 5),
  wellness_stress   smallint check (wellness_stress between 1 and 5),
  wellness_mood     smallint check (wellness_mood between 1 and 5),
  illness_flag      boolean not null default false,
  injury_flag       boolean not null default false,
  injury_region     text,
  -- derived
  readiness_score   numeric,
  readiness_band    text check (readiness_band in ('below','within','above','unknown')),
  readiness_inputs  jsonb,              -- component breakdown, shown in UI
  primary key (athlete_id, date)
);

-- ---------------------------------------------------------------------------
-- RACES  (§9)
-- ---------------------------------------------------------------------------
create table races (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references profiles(id) on delete cascade,
  name              text not null,
  race_date         date not null,
  start_time_local  time,
  priority          race_priority not null,
  event_type        text not null,      -- 'sprint_tri','olympic_tri','70.3','ironman','5k',...
  distance_swim_m   numeric,
  distance_bike_m   numeric,
  distance_run_m    numeric,
  elevation_bike_m  numeric,
  elevation_run_m   numeric,
  location          text,
  expected_temp_c   numeric,            -- drives heat block (§7.4)
  expected_humidity_pct numeric,
  goal_time_s       integer,
  result_time_s     integer,
  result_notes      text,
  created_at        timestamptz not null default now()
);
create index on races (athlete_id, race_date);

-- ---------------------------------------------------------------------------
-- PLANS  (§8)
-- ---------------------------------------------------------------------------
create table training_plans (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references profiles(id) on delete cascade,
  primary_race_id   uuid references races(id),
  name              text not null,
  start_date        date not null,
  end_date          date not null,
  status            text not null default 'active'
                      check (status in ('active','completed','paused','archived')),
  -- generation inputs, snapshotted so a plan can always be explained
  model_snapshot    jsonb not null,     -- AthleteModel at generation time
  availability_snapshot jsonb not null,
  distribution_policy jsonb not null,   -- resolved §4.2 targets by phase
  engine_version    text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table plan_weeks (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references training_plans(id) on delete cascade,
  week_number       integer not null,
  week_start_date   date not null,
  phase             plan_phase not null,
  is_recovery_week  boolean not null default false,
  focus             text,
  load_target       numeric not null,
  hours_target      numeric not null,
  distribution_target jsonb not null,   -- {"S1":80,"S2":15,"S3":5}
  distribution_actual jsonb,
  load_actual       numeric,
  ramp_vs_prior_pct numeric,
  contains_race_id  uuid references races(id),
  unique (plan_id, week_number)
);
create index on plan_weeks (plan_id, week_start_date);

create table workouts (
  id                uuid primary key default gen_random_uuid(),
  plan_week_id      uuid references plan_weeks(id) on delete cascade,
  plan_id           uuid references training_plans(id) on delete cascade,
  athlete_id        uuid not null references profiles(id) on delete cascade,
  scheduled_date    date not null,
  sport             sport not null,
  template_id       text not null,
  name              text not null,
  description       text,
  purpose           session_purpose not null,
  goal_zone         session_goal not null,
  is_key_session    boolean not null default false,
  planned_duration_min integer not null,
  planned_load      numeric not null,
  -- structure: see 05-INTEGRATIONS.md §5 for the canonical JSON shape
  structure         jsonb not null,
  status            workout_status not null default 'scheduled',
  completed_activity_id uuid references activities(id),
  original_scheduled_date date,        -- set when moved
  original_load     numeric,           -- set when adapted
  pushed_to_device_at timestamptz,
  device_workout_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on workouts (athlete_id, scheduled_date);
create index on workouts (plan_week_id);
alter table activities add constraint fk_activities_workout
  foreign key (planned_workout_id) references workouts(id);

-- Every plan change, ever. This table is the product's credibility. (§02 obs.)
create table plan_mutations (
  id                bigserial primary key,
  athlete_id        uuid not null references profiles(id) on delete cascade,
  plan_id           uuid not null references training_plans(id) on delete cascade,
  occurred_at       timestamptz not null default now(),
  actor             text not null check (actor in ('engine','athlete','coach','system')),
  reason_code       text not null,     -- machine-readable, e.g. 'READINESS_2DAY_LOW'
  reason_text       text not null,     -- athlete-facing sentence
  rule_id           text,              -- which §10.2 / §10.3 rule fired
  affected_workout_ids uuid[],
  affected_week_ids uuid[],
  before            jsonb,
  after             jsonb,
  engine_inputs     jsonb              -- what the engine saw when it decided
);
create index on plan_mutations (athlete_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- FIELD TESTS  (§12)
-- ---------------------------------------------------------------------------
create table field_tests (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references profiles(id) on delete cascade,
  workout_id        uuid references workouts(id),
  sport             sport not null,
  protocol          text not null,     -- '30min_tt','3min_all_out','cp_12_3','20min_tt','css_400_200','lt1_steps'
  scheduled_date    date,
  completed_at      timestamptz,
  status            text not null default 'scheduled'
                      check (status in ('scheduled','completed','postponed','failed_quality')),
  raw_result        jsonb,
  derived_anchor_ids uuid[],
  quality_notes     text
);

-- ---------------------------------------------------------------------------
-- COACH MODE — schema present, UI disabled in v1 (D1)
-- ---------------------------------------------------------------------------
create table coach_athlete_relationships (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid not null references profiles(id) on delete cascade,
  athlete_id        uuid not null references profiles(id) on delete cascade,
  status            text not null default 'pending'
                      check (status in ('pending','active','ended')),
  permissions       jsonb not null default '{"view":true,"edit_plan":false}',
  created_at        timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table notifications (
  id                bigserial primary key,
  athlete_id        uuid not null references profiles(id) on delete cascade,
  kind              text not null,
  title             text not null,
  body              text not null,
  deep_link         text,
  plan_mutation_id  bigint references plan_mutations(id),
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index on notifications (athlete_id, created_at desc) where read_at is null;
