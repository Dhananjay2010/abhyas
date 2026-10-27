#!/usr/bin/env bash
# Test: migration 040 is idempotent
# Verifies that migration 040 can be re-applied cleanly on an already-migrated database.
# This test runs only in CI on a dedicated stack where all migrations are already applied.

set -euo pipefail

# Ensure this script only runs with REAL_DB=1 and proper DB safety guards
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⚠️  Skipping migration-040-idempotent test (REAL_DB not set)"
  exit 0
fi

# Import and call DB reset guard (HIGH-1 requirement)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-db-reset-guard.sh"

# Check guard before any DB operations
if ! check_db_reset_guard_bash check supabase/config.toml; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain supabase/config.toml
  exit 1
fi

echo "✓ DB reset guard check passed"

echo "Testing migration 040 idempotency"
echo "=================================="

# Check for psql
if ! command -v psql &> /dev/null; then
  echo "❌ psql not found (required for testing migrations)"
  exit 1
fi

# HIGH-1: Require SUPABASE_DB_URL outside CI (never derive from supabase status)
if [ "${CI:-}" != "true" ]; then
  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "❌ SUPABASE_DB_URL must be set outside CI"
    echo "   This prevents accidental operations on the shared local DB"
    exit 1
  fi
  DB_URL="$SUPABASE_DB_URL"
else
  # In CI, use SUPABASE_DB_URL or fall back to default
  DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
  echo "CI: Using DB_URL: ${DB_URL%%\?*}"
fi

if [ -z "$DB_URL" ]; then
  echo "❌ No database connection available"
  exit 1
fi

echo "✓ Database connection: ${DB_URL%%\?*}"

# In CI, the stack already has all migrations applied by earlier steps.
# We don't reset - we just verify that 040 can be re-applied twice.

# Step 0: Set branding data on one test gym (so "data survived" check proves something)
echo ""
echo "Step 0: Setting test branding data on one gym..."

TEST_GYM_ID=$(psql "$DB_URL" -t -c "
  SELECT id FROM public.gyms LIMIT 1;
" | xargs || echo "")

if [ -z "$TEST_GYM_ID" ]; then
  echo "❌ No test gym found to set branding data"
  exit 1
fi

echo "Test gym ID: $TEST_GYM_ID"

# Set branding data via UPDATE (direct postgres access is fine in CI-only script)
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
  UPDATE public.gyms 
  SET display_name = 'Test Branded Gym',
      logo_url = 'https://example.com/test-logo.png',
      primary_color = '#1E3A8A',
      accent_color = '#3B82F6'
  WHERE id = '$TEST_GYM_ID';
" > /dev/null

echo "✓ Test branding data set on gym $TEST_GYM_ID"

# Step 1: Capture current state before re-applying 040
echo ""
echo "Step 1: Capturing current state..."

# Capture the test gym's branding data
TEST_GYM_BRANDING=$(psql "$DB_URL" -t -c "
  SELECT display_name, logo_url, primary_color, accent_color
  FROM public.gyms 
  WHERE id = '$TEST_GYM_ID';
" | xargs || echo "")

echo "Test gym branding before: $TEST_GYM_BRANDING"

if [ -z "$TEST_GYM_BRANDING" ]; then
  echo "❌ Failed to capture test gym branding data"
  exit 1
fi

# Check if any test gyms have branding data (should be at least 1 now)
GYMS_WITH_BRANDING=$(psql "$DB_URL" -t -c "
  SELECT count(*) FROM public.gyms 
  WHERE display_name IS NOT NULL 
     OR logo_url IS NOT NULL 
     OR primary_color IS NOT NULL 
     OR accent_color IS NOT NULL;
" | xargs || echo "0")

echo "Gyms with branding data: $GYMS_WITH_BRANDING"

if [ "$GYMS_WITH_BRANDING" -lt "1" ]; then
  echo "❌ Expected at least 1 gym with branding data after Step 0"
  exit 1
fi

# Capture set_gym_branding grants before re-applying
SET_GRANTS_BEFORE=$(psql "$DB_URL" -t -c "
  SELECT array_agg(grantee::text ORDER BY grantee::text)::text
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'set_gym_branding'
    AND privilege_type = 'EXECUTE';
" | xargs || echo "")

echo "set_gym_branding grants before: $SET_GRANTS_BEFORE"

# Capture get_gym_brand grants before re-applying
GET_GRANTS_BEFORE=$(psql "$DB_URL" -t -c "
  SELECT array_agg(grantee::text ORDER BY grantee::text)::text
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'get_gym_brand'
    AND privilege_type = 'EXECUTE';
" | xargs || echo "")

echo "get_gym_brand grants before: $GET_GRANTS_BEFORE"

# Step 2: Apply migration 040 (first re-application)
echo ""
echo "Step 2: Re-applying migration 040 (first time)..."
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000040_gym_branding.sql > /dev/null 2>&1; then
  echo "❌ Migration 040 failed on first re-application (not idempotent)"
  exit 1
fi
echo "✓ Migration 040 re-applied successfully (first time)"

# Step 3: Verify grants unchanged after first re-application
echo ""
echo "Step 3: Verifying grants unchanged after first re-application..."

SET_GRANTS_AFTER=$(psql "$DB_URL" -t -c "
  SELECT array_agg(grantee::text ORDER BY grantee::text)::text
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'set_gym_branding'
    AND privilege_type = 'EXECUTE';
" | xargs || echo "")

if [ "$SET_GRANTS_BEFORE" != "$SET_GRANTS_AFTER" ]; then
  echo "❌ set_gym_branding grants changed"
  echo "   Before: $SET_GRANTS_BEFORE"
  echo "   After:  $SET_GRANTS_AFTER"
  exit 1
fi
echo "✓ set_gym_branding grants unchanged"

GET_GRANTS_AFTER=$(psql "$DB_URL" -t -c "
  SELECT array_agg(grantee::text ORDER BY grantee::text)::text
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'get_gym_brand'
    AND privilege_type = 'EXECUTE';
" | xargs || echo "")

if [ "$GET_GRANTS_BEFORE" != "$GET_GRANTS_AFTER" ]; then
  echo "❌ get_gym_brand grants changed"
  echo "   Before: $GET_GRANTS_BEFORE"
  echo "   After:  $GET_GRANTS_AFTER"
  exit 1
fi
echo "✓ get_gym_brand grants unchanged"

# Step 4: Verify CHECK constraints still exist
echo ""
echo "Step 4: Verifying CHECK constraints..."
for constraint in gyms_primary_color_hex gyms_accent_color_hex gyms_logo_url_format; do
  EXISTS=$(psql "$DB_URL" -t -c "
    SELECT count(*) 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
      AND table_name = 'gyms' 
      AND constraint_name = '$constraint'
      AND constraint_type = 'CHECK';
  " | xargs || echo "0")
  
  if [ "$EXISTS" != "1" ]; then
    echo "❌ CHECK constraint $constraint not found after first re-application"
    exit 1
  fi
done
echo "✓ All CHECK constraints still exist"

# Step 5: Verify existing branding data survived
echo ""
echo "Step 5: Verifying existing branding data survived..."

# Check the specific test gym's branding data
TEST_GYM_BRANDING_AFTER=$(psql "$DB_URL" -t -c "
  SELECT display_name, logo_url, primary_color, accent_color
  FROM public.gyms 
  WHERE id = '$TEST_GYM_ID';
" | xargs || echo "")

echo "Test gym branding after: $TEST_GYM_BRANDING_AFTER"

if [ "$TEST_GYM_BRANDING" != "$TEST_GYM_BRANDING_AFTER" ]; then
  echo "❌ Test gym branding data changed"
  echo "   Before: $TEST_GYM_BRANDING"
  echo "   After:  $TEST_GYM_BRANDING_AFTER"
  exit 1
fi
echo "✓ Test gym branding data unchanged"

# Check overall count
GYMS_WITH_BRANDING_AFTER=$(psql "$DB_URL" -t -c "
  SELECT count(*) FROM public.gyms 
  WHERE display_name IS NOT NULL 
     OR logo_url IS NOT NULL 
     OR primary_color IS NOT NULL 
     OR accent_color IS NOT NULL;
" | xargs || echo "0")

if [ "$GYMS_WITH_BRANDING" != "$GYMS_WITH_BRANDING_AFTER" ]; then
  echo "❌ Branding data count changed"
  echo "   Before: $GYMS_WITH_BRANDING gyms"
  echo "   After:  $GYMS_WITH_BRANDING_AFTER gyms"
  exit 1
fi
echo "✓ Existing branding data survived (count unchanged: $GYMS_WITH_BRANDING gyms)"

# Step 6: Apply migration 040 again (second re-application)
echo ""
echo "Step 6: Re-applying migration 040 (second time)..."
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000040_gym_branding.sql > /dev/null 2>&1; then
  echo "❌ Migration 040 failed on second re-application (not idempotent)"
  exit 1
fi
echo "✓ Migration 040 re-applied successfully (second time)"

# Step 7: Final verification
echo ""
echo "Step 7: Final verification..."

# Verify get_gym_brand returns 7 columns
RETURN_TYPE=$(psql "$DB_URL" -t -c "
  SELECT pg_get_function_result(oid) 
  FROM pg_proc 
  WHERE proname = 'get_gym_brand' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" | xargs || echo "")

if [[ ! "$RETURN_TYPE" =~ "display_name" ]] || [[ ! "$RETURN_TYPE" =~ "primary_color" ]] || [[ ! "$RETURN_TYPE" =~ "accent_color" ]]; then
  echo "❌ get_gym_brand does not return brand columns"
  echo "   Expected: display_name, logo_url, primary_color, accent_color"
  echo "   Got: $RETURN_TYPE"
  exit 1
fi
echo "✓ get_gym_brand returns correct columns"

# Verify set_gym_branding exists
BRANDING_FUNC=$(psql "$DB_URL" -t -c "
  SELECT proname 
  FROM pg_proc 
  WHERE proname = 'set_gym_branding' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" | xargs || echo "")

if [ "$BRANDING_FUNC" != "set_gym_branding" ]; then
  echo "❌ set_gym_branding function not found"
  exit 1
fi
echo "✓ set_gym_branding function exists"

# Verify test gym's branding data is still unchanged after second re-application
TEST_GYM_BRANDING_FINAL=$(psql "$DB_URL" -t -c "
  SELECT display_name, logo_url, primary_color, accent_color
  FROM public.gyms 
  WHERE id = '$TEST_GYM_ID';
" | xargs || echo "")

if [ "$TEST_GYM_BRANDING" != "$TEST_GYM_BRANDING_FINAL" ]; then
  echo "❌ Test gym branding data changed after second re-application"
  echo "   Before: $TEST_GYM_BRANDING"
  echo "   After:  $TEST_GYM_BRANDING_FINAL"
  exit 1
fi
echo "✓ Test gym branding data unchanged after both re-applications"

echo ""
echo "✅ All migration 040 idempotency tests passed"
echo "   - Migration 040 can be re-applied twice on an already-migrated database"
echo "   - Functions, grants, and CHECK constraints remain unchanged"
echo "   - Existing branding data survives both re-applications (verified with test gym)"
