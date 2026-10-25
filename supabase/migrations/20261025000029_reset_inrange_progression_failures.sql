-- Reset consecutive_failures for exercises with in-range sessions counted as misses
--
-- BUG FIX: The progression rule before this fix counted any session not at the top
-- of the rep range (e.g. 10 reps in 8-12) as a failure and incremented consecutive_failures.
-- 
-- SPEC §Progression states: "Stay at a weight until you hit the top of the rep range on 
-- every set" and "Stall rule: miss the target twice in a row → automatically drop ~10% and 
-- build back." A 'miss' is read as below repsMin or incomplete sets. In-range sessions 
-- (all sets >= repsMin but not all at top) should hold the weight and reset consecutiveFailures.
--
-- This migration resets ALL rows with consecutive_failures > 0 to 0 for all users. 
-- TRADE-OFF: This includes rows at 2 failures (would have deloaded next session) and real 
-- misses (below repsMin or incomplete). This is an accepted trade-off in the safe direction: 
-- it forgets at most one or two real misses per exercise, preventing incorrect deloads. 
-- The alternative (keeping incorrect failure counts from in-range sessions) would trigger 
-- premature ~10% deloads after two normal in-range sessions.
--
-- Idempotent: can run multiple times safely.
-- Prod-safe: only resets failure counters, does not change weights or targets.

UPDATE public.exercise_progress
SET consecutive_failures = 0
WHERE consecutive_failures > 0;
