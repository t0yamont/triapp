-- Add the two provenance tiers the engine gained after the initial schema was written.
--
-- `css_test` (0.65) and `riegel_prediction` (0.60) were added to PROVENANCE_CONFIDENCE in
-- physio/constants.ts by D-GOAL-TIME-CSS, but the database enum was never extended — so any
-- attempt to persist an anchor or estimate carrying either would have failed at runtime with
-- an enum violation. Nothing had tried yet, because nothing wrote an athlete model at all;
-- D-ATHLETE-MODEL surfaced it.
--
-- `alter type ... add value` is transactional-safe in PG12+ and idempotent with `if not exists`.

alter type provenance add value if not exists 'css_test';
alter type provenance add value if not exists 'riegel_prediction';
