-- Migration: Session length requires explicit save during onboarding
-- Date: 2026-10-25
-- 
-- This migration removes the DB default and NOT NULL constraint on preferred_session_minutes so that:
-- 1. The onboarding step only counts as 'done' once the user explicitly saves it
-- 2. The UI can default to 45 minutes instead of inheriting a DB default of 60
-- 3. Reloading /onboarding will land on the session-length step until the user saves
--
-- Existing users who already completed onboarding are unaffected because they have
-- a saved value from their explicit choice during onboarding.
--
-- New users created after this migration will have NULL until they explicitly save the value
-- during onboarding. The check constraint from migration 000019 still applies once a value
-- is set (must be 30, 45, 60, or 75).

-- Remove NOT NULL constraint
ALTER TABLE profiles ALTER COLUMN preferred_session_minutes DROP NOT NULL;

-- Drop the DB default
ALTER TABLE profiles ALTER COLUMN preferred_session_minutes DROP DEFAULT;
