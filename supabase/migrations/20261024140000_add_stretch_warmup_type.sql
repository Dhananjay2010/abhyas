-- Add 'stretch' type to warmup_type enum for cool-down exercises
-- This migration only adds the enum value to avoid transaction conflicts
-- Data changes that use this value are in migration 20261024110100

-- Idempotent: checks if value exists before adding
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'warmup_type' AND e.enumlabel = 'stretch'
  ) THEN
    ALTER TYPE warmup_type ADD VALUE 'stretch';
  END IF;
END $$;
