-- Bounds on a logged set.
--
-- `logSet` now validates before writing, and the runner validates before
-- calling it, but neither is where the data lives. These constraints are the
-- copy that holds when something writes to the table by another route.
--
-- The values match src/lib/session/validation.ts and are deliberately
-- generous: they reject what cannot be a set rather than policing training.
-- 500 kg is above the heaviest lift ever recorded; 100 reps covers any sane
-- high-rep set.
--
-- Zero reps is excluded on purpose. It is not a set, and storing it caused
-- real harm: evaluateProgression counts only sets with reps > 0, so a stray
-- zero made a completed exercise look like a missed one, and two in a row drop
-- the working weight by ten percent.
--
-- NOT VALID would let existing rows through, but this table has none that
-- violate the rules, so they are validated immediately.

alter table session_sets
  add constraint session_sets_reps_sane
    check (reps is null or (reps >= 1 and reps <= 100)),
  add constraint session_sets_weight_sane
    check (weight_kg is null or (weight_kg >= 0 and weight_kg <= 500)),
  add constraint session_sets_duration_sane
    check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 86400));

-- Body weight is already validated in logBodyWeight and saveAboutYou; this
-- gives that rule the same backstop.
alter table body_metrics
  add constraint body_metrics_weight_sane
    check (weight_kg is null or (weight_kg >= 25 and weight_kg <= 300));
