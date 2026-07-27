-- =============================================================================
-- TriFlow — 0007 same-day doubles availability (spec r2, §7.2b)
--
-- The r2 revision of 03-ALGORITHM.md adds §7.2b, sub-threshold volume and same-day session
-- splitting. Splitting is gated on the athlete having declared that they can train twice in a
-- day with a real gap between the bouts — the engine must never assume same-day doubles, which
-- are a life constraint before they are a training one.
--
-- Two columns rather than one: "can you double" and "how far apart" are different questions, and
-- §7.2b requires ≥5 h between the halves. An athlete who can train twice but only 90 minutes
-- apart does not qualify, and the engine needs to be able to tell them why.
-- =============================================================================

alter table athlete_availability
  add column if not exists doubles_declared boolean not null default false,
  add column if not exists max_same_day_gap_hours numeric;

comment on column athlete_availability.doubles_declared is
  'Athlete can train twice in one day (spec r2 §7.2b). Never inferred.';
comment on column athlete_availability.max_same_day_gap_hours is
  'Largest gap between two trainable slots on one day. §7.2b needs >= 5 h to permit a split.';
