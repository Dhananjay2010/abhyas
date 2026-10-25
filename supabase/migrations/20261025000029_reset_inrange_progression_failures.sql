-- Reset consecutive_failures for exercises with in-range sessions counted as misses
--
-- BUG FIX: The progression rule before this fix counted any session not at the top
-- of the rep range (e.g. 10 reps in 8-12) as a failure and incremented consecutive_failures.
-- The SPEC requires: "All prescribed sets completed and every set's reps >= repsMin (in range),
-- but not all at the top: HOLD the weight and reset consecutiveFailures to 0."
--
-- This migration resets all consecutive_failures > 0 to 0. This is the safe direction:
-- it forgets at most one real miss per exercise, which prevents incorrect deloads.
-- The alternative (keeping incorrect failure counts) would trigger premature ~10% deloads
-- after two normal in-range sessions.
--
-- Idempotent: can run multiple times safely.
-- Prod-safe: only resets failure counters, does not change weights or targets.

UPDATE public.exercise_progress
SET consecutive_failures = 0
WHERE consecutive_failures > 0;
