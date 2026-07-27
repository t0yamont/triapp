# Records of processing (Art. 30)

Required by `spec/02-ARCHITECTURE.md` §7. This is the internal register: what we process, why, who
sees it, and how long we keep it. Unlike the privacy policy it is written for a regulator or an
auditor, not for an athlete, so it names tables.

**Controller:** ‹TO BE COMPLETED› · **Last reviewed:** 27 July 2026

## Processing activities

### 1. Account and identity

- **Purpose:** provide an account; age-gate at 16+; apply the athlete's units, timezone and week
  start to everything else.
- **Categories of data:** email (held by Supabase Auth), display name, date of birth, sex,
  timezone, units, week start, training age.
- **Data subjects:** registered athletes.
- **Basis:** contract; age verification is a legal requirement for offering the service.
- **Storage:** `auth.users`, `public.profiles`.
- **Retention:** life of the account.

### 2. Health and fitness processing — special category

- **Purpose:** derive the athlete's physiological model, build and adapt a training plan.
- **Categories of data:** heart rate, heart-rate variability, resting heart rate, sleep duration
  and score, body mass, self-reported fatigue/soreness/stress/mood, illness and injury flags and
  injury region, plus every completed activity and its full sensor streams.
- **Basis:** **explicit consent** (Art. 9(2)(a)), versioned and timestamped in
  `profiles.health_data_consent_at` / `health_data_consent_version`.
- **Storage:** `daily_metrics`, `activities`, `activity_streams`, `activity_laps`,
  `activity_sources`, `mean_max_curves`, `athlete_anchors`, `athlete_model_current`,
  `athlete_zones`, `field_tests`.
- **Retention:** life of the account; deleted on erasure.

### 3. Plan generation and adaptation

- **Purpose:** produce and maintain the athlete's plan; be able to explain every change to it.
- **Categories:** planned sessions, week structure, and an audit row for every mutation recording
  the actor, a machine-readable reason code, the athlete-facing sentence, the rule that fired, and
  the engine's inputs at the time.
- **Basis:** contract; the audit row additionally serves the athlete's own interest in an
  explanation, and is included in their export.
- **Storage:** `training_plans`, `plan_weeks`, `workouts`, `plan_mutations`, `races`.
- **Retention:** life of the account. §8 asks for the decision log to be retained indefinitely; in
  practice that means "for as long as the account exists", because erasure takes precedence.

### 4. Provider connections

- **Purpose:** import training and recovery data; push planned workouts to a device.
- **Categories:** provider identity, the athlete's id at that provider, granted scopes, connection
  and revocation timestamps, and **references** to credentials held in Supabase Vault.
- **Basis:** separate explicit consent per provider, recorded in `integrations.consent_at`.
- **Storage:** `integrations`, `sync_log`.
- **Retention:** until disconnected or the account is erased. Erasure returns the credential
  references so access can be revoked at the provider, not merely forgotten locally.

### 5. Operational logging

- **Purpose:** keep the service running; detect failed syncs and failed nightly recomputes.
- **Categories:** account identifier, job name, duration, outcome, error message. **No health
  data, no credentials** — enforced by `withJobLog`, which records an error's message only.
- **Basis:** legitimate interests (service availability and security).
- **Storage:** platform logs, plus `sync_log` for provider syncs.
- **Retention:** platform default; short.

### 6. Coaching relationships — scaffolded, not active

- **Status:** the schema and RLS policies support a coach reading a consenting athlete's data.
  No coach features ship in v1 and the UI entry is disabled. When it ships, it becomes its own
  entry here with its own consent step.
- **Storage:** `coach_athlete_relationships`.

## Recipients

Only the sub-processors listed in [`sub-processors.md`](./sub-processors.md).

## Technical and organisational measures

- Row-level security on all 21 tables, so a query cannot return another athlete's rows. Tested by
  `supabase/tests/rls_isolation.sql`.
- Service-role credentials are server-only and throw if read in a browser.
- Provider credentials in Supabase Vault; the database holds references only.
- Erasure is verified by re-counting every table after the delete, not assumed from a successful
  statement.
- The export's table coverage is asserted against the live migrations in CI, so a new table cannot
  silently fall out of a subject-access response.

## International transfers

‹TO BE COMPLETED once the deployed regions are confirmed. Target: UK/EU regions for both Supabase
and Vercel, with no routine transfer outside the UK/EEA. Provider integrations may involve
transfers — each must be assessed before it ships.›
