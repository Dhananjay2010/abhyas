-- Fix yoga sessions incorrectly marked as skipped.
--
-- Bug: closeStaleSessions marked sessions without working sets as "skipped".
-- Yoga sessions have no session_exercises or session_sets, so they were
-- incorrectly skipped even when the user completed them (set yoga_video_id).
--
-- This migration fixes existing rows. The code fix in close-stale.ts prevents
-- future occurrences.

UPDATE sessions
SET 
  status = 'completed',
  completed_at = COALESCE(completed_at, updated_at, created_at, now())
WHERE status = 'skipped'
  AND actual_type = 'yoga'
  AND yoga_video_id IS NOT NULL;

-- Grant no change: this migration only updates data in the sessions table,
-- which already has RLS policies and grants from 20260908090100_rls_and_triggers.sql
