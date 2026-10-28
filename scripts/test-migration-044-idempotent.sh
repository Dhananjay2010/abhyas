#!/usr/bin/env bash
# Test: migration 044 is idempotent
# Verifies that migration 044 can be re-applied cleanly on an already-migrated database.
# This test runs only in CI on a dedicated stack where all migrations are already applied.

set -euo pipefail

# Ensure this script only runs with REAL_DB=1 and proper DB safety guards
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⚠️  Skipping migration-044-idempotent test (REAL_DB not set)"
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

echo "Testing migration 044 idempotency"
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
# We don't reset - we just verify that 044 can be re-applied twice.

# Step 0: Create a test user and provision a test gym (so "data survived" check proves something)
echo ""
echo "Step 0: Creating test user and provisioning test gym..."

TEST_USER_EMAIL="idempotent-test-044-$(date +%s)@example.com"
TEST_GYM_SLUG="idempotent-test-044-$(date +%s)"

# Create test user via auth.users
TEST_USER_ID=$(psql "$DB_URL" -qtAX -c "
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    '$TEST_USER_EMAIL',
    crypt('test-password-123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{\"provider\":\"email\",\"providers\":[\"email\"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ) RETURNING id;
" || echo "")

if [ -z "$TEST_USER_ID" ]; then
  echo "❌ Failed to create test user"
  exit 1
fi

echo "Test user ID: $TEST_USER_ID"
echo "Test user email: $TEST_USER_EMAIL"

# Provision test gym via provision_gym RPC (using service_role via postgres direct)
TEST_GYM_RESULT=$(psql "$DB_URL" -qtAX -c "
  SELECT public.provision_gym(
    'Idempotent Test Gym',
    '$TEST_GYM_SLUG',
    'Asia/Kolkata',
    '$TEST_USER_EMAIL',
    'Test Display Name',
    '#FF6B35',
    '#C1440E',
    'https://example.com/test-logo.png'
  )::text;
" || echo "")

echo "Provision result: $TEST_GYM_RESULT"

if [ -z "$TEST_GYM_RESULT" ]; then
  echo "❌ Failed to provision test gym"
  exit 1
fi

# Extract gym_id from JSON result
TEST_GYM_ID=$(echo "$TEST_GYM_RESULT" | grep -oP '"gym_id"\s*:\s*"\K[^"]+' || echo "")

if [ -z "$TEST_GYM_ID" ]; then
  echo "❌ Failed to extract gym_id from provision result"
  exit 1
fi

echo "Test gym ID: $TEST_GYM_ID"
echo "✓ Test gym provisioned"

# Step 1: Capture current state before re-applying 044
echo ""
echo "Step 1: Capturing current state..."

# Capture provision_gym function definition
FUNCTION_DEF_BEFORE=$(psql "$DB_URL" -qtAX -c "
  SELECT pg_get_functiondef(oid)
  FROM pg_proc
  WHERE proname = 'provision_gym'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" || echo "")

if [ -z "$FUNCTION_DEF_BEFORE" ]; then
  echo "❌ Failed to capture provision_gym function definition"
  exit 1
fi

echo "✓ Captured provision_gym function definition"

# Capture provision_gym grants
GRANTS_BEFORE=$(psql "$DB_URL" -qtAX -c "
  SELECT array_agg(grantee::text ORDER BY grantee::text)::text
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'provision_gym'
    AND privilege_type = 'EXECUTE';
" || echo "")

echo "provision_gym grants before: $GRANTS_BEFORE"

# Capture the test gym's data
TEST_GYM_DATA=$(psql "$DB_URL" -qtAX -c "
  SELECT name, slug, timezone, display_name, primary_color, accent_color, logo_url
  FROM public.gyms
  WHERE id = '$TEST_GYM_ID';
" || echo "")

echo "Test gym data before: $TEST_GYM_DATA"

if [ -z "$TEST_GYM_DATA" ]; then
  echo "❌ Failed to capture test gym data"
  exit 1
fi

# Capture the test gym's owner membership
TEST_MEMBERSHIP_DATA=$(psql "$DB_URL" -qtAX -c "
  SELECT role, status
  FROM public.gym_memberships
  WHERE gym_id = '$TEST_GYM_ID' AND user_id = '$TEST_USER_ID';
" || echo "")

echo "Test membership data before: $TEST_MEMBERSHIP_DATA"

if [ -z "$TEST_MEMBERSHIP_DATA" ]; then
  echo "❌ Failed to capture test membership data"
  exit 1
fi

# Step 2: Apply migration 044 (first re-application)
echo ""
echo "Step 2: Re-applying migration 044 (first time)..."
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000044_provision_gym.sql > /dev/null 2>&1; then
  echo "❌ Migration 044 failed on first re-application (not idempotent)"
  exit 1
fi
echo "✓ Migration 044 re-applied successfully (first time)"

# Step 3: Verify function definition unchanged after first re-application
echo ""
echo "Step 3: Verifying function definition unchanged after first re-application..."

FUNCTION_DEF_AFTER=$(psql "$DB_URL" -qtAX -c "
  SELECT pg_get_functiondef(oid)
  FROM pg_proc
  WHERE proname = 'provision_gym'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" || echo "")

if [ "$FUNCTION_DEF_BEFORE" != "$FUNCTION_DEF_AFTER" ]; then
  echo "❌ provision_gym function definition changed"
  exit 1
fi
echo "✓ provision_gym function definition unchanged"

# Step 4: Verify grants unchanged after first re-application
echo ""
echo "Step 4: Verifying grants unchanged after first re-application..."

GRANTS_AFTER=$(psql "$DB_URL" -qtAX -c "
  SELECT array_agg(grantee::text ORDER BY grantee::text)::text
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'provision_gym'
    AND privilege_type = 'EXECUTE';
" || echo "")

if [ "$GRANTS_BEFORE" != "$GRANTS_AFTER" ]; then
  echo "❌ provision_gym grants changed"
  echo "   Before: $GRANTS_BEFORE"
  echo "   After:  $GRANTS_AFTER"
  exit 1
fi
echo "✓ provision_gym grants unchanged"

# Step 5: Verify existing gym and membership data survived
echo ""
echo "Step 5: Verifying existing gym and membership data survived..."

# Check the specific test gym's data
TEST_GYM_DATA_AFTER=$(psql "$DB_URL" -qtAX -c "
  SELECT name, slug, timezone, display_name, primary_color, accent_color, logo_url
  FROM public.gyms
  WHERE id = '$TEST_GYM_ID';
" || echo "")

echo "Test gym data after: $TEST_GYM_DATA_AFTER"

if [ "$TEST_GYM_DATA" != "$TEST_GYM_DATA_AFTER" ]; then
  echo "❌ Test gym data changed"
  echo "   Before: $TEST_GYM_DATA"
  echo "   After:  $TEST_GYM_DATA_AFTER"
  exit 1
fi
echo "✓ Test gym data unchanged"

# Check the test membership data
TEST_MEMBERSHIP_DATA_AFTER=$(psql "$DB_URL" -qtAX -c "
  SELECT role, status
  FROM public.gym_memberships
  WHERE gym_id = '$TEST_GYM_ID' AND user_id = '$TEST_USER_ID';
" || echo "")

if [ "$TEST_MEMBERSHIP_DATA" != "$TEST_MEMBERSHIP_DATA_AFTER" ]; then
  echo "❌ Test membership data changed"
  echo "   Before: $TEST_MEMBERSHIP_DATA"
  echo "   After:  $TEST_MEMBERSHIP_DATA_AFTER"
  exit 1
fi
echo "✓ Test membership data unchanged"

# Step 6: Apply migration 044 again (second re-application)
echo ""
echo "Step 6: Re-applying migration 044 (second time)..."
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000044_provision_gym.sql > /dev/null 2>&1; then
  echo "❌ Migration 044 failed on second re-application (not idempotent)"
  exit 1
fi
echo "✓ Migration 044 re-applied successfully (second time)"

# Step 7: Final verification
echo ""
echo "Step 7: Final verification..."

# Verify provision_gym exists and has correct signature
FUNCTION_EXISTS=$(psql "$DB_URL" -qtAX -c "
  SELECT proname
  FROM pg_proc
  WHERE proname = 'provision_gym'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" || echo "")

if [ "$FUNCTION_EXISTS" != "provision_gym" ]; then
  echo "❌ provision_gym function not found"
  exit 1
fi
echo "✓ provision_gym function exists"

# Verify prosecdef is true and proconfig contains search_path=""
PROSECDEF=$(psql "$DB_URL" -qtAX -c "
  SELECT prosecdef
  FROM pg_proc
  WHERE proname = 'provision_gym'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" || echo "")

if [ "$PROSECDEF" != "t" ]; then
  echo "❌ provision_gym prosecdef is not true"
  exit 1
fi
echo "✓ provision_gym is SECURITY DEFINER"

PROCONFIG_CHECK=$(psql "$DB_URL" -qtAX -c "
  SELECT 'search_path=\"\"' = any(proconfig)
  FROM pg_proc
  WHERE proname = 'provision_gym'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" || echo "")

if [[ "$PROCONFIG_CHECK" != "t" ]]; then
  echo "❌ provision_gym proconfig does not contain search_path=\"\""
  echo "   Got: $PROCONFIG_CHECK"
  exit 1
fi
echo "✓ provision_gym has search_path=\"\" in proconfig"

PROOWNER=$(psql "$DB_URL" -qtAX -c "
  SELECT pg_get_userbyid(proowner) FROM pg_proc
  WHERE proname = 'provision_gym'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" || echo "")

if [[ "$PROOWNER" != "postgres" ]]; then
  echo "❌ provision_gym owner is not postgres (got: $PROOWNER)"
  exit 1
fi
echo "✓ provision_gym owned by postgres"

# Check grants
ANON_GRANT=$(psql "$DB_URL" -qtAX -c "SELECT has_function_privilege('anon', 'public.provision_gym(text,text,text,text,text,text,text,text)', 'execute');" || echo "")
AUTH_GRANT=$(psql "$DB_URL" -qtAX -c "SELECT has_function_privilege('authenticated', 'public.provision_gym(text,text,text,text,text,text,text,text)', 'execute');" || echo "")
SERVICE_GRANT=$(psql "$DB_URL" -qtAX -c "SELECT has_function_privilege('service_role', 'public.provision_gym(text,text,text,text,text,text,text,text)', 'execute');" || echo "")

if [[ "$ANON_GRANT" != "f" ]]; then
  echo "❌ anon should not have execute privilege on provision_gym"
  echo "   Got: $ANON_GRANT"
  exit 1
fi

if [[ "$AUTH_GRANT" != "f" ]]; then
  echo "❌ authenticated should not have execute privilege on provision_gym"
  echo "   Got: $AUTH_GRANT"
  exit 1
fi

if [[ "$SERVICE_GRANT" != "t" ]]; then
  echo "❌ service_role should have execute privilege on provision_gym"
  echo "   Got: $SERVICE_GRANT"
  exit 1
fi
echo "✓ Grants correct: anon=f, authenticated=f, service_role=t"

# Verify test gym's data is still unchanged after second re-application
TEST_GYM_DATA_FINAL=$(psql "$DB_URL" -qtAX -c "
  SELECT name, slug, timezone, display_name, primary_color, accent_color, logo_url
  FROM public.gyms
  WHERE id = '$TEST_GYM_ID';
" || echo "")

if [ "$TEST_GYM_DATA" != "$TEST_GYM_DATA_FINAL" ]; then
  echo "❌ Test gym data changed after second re-application"
  echo "   Before: $TEST_GYM_DATA"
  echo "   After:  $TEST_GYM_DATA_FINAL"
  exit 1
fi
echo "✓ Test gym data unchanged after both re-applications"

# Verify re-running provision_gym on the same slug is idempotent
echo ""
echo "Step 8: Verifying provision_gym idempotency on same slug..."

REPROVISION_RESULT=$(psql "$DB_URL" -qtAX -c "
  SELECT public.provision_gym(
    'Idempotent Test Gym Updated',
    '$TEST_GYM_SLUG',
    'America/New_York',
    '$TEST_USER_EMAIL'
  )::text;
" || echo "")

echo "Re-provision result: $REPROVISION_RESULT"

# Check that created is false
if [[ ! "$REPROVISION_RESULT" =~ '"created"'[[:space:]]*:[[:space:]]*false ]]; then
  echo "❌ Re-provisioning same slug did not return created:false"
  exit 1
fi
echo "✓ Re-provisioning same slug returns created:false"

# Verify no duplicate gym rows
GYM_COUNT=$(psql "$DB_URL" -qtAX -c "
  SELECT count(*)
  FROM public.gyms
  WHERE slug = '$TEST_GYM_SLUG';
" || echo "0")

if [ "$GYM_COUNT" != "1" ]; then
  echo "❌ Found $GYM_COUNT gym rows with slug $TEST_GYM_SLUG (expected 1)"
  exit 1
fi
echo "✓ No duplicate gym rows"

# Verify no duplicate membership rows
MEMBERSHIP_COUNT=$(psql "$DB_URL" -qtAX -c "
  SELECT count(*)
  FROM public.gym_memberships
  WHERE gym_id = '$TEST_GYM_ID' AND user_id = '$TEST_USER_ID';
" || echo "0")

if [ "$MEMBERSHIP_COUNT" != "1" ]; then
  echo "❌ Found $MEMBERSHIP_COUNT membership rows (expected 1)"
  exit 1
fi
echo "✓ No duplicate membership rows"

# Cleanup: delete test gym and user
echo ""
echo "Cleaning up test data..."
psql "$DB_URL" -c "DELETE FROM public.gyms WHERE id = '$TEST_GYM_ID';" > /dev/null 2>&1
psql "$DB_URL" -c "DELETE FROM auth.users WHERE id = '$TEST_USER_ID';" > /dev/null 2>&1
echo "✓ Cleanup complete"

echo ""
echo "✅ All migration 044 idempotency tests passed"
echo "   - Migration 044 can be re-applied twice on an already-migrated database"
echo "   - Function definition and grants remain unchanged"
echo "   - Existing gym and membership data survives both re-applications"
echo "   - Re-provisioning with same slug is idempotent (created:false, no duplicates)"
