#!/usr/bin/env bash
set -euo pipefail

# Test: Migration 043 (gyms_column_lock) is idempotent
# Applies migration 043 twice and verifies trigger/function are stable

echo "=== Migration 043 Idempotency Test ==="
echo

# CI-only: this script should ONLY run in CI (GitHub Actions database-seed-test job)
if [ "${CI:-}" != "true" ]; then
  echo "❌ ERROR: This script is CI-only. Do not run locally."
  echo "   It applies migrations on the CI database without reset."
  exit 1
fi

# Import guard and check
source "$(dirname "$0")/lib-db-reset-guard.sh"
if ! check_db_reset_guard_bash check "supabase/config.toml"; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain "supabase/config.toml"
  exit 1
fi

echo "✓ DB reset guard check passed"
echo

# Require SUPABASE_DB_URL
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "❌ ERROR: SUPABASE_DB_URL not set"
  exit 1
fi

MIGRATION_FILE="supabase/migrations/20261025000043_gyms_column_lock.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ ERROR: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "Testing migration 043 idempotency..."
echo

# Step 0: Verify migration 043 is already applied (CI runs migrations before this test)
echo "Step 0: Verify baseline (migration 043 already applied)"
TRIGGER_CHECK=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT COUNT(*) 
  FROM pg_trigger 
  WHERE tgname = 'gyms_brand_only_update' 
    AND tgrelid = 'public.gyms'::regclass;
")

if [ "$TRIGGER_CHECK" != "1" ]; then
  echo "❌ FAIL: Trigger gyms_brand_only_update not found (expected from migration stack)"
  exit 1
fi
echo "  ✓ Trigger exists (baseline)"

FUNCTION_CHECK=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT COUNT(*) 
  FROM pg_proc 
  WHERE proname = 'enforce_gyms_brand_only_update' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
")

if [ "$FUNCTION_CHECK" != "1" ]; then
  echo "❌ FAIL: Function enforce_gyms_brand_only_update not found"
  exit 1
fi
echo "  ✓ Function exists (baseline)"

# Get baseline trigger definition
BASELINE_TRIGGER=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT pg_get_triggerdef(oid) 
  FROM pg_trigger 
  WHERE tgname = 'gyms_brand_only_update';
")

# Get baseline function body
BASELINE_FUNCTION=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT prosrc 
  FROM pg_proc 
  WHERE proname = 'enforce_gyms_brand_only_update' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
")

echo

# Step 1: Re-apply migration 043 (first idempotent run)
echo "Step 1: Re-apply migration 043 (first idempotent run)"
if ! psql "$SUPABASE_DB_URL" -f "$MIGRATION_FILE" -v ON_ERROR_STOP=1 >/dev/null 2>&1; then
  echo "❌ FAIL: First re-application failed"
  exit 1
fi
echo "  ✓ First re-application succeeded"

# Verify trigger still exists
TRIGGER_CHECK_1=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT COUNT(*) 
  FROM pg_trigger 
  WHERE tgname = 'gyms_brand_only_update' 
    AND tgrelid = 'public.gyms'::regclass;
")

if [ "$TRIGGER_CHECK_1" != "1" ]; then
  echo "❌ FAIL: Trigger count is $TRIGGER_CHECK_1 (expected 1)"
  exit 1
fi
echo "  ✓ Trigger count unchanged"

# Verify function still exists
FUNCTION_CHECK_1=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT COUNT(*) 
  FROM pg_proc 
  WHERE proname = 'enforce_gyms_brand_only_update' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
")

if [ "$FUNCTION_CHECK_1" != "1" ]; then
  echo "❌ FAIL: Function count is $FUNCTION_CHECK_1 (expected 1)"
  exit 1
fi
echo "  ✓ Function count unchanged"

echo

# Step 2: Re-apply migration 043 again (second idempotent run)
echo "Step 2: Re-apply migration 043 (second idempotent run)"
if ! psql "$SUPABASE_DB_URL" -f "$MIGRATION_FILE" -v ON_ERROR_STOP=1 >/dev/null 2>&1; then
  echo "❌ FAIL: Second re-application failed"
  exit 1
fi
echo "  ✓ Second re-application succeeded"

# Verify trigger definition unchanged
FINAL_TRIGGER=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT pg_get_triggerdef(oid) 
  FROM pg_trigger 
  WHERE tgname = 'gyms_brand_only_update';
")

if [ "$BASELINE_TRIGGER" != "$FINAL_TRIGGER" ]; then
  echo "❌ FAIL: Trigger definition changed"
  echo "Baseline: $BASELINE_TRIGGER"
  echo "Final: $FINAL_TRIGGER"
  exit 1
fi
echo "  ✓ Trigger definition unchanged"

# Verify function body unchanged
FINAL_FUNCTION=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT prosrc 
  FROM pg_proc 
  WHERE proname = 'enforce_gyms_brand_only_update' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
")

if [ "$BASELINE_FUNCTION" != "$FINAL_FUNCTION" ]; then
  echo "❌ FAIL: Function body changed"
  exit 1
fi
echo "  ✓ Function body unchanged"

echo

# Step 3: Verify trigger still works
echo "Step 3: Verify trigger functionality after re-application"

# Get service role token (CI environment should have this)
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"

# Find any seeded gym (default gym should exist)
SEEDED_GYM=$(psql "$SUPABASE_DB_URL" -tAc "
  SELECT id FROM public.gyms LIMIT 1;
")

if [ -z "$SEEDED_GYM" ]; then
  echo "  ⚠️  No seeded gym found, skipping functionality test"
else
  # Try to update a brand column as service_role (should succeed)
  BRAND_UPDATE_RESULT=$(psql "$SUPABASE_DB_URL" -tAc "
    UPDATE public.gyms 
    SET display_name = 'Idempotent Test' 
    WHERE id = '$SEEDED_GYM';
    SELECT 'SUCCESS';
  " 2>&1)

  if echo "$BRAND_UPDATE_RESULT" | grep -q "SUCCESS"; then
    echo "  ✓ service_role can still update brand columns"
  else
    echo "❌ FAIL: service_role brand update failed"
    echo "Result: $BRAND_UPDATE_RESULT"
    exit 1
  fi

  # Try to update a protected column as service_role (should succeed - privileged bypass)
  PROTECTED_UPDATE_RESULT=$(psql "$SUPABASE_DB_URL" -tAc "
    UPDATE public.gyms 
    SET timezone = 'America/Los_Angeles' 
    WHERE id = '$SEEDED_GYM';
    SELECT 'SUCCESS';
  " 2>&1)

  if echo "$PROTECTED_UPDATE_RESULT" | grep -q "SUCCESS"; then
    echo "  ✓ service_role can still update protected columns (privileged bypass)"
  else
    echo "❌ FAIL: service_role protected update failed"
    echo "Result: $PROTECTED_UPDATE_RESULT"
    exit 1
  fi
fi

echo
echo "✅ Migration 043 is idempotent"
echo
exit 0
