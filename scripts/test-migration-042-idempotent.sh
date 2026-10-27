#!/usr/bin/env bash
# Test: migration 042 is idempotent
# Verifies that migration 042 can be re-applied cleanly on an already-migrated database.
# This test runs only in CI on a dedicated stack where all migrations are already applied.

set -euo pipefail

# Ensure this script only runs with REAL_DB=1 and proper DB safety guards
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⚠️  Skipping migration-042-idempotent test (REAL_DB not set)"
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

echo "Testing migration 042 idempotency"
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
# We don't reset - we just verify that 042 can be re-applied.

# Step 1: Apply migration 042 (re-application)
echo ""
echo "Step 1: Re-applying migration 042..."
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000042_gym_join_codes_perf.sql > /dev/null 2>&1; then
  echo "❌ Migration 042 failed on re-application (not idempotent)"
  exit 1
fi
echo "✓ Migration 042 re-applied successfully"

# Step 2: Verify redeem_join_code still exists
echo ""
echo "Step 2: Verifying redeem_join_code function exists..."

REDEEM_FUNC=$(psql "$DB_URL" -t -c "
  SELECT proname 
  FROM pg_proc 
  WHERE proname = 'redeem_join_code' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" | xargs || echo "")

if [ "$REDEEM_FUNC" != "redeem_join_code" ]; then
  echo "❌ redeem_join_code function not found after re-application"
  exit 1
fi
echo "✓ redeem_join_code function exists"

# Step 3: Verify EXECUTE grant to authenticated (and NOT to anon)
echo ""
echo "Step 3: Verifying grants on redeem_join_code..."

# Check authenticated has EXECUTE
AUTH_GRANT=$(psql "$DB_URL" -t -c "
  SELECT count(*) 
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'redeem_join_code'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'authenticated';
" | xargs || echo "0")

if [ "$AUTH_GRANT" != "1" ]; then
  echo "❌ authenticated does not have EXECUTE on redeem_join_code"
  exit 1
fi
echo "✓ authenticated has EXECUTE on redeem_join_code"

# Check anon does NOT have EXECUTE
ANON_GRANT=$(psql "$DB_URL" -t -c "
  SELECT count(*) 
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'redeem_join_code'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'anon';
" | xargs || echo "0")

if [ "$ANON_GRANT" != "0" ]; then
  echo "❌ anon should NOT have EXECUTE on redeem_join_code"
  exit 1
fi
echo "✓ anon does not have EXECUTE on redeem_join_code (correct)"

# Step 4: Verify gym_join_codes SELECT policy exists
echo ""
echo "Step 4: Verifying gym_join_codes_select policy..."

SELECT_POLICY=$(psql "$DB_URL" -t -c "
  SELECT count(*) 
  FROM pg_policies 
  WHERE schemaname = 'public' 
    AND tablename = 'gym_join_codes' 
    AND policyname = 'gym_join_codes_select';
" | xargs || echo "0")

if [ "$SELECT_POLICY" != "1" ]; then
  echo "❌ gym_join_codes_select policy not found"
  exit 1
fi
echo "✓ gym_join_codes_select policy exists"

# Step 5: Verify gym_join_codes_created_by_idx index exists
echo ""
echo "Step 5: Verifying gym_join_codes_created_by_idx index..."

INDEX_EXISTS=$(psql "$DB_URL" -t -c "
  SELECT count(*) 
  FROM pg_indexes 
  WHERE schemaname = 'public' 
    AND tablename = 'gym_join_codes' 
    AND indexname = 'gym_join_codes_created_by_idx';
" | xargs || echo "0")

if [ "$INDEX_EXISTS" != "1" ]; then
  echo "❌ gym_join_codes_created_by_idx index not found"
  exit 1
fi
echo "✓ gym_join_codes_created_by_idx index exists"

echo ""
echo "✅ All migration 042 idempotency tests passed"
echo "   - Migration 042 can be re-applied on an already-migrated database"
echo "   - redeem_join_code function exists with correct grants"
echo "   - SELECT policy and created_by index remain intact"
